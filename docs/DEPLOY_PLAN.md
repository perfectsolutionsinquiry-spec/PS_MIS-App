# Deploy plan — one thing at a time

The goal of going slow here is the same reason the Platform Plan doc phases
this out over months instead of building everything at once: at 10-50
builders' financial data, a mistake compounds. Each increment below is
something we can get fully working and verified before the next one starts.

## Increment 1 — prove the pipeline works at all (in progress)

A bare API with one `/health` route, no database, no login, no real feature.
The only thing it proves is: code written here can actually reach a public
URL. Nothing else gets built until this works end to end, because every
later increment depends on this pipeline existing.

**Done in this repo already:**
- `apps/api` — Fastify + TypeScript, builds and runs, `/health` verified locally.
- `db/migrations/0001_init.sql` — builders/users/customers schema with
  row-level security, ready to run once a real Postgres exists.
- `apps/api/tests/isolation.test.ts` — the tenant-isolation test from the
  Platform Plan doc, written and ready, currently skipped because there's no
  database to run it against yet.

**Needed from you to finish increment 1:**
1. A GitHub account, and an empty repository created there (private is fine)
   for this project. If you already have one, just tell me the name.
2. A free account on Render or Railway (both have a no-card-required free
   tier suitable for this stage — tell me which you'd rather use, or I can
   walk you through picking).
3. Push this code to that GitHub repo (I can hand you the exact commands, or
   if you connect a folder on your computer to this session I can write the
   files there directly for you to push).
4. Connect the GitHub repo to Render/Railway and deploy `apps/api` — this
   gives you a real public URL like `https://perfect-solutions-api.onrender.com/health`.

Once that URL returns `{"status":"ok",...}` from the actual internet, not
just this workspace, increment 1 is done.

## Increment 2 — a real database, and the isolation test passing for real

- Provision a free/cheap managed Postgres (Render, Railway, Neon, or Supabase
  all have a usable free tier for this stage).
- Set `DATABASE_URL` on the hosted API.
- Run `db/migrations/0001_init.sql` against it.
- Run `apps/api/tests/isolation.test.ts` against it — this must pass before
  anything else gets built on top. This is "the bug that ends the company"
  test from the Platform Plan doc; it doesn't get skipped once increment 2
  starts.

## Increment 3 — real login

- Wire up Supabase Auth or Clerk (per the Platform Plan doc) so a builder can
  actually log in, rather than the API trusting a builder_id from anywhere
  the client sends.
- Every route from here on re-derives builder_id from the verified session,
  never from a request parameter.

## Increment 4 — first real screen

- One read-only page: a logged-in builder sees their own customer list and
  nothing else. This is the first piece of actual product, deliberately
  built last, after the pipeline, the database, the isolation test, and login
  all already work on their own.

## After that

Onboarding a builder, the Excel importer, receipts, the daily email, and
everything else in Phase 1/2 of the Platform Plan doc — each as its own
increment, each deployed and checked before the next starts.
