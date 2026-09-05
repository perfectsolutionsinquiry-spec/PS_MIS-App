// Local auth provider — self-hosted username/password auth.
// Enabled with AUTH_PROVIDER=local.
//
// This lets the app run entirely on-premise (no Clerk, no external auth
// service). Passwords are stored as scrypt hashes in the database, and
// sessions are JWTs signed with LOCAL_AUTH_SECRET.
//
// To use:
//   1. Set AUTH_PROVIDER=local and LOCAL_AUTH_SECRET=<random secret>
//   2. Run migration 0005_vendor_neutral_auth.sql to add password_hash columns
//   3. Set a password for each user via npm run local:set-password
//      (first login) or the /auth/set-password route (staff only)
//   4. Users log in via POST /auth/login

import type { FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { database } from "../db.js";
import { config } from "../config.js";
import type { AuthProvider } from "./provider.js";

// --- Password hashing (scrypt, no native deps) ---
// Uses Node's built-in crypto.scrypt — a memory-hard KDF, same family as
// bcrypt. Format: scrypt$N$r$p$salt$hash (hex-encoded).

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, salt, hashHex] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length, { N: n, r, p });
  return crypto.timingSafeEqual(actual, expected);
}

// --- JWT (HS256, no external deps) ---

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const headerB64 = base64url(JSON.stringify(header));
  const bodyB64 = base64url(JSON.stringify(body));
  const signature = crypto.createHmac("sha256", secret).update(`${headerB64}.${bodyB64}`).digest("base64url");
  return `${headerB64}.${bodyB64}.${signature}`;
}

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${headerB64}.${bodyB64}`).digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !crypto.timingSafeEqual(actual, expectedBuf)) return null;

  try {
    const body = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8")) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof body.exp !== "number" || body.exp < now) return null;
    return body;
  } catch {
    return null;
  }
}

// --- Provider ---

export class LocalAuthProvider implements AuthProvider {
  readonly name = "local";

  async verifyToken(token: string): Promise<string | null> {
    if (!config.localAuthSecret) {
      throw new Error("Local auth is not configured (LOCAL_AUTH_SECRET missing).");
    }

    const payload = verifyJwt(token, config.localAuthSecret);
    if (!payload || typeof payload.sub !== "string") return null;
    return payload.sub;
  }

  async issueToken(userId: string): Promise<string> {
    if (!config.localAuthSecret) {
      throw new Error("Local auth is not configured (LOCAL_AUTH_SECRET missing).");
    }
    return signJwt({ sub: userId }, config.localAuthSecret, config.localAuthTokenTtlSeconds);
  }
}

// --- Routes (registered by the factory) ---

/**
 * POST /auth/login — username/password login for local auth.
 * Body: { email, password }
 * Returns: { token, identity }
 */
export async function localLoginRoute(request: FastifyRequest, reply: FastifyReply) {
  if (!database) return reply.code(503).send({ error: "No database connected." });
  if (!config.localAuthSecret) {
    return reply.code(500).send({ error: "Local auth is not configured (LOCAL_AUTH_SECRET missing)." });
  }

  const body = (request.body ?? {}) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return reply.code(400).send({ error: "Email and password are required." });
  }

  // Look up the user by email across both staff and builder tables.
  const staff = await database.query(
    "select id, full_name, role, password_hash from staff_users where lower(email) = lower($1) and password_hash is not null",
    [body.email]
  );
  if (staff.rows.length > 0) {
    const row = staff.rows[0];
    if (!verifyPassword(body.password, row.password_hash)) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }
    const provider = new LocalAuthProvider();
    const token = await provider.issueToken(row.id);
    return {
      token,
      identity: { kind: "staff", staffId: row.id, fullName: row.full_name, role: row.role },
    };
  }

  const builderUser = await database.query(
    `select bu.id, bu.builder_id, bu.full_name, bu.role, bu.password_hash
     from builder_users bu
     left join builders b on b.id = bu.builder_id
     where (lower(bu.email) = lower($1) or lower(b.email) = lower($1))
       and bu.password_hash is not null`,
    [body.email]
  );
  if (builderUser.rows.length > 0) {
    const row = builderUser.rows[0];
    if (!verifyPassword(body.password, row.password_hash)) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }
    const provider = new LocalAuthProvider();
    const token = await provider.issueToken(row.id);
    return {
      token,
      identity: {
        kind: "builder",
        builderUserId: row.id,
        builderId: row.builder_id,
        fullName: row.full_name,
        role: row.role,
      },
    };
  }

  return reply.code(401).send({ error: "Invalid email or password." });
}

/**
 * POST /auth/set-password — set or change a user's password (local auth only).
 * Staff-only. Body: { user_id, password }
 */
export async function localSetPasswordRoute(request: FastifyRequest, reply: FastifyReply) {
  if (!database) return reply.code(503).send({ error: "No database connected." });
  if (request.identity?.kind !== "staff") {
    return reply.code(403).send({ error: "Only staff can set passwords." });
  }

  const body = (request.body ?? {}) as { user_id?: string; password?: string };
  if (!body.user_id || !body.password || body.password.length < 8) {
    return reply.code(400).send({ error: "user_id and a password of at least 8 characters are required." });
  }

  const hash = hashPassword(body.password);
  // Try staff first, then builder_users.
  const staffResult = await database.query(
    "update staff_users set password_hash = $1 where id = $2 returning id",
    [hash, body.user_id]
  );
  if (staffResult.rowCount === 0) {
    const builderResult = await database.query(
      "update builder_users set password_hash = $1 where id = $2 returning id",
      [hash, body.user_id]
    );
    if (builderResult.rowCount === 0) {
      return reply.code(404).send({ error: "User not found." });
    }
  }
  return { ok: true };
}