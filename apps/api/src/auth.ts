import type { FastifyReply, FastifyRequest } from "fastify";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { pool } from "./db.js";
import {
  capabilitiesForRole,
  type CollectionsCapability,
} from "./authorization.js";

// Everything about WHO can log in and WHETHER their password is right is
// Clerk's problem, not ours (see db/migrations/0002_clerk_auth.sql for why).
// Our job starts after Clerk has already verified them: given a Clerk user
// id, look up which builder they belong to (or whether they're Perfect
// Solutions staff with cross-builder access) — that mapping lives only in
// our own database.

export type Identity =
  | {
      kind: "staff";
      staffId: string;
      fullName: string | null;
      role: string;
      capabilities: ReadonlySet<CollectionsCapability>;
    }
  | {
      kind: "builder";
      builderUserId: string;
      builderId: string;
      fullName: string | null;
      role: string;
      capabilities: ReadonlySet<CollectionsCapability>;
    };

declare module "fastify" {
  interface FastifyRequest {
    identity?: Identity;
  }
}

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkClient = clerkSecretKey ? createClerkClient({ secretKey: clerkSecretKey }) : null;

async function lookupIdentity(clerkUserId: string): Promise<Identity | null> {
  if (!pool) return null;

  const staff = await pool.query(
    "select id, full_name, role from staff_users where clerk_user_id = $1",
    [clerkUserId]
  );
  if (staff.rows.length > 0) {
    const row = staff.rows[0];
    return {
      kind: "staff",
      staffId: row.id,
      fullName: row.full_name,
      role: row.role,
      capabilities: capabilitiesForRole(row.role),
    };
  }

  const builderUser = await pool.query(
    "select id, builder_id, full_name, role from builder_users where clerk_user_id = $1",
    [clerkUserId]
  );
  if (builderUser.rows.length > 0) {
    const row = builderUser.rows[0];
    return {
      kind: "builder",
      builderUserId: row.id,
      builderId: row.builder_id,
      fullName: row.full_name,
      role: row.role,
      capabilities: capabilitiesForRole(row.role),
    };
  }

  return null;
}

// Fastify preHandler hook: verifies the Clerk session token on every
// protected route, then resolves it to our own builder/staff identity.
// Never trusts a builder_id or "is staff" claim sent by the client itself —
// only what this lookup, driven by Clerk's verified user id, produces.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!clerkClient || !clerkSecretKey) {
    reply.code(500).send({ error: "Auth is not configured on this server yet (CLERK_SECRET_KEY missing)." });
    return reply;
  }

  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    reply.code(401).send({ error: "No session token provided." });
    return reply;
  }

  let clerkUserId: string;
  try {
    const verified = await verifyToken(token, { secretKey: clerkSecretKey });
    clerkUserId = verified.sub;
  } catch {
    reply.code(401).send({ error: "Session token is invalid or expired." });
    return reply;
  }

  const identity = await lookupIdentity(clerkUserId);
  if (!identity) {
    reply.code(403).send({
      error: "Logged in, but this account isn't set up in Perfect Solutions yet. Ask a staff member to add you.",
    });
    return reply;
  }

  request.identity = identity;
}

export function requireCapability(capability: CollectionsCapability) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.identity?.capabilities.has(capability)) {
      return reply.code(403).send({
        error: `This account does not have the ${capability} capability.`,
      });
    }
  };
}

// Runs `fn` with a database client whose row-level-security session
// variables are set to match `identity` — every query inside `fn` is then
// automatically scoped by Postgres itself, not by remembering a WHERE
// clause. See db/migrations/0001_init.sql.
export async function withTenantClient<T>(
  identity: Identity,
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  if (!pool) throw new Error("No database connected.");
  const client = await pool.connect();
  try {
    // set_config(..., true) means "local to the current transaction" — that
    // third argument is deliberate: it's what lets us reset these safely
    // just by ending the transaction, instead of having to remember to
    // clear them before this pooled connection gets reused by some other
    // request. But that only works if the set_config calls and the actual
    // query in fn() run inside the SAME transaction — each bare
    // client.query() call is its own auto-committed transaction by default,
    // so without this explicit begin/commit, the "local" setting reverts
    // before fn() ever runs and every query below sees no builder scope at
    // all. Caught by running apps/api/tests/isolation.test.ts for real
    // against a local Postgres — before this fix, is_staff and
    // current_builder_id were both back to unset by the time the real
    // query ran, for every identity, every time.
    await client.query("begin");
    try {
      if (identity.kind === "staff") {
        await client.query("select set_config('app.is_staff', 'true', true)");
        await client.query("select set_config('app.current_builder_id', '', true)");
      } else {
        await client.query("select set_config('app.is_staff', '', true)");
        await client.query("select set_config('app.current_builder_id', $1, true)", [identity.builderId]);
      }
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    }
  } finally {
    client.release();
  }
}
