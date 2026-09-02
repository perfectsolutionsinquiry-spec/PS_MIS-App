# Perfect Solutions — platform

This is the real, hosted, multi-builder version of the MIS — separate from
`Perfect Solutions - MIS Application.html` (the local, no-login, Excel-backed
tool that already exists and keeps running as-is). This repo is where Phase 1
of `claude/Platform Plan - Architecture Options and Costs.md` gets built:
Postgres with row-level security, a TypeScript API, real per-builder logins,
hosted somewhere builders can reach without opening a file.

See `docs/DEPLOY_PLAN.md` for the increment-by-increment plan we're following
("deploy one thing at a time") and exactly what's done vs. next.

## Layout

```
apps/api/          TypeScript backend (Fastify). All business logic and every
                    access-control check lives here — never in the frontend.
apps/web/           React + Vite frontend. Added in a later increment.
                    Displays what the API sends; decides nothing on its own.
packages/calc-engine/  Placeholder for porting the verified loan/collection
                    calculation engine out of the existing MIS HTML file, so
                    it's shared instead of duplicated.
db/migrations/      Plain SQL migrations, applied in order. 0001_init.sql sets
                    up builders/users/customers with tenant_id + row-level
                    security.
apps/api/tests/     Automated tests, including isolation.test.ts — the test
                    that proves one builder's login can never see another
                    builder's rows.
```

## Running the API locally

```
npm install
npm run build:api
node apps/api/dist/index.js
```

`GET /health` always returns 200, even with no database connected — that's
deliberate, it's what increment 1 deploys. `GET /db-check` reports whether
`DATABASE_URL` is set and reachable.

Copy `.env.example` to `.env` and fill in `DATABASE_URL` once a real Postgres
exists (see the deploy plan) to move past increment 1.
