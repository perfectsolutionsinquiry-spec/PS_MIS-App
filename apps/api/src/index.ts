import Fastify from "fastify";
import cors from "@fastify/cors";
import { dbPing, pool } from "./db.js";
import { requireAuth, withTenantClient } from "./auth.js";

// RULE FOR THIS WHOLE APP: every route here is the only place that decides
// anything that matters — access checks, calculations, who owns which row.
// The frontend (apps/web) only ever displays what this API hands it and
// never enforces authorization or computes a figure on its own. See
// docs/DEPLOY_PLAN.md and claude/Platform Plan - Architecture Options and
// Costs.md in the project for why.

const app = Fastify({ logger: true });

// The frontend runs on a different URL than this API, so the browser needs
// explicit permission (CORS) to call it. Set FRONTEND_ORIGIN once the
// frontend has a real deployed URL; until then this allows any origin,
// which is fine because every route below still requires a valid Clerk
// session — an open CORS policy alone can't read anyone's data.
await app.register(cors, {
  origin: process.env.FRONTEND_ORIGIN ?? true,
});

// Increment 1: prove the pipeline (code -> git -> host -> live URL) works at
// all, before any real feature exists. This must return 200 even if no
// database is connected yet.
app.get("/health", async () => {
  return { status: "ok", service: "perfect-solutions-api", time: new Date().toISOString() };
});

// Once a real Postgres is connected (DATABASE_URL set on the host), this
// confirms the API can actually reach it.
app.get("/db-check", async () => {
  const result = await dbPing();
  return result;
});

// Increment 3: who am I? Confirms a logged-in session resolves to a real
// builder (or staff) identity in our database, not just a valid Clerk login.
app.get("/me", { preHandler: requireAuth }, async (request) => {
  return { identity: request.identity };
});

// Increment 4, first slice: a logged-in builder sees only their own
// customers. Row-level security (db/migrations/0001_init.sql) enforces this
// at the database level even if this handler had a bug — but the handler
// still never accepts a builder_id from the client, only from the verified
// session, as a second layer.
app.get("/customers", { preHandler: requireAuth }, async (request) => {
  if (!pool) return { customers: [], note: "No database connected." };
  return withTenantClient(request.identity!, async (client) => {
    // Note: the customers table's column is contact_number, not phone (see
    // db/migrations/0001_init.sql) — aliased below so the API's response
    // shape (and the frontend's Customer type) can stay as `phone` without
    // the frontend needing to know the underlying column name. Caught by
    // actually running this query against the real seeded schema locally —
    // it had been referencing a column that never existed, unnoticed
    // because the frontend didn't check /customers' response status (fixed
    // in apps/web/src/App.tsx) and silently rendered "No customers yet."
    // for what was actually a 500 error every time.
    // limit 1000 is a stopgap, not real pagination — fine while the
    // biggest builder has ~300 customers, but this needs proper
    // page/cursor params before that stops being true. Was capped at 200,
    // which silently hid 88 of Shilpkaar's 288 real customers once seed
    // data was loaded — caught by comparing the on-screen count to the row
    // count confirmed in Neon.
    const result = await client.query(
      "select id, full_name, contact_number as phone, email, stage, created_at from customers order by created_at desc limit 1000"
    );
    return { customers: result.rows };
  });
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
