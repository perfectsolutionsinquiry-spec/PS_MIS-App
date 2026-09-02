import Fastify from "fastify";
import { dbPing } from "./db.js";

// RULE FOR THIS WHOLE APP: every route here is the only place that decides
// anything that matters — access checks, calculations, who owns which row.
// The frontend (apps/web, added later) only ever displays what this API
// hands it and never enforces authorization or computes a figure on its own.
// See docs/DEPLOY_PLAN.md and claude/Platform Plan - Architecture Options and
// Costs.md in the project for why.

const app = Fastify({ logger: true });

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

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
