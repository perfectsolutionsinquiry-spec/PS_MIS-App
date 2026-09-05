// Auth provider interface — the single seam between this app and whatever
// service verifies "who is this person?".
//
// Two implementations exist:
//   - clerk.ts  — verifies JWTs issued by Clerk (cloud auth)
//   - local.ts  — verifies JWTs issued by this API itself (self-hosted auth)
//
// To add a third provider (Auth0, Supabase Auth, Firebase, Keycloak…):
//   1. Implement this interface in a new file
//   2. Register it in factory.ts
//   3. Set AUTH_PROVIDER to its name in the environment
// No route code changes needed.

import type { FastifyReply, FastifyRequest } from "fastify";
import {
  capabilitiesForRole,
  type CollectionsCapability,
} from "../authorization.js";

export interface AuthProvider {
  /** Human-readable name for logs/errors. */
  readonly name: string;

  /**
   * Verify a Bearer session token and return the verified user id (the same
   * id stored in staff_users.auth_user_id / builder_users.auth_user_id).
   * Returns null if the token is invalid or expired. Throws only when the
   * provider itself is misconfigured (e.g. a missing secret key).
   */
  verifyToken(token: string): Promise<string | null>;

  /**
   * Create a session token for a user. Only used by the local provider's
   * /auth/login route — Clerk issues its own tokens via its hosted flow.
   */
  issueToken?(userId: string): Promise<string>;
}

/**
 * The Fastify preHandler hook that every protected route uses. Delegates
 * token verification to the configured provider, then resolves the verified
 * user id to our own staff/builder identity in the database.
 */
export function makeRequireAuth(provider: AuthProvider) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      reply.code(401).send({ error: "No session token provided." });
      return reply;
    }

    let userId: string | null;
    try {
      userId = await provider.verifyToken(token);
    } catch (err) {
      // A throw here means the provider itself is misconfigured (e.g. a
      // missing secret key), not that this particular token is bad.
      reply.code(500).send({
        error: `Auth is not configured on this server yet. ${(err as Error).message}`,
      });
      return reply;
    }
    if (!userId) {
      reply.code(401).send({ error: "Session token is invalid or expired." });
      return reply;
    }

    const identity = await lookupIdentity(userId);
    if (!identity) {
      reply.code(403).send({
        error: "Logged in, but this account isn't set up in Perfect Solutions yet. Ask a staff member to add you.",
      });
      return reply;
    }

    request.identity = identity;
    // Named tenantContext (not Fastify's own built-in `request.context`,
    // which is reserved for Fastify's route context and cannot be
    // re-declared by an app).
    request.tenantContext = {
      applicationId: "collections",
      userId: identity.kind === "staff" ? identity.staffId : identity.builderUserId,
      tenantId: identity.kind === "staff" ? null : identity.builderId,
      correlationId: request.id,
      identity,
      capabilities: identity.capabilities,
    };
  };
}

// --- Identity resolution (shared by every provider) ---

import { database } from "../db.js";

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

export type RequestContext = {
  applicationId: "collections";
  userId: string;
  tenantId: string | null;
  correlationId: string;
  identity: Identity;
  capabilities: ReadonlySet<CollectionsCapability>;
};

declare module "fastify" {
  interface FastifyRequest {
    identity?: Identity;
    // `context` itself is taken by Fastify's route context, so the app's
    // tenant-aware request context gets its own, unambiguous name.
    tenantContext?: RequestContext;
  }
}

async function lookupIdentity(authUserId: string): Promise<Identity | null> {
  if (!database) return null;

  const staff = await database.query(
    "select id, full_name, role from staff_users where auth_user_id = $1",
    [authUserId]
  );
  if (staff.rows.length > 0) {
    const row = staff.rows[0];
    return {
      kind: "staff",
      staffId: row.id,
      fullName: row.full_name,
      role: row.role,
      // staff_users is already the trusted local staff identity boundary.
      // Preserve the existing staff access model while the free-text role
      // column is migrated to explicit capabilities later.
      capabilities: capabilitiesForRole("platform_staff"),
    };
  }

  const builderUser = await database.query(
    "select id, builder_id, full_name, role from builder_users where auth_user_id = $1",
    [authUserId]
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

// Runs `fn` with a database client whose row-level-security session
// variables are set to match the request context — every query inside `fn`
// is then automatically scoped by Postgres itself, not by remembering a
// WHERE clause. See db/migrations/0001_init.sql.
export async function withTenantClient<T>(
  context: RequestContext,
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  if (!database) throw new Error("No database connected.");
  const client = await database.connect();
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
      if (context.identity.kind === "staff") {
        await client.query("select set_config('app.is_staff', 'true', true)");
        await client.query("select set_config('app.current_builder_id', '', true)");
      } else {
        await client.query("select set_config('app.is_staff', '', true)");
        await client.query("select set_config('app.current_builder_id', $1, true)", [context.tenantId]);
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

// Logs staff access to the audit_log table (Guardrail #6 from
// docs/LAUNCH_GUARDRAILS.md). Best-effort: a logging failure must never
// block the actual request, so errors here are swallowed after logging.
// Called from route handlers where staff access happens, BEFORE the
// withTenantClient call (so the log itself is not tenant-scoped — it needs
// to record access to any builder's data, not be filtered by RLS).
export async function logStaffAccess(
  request: FastifyRequest,
  route: string,
  builderId: string | null,
  builderName: string | null
): Promise<void> {
  if (!database) return;
  const identity = request.identity;
  if (!identity || identity.kind !== "staff") return;

  try {
    // Insert directly via database (not withTenantClient) so RLS doesn't
    // filter the audit log insert — staff_id is always the accessing staff.
    await database.query(
      `insert into audit_log (staff_id, staff_email, route, builder_id, builder_name, method, ip_address)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        identity.staffId,
        identity.fullName ?? "unknown",
        route,
        builderId,
        builderName,
        request.method,
        request.ip,
      ]
    );
  } catch (err) {
    // Audit logging must never break the actual request. Log and continue.
    request.log?.error?.({ err, msg: "Failed to write audit log" });
  }
}
