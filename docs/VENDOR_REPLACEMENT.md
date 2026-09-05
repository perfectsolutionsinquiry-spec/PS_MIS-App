# Vendor Replaceability — Render, Neon, Clerk → anything else

This project is deliberately built so the three hosted services it runs on
today (Render for hosting, Neon for Postgres, Clerk for auth) can be swapped
for alternatives — including fully self-hosted equivalents — with **configuration
changes, not business-logic rewrites**.

The rule that makes this possible: **none of the business rules (tenancy, RLS,
collections math, customer lifecycle) know what vendor is underneath.** They
sit behind three thin seams:

| Vendor today | The seam | Alternative vendors / self-hosted path |
|---|---|---|
| **Render** (API + static hosting) | Plain Fastify app + Vite static build; no Render SDK anywhere | Railway, Fly.io, Vercel, AWS, or any container host — including `docker compose up` on your own/Indian server (see `docker-compose.yml`) |
| **Neon** (Postgres) | Standard `pg` driver + a `DATABASE_URL` connection string; migrations are plain `.sql` files | Supabase, RDS, any Postgres — local Docker Postgres included. `npm run migrate --workspace=apps/api` builds the schema on whatever database you point it at |
| **Clerk** (auth) | `AUTH_PROVIDER` env var selects a provider behind one interface (`apps/api/src/auth/provider.ts`, `apps/web/src/auth/`) | **Clerk** (default) or **local** (self-hosted username/password, JWT sessions) — plus any future provider (Auth0, Supabase Auth, Keycloak) by adding one file + one factory case |

---

## 1. How much work is a swap today?

| Swap | Code changes | Config changes | Data movement |
|---|---|---|---|
| Render → any host | **None** (deployment config only) | Build command + env vars on the new host | None |
| Neon → any Postgres | **None** | `DATABASE_URL` | `pg_dump`/restore (or `MIGRATE_BASELINE_UP_TO` for an empty target, then reload data) |
| Clerk → local auth | **None** (both adapters already ship) | `AUTH_PROVIDER=local`, `LOCAL_AUTH_SECRET`, run `0005` migration, set passwords | Existing `clerk_user_id` values stay put (column is renamed `auth_user_id`, values preserved) — but local sessions are brand-new logins; users sign in again |

No swap requires touching a Collections/customer/dashboard route.

---

## 2. Switching the database (Neon → anything)

1. Create the new database (managed Postgres, or `docker compose up db` locally).
2. Apply the schema:
   ```bash
   npm run migrate --workspace=apps/api
   ```
   For a brand-new database this applies every migration from scratch. For a
   **copy of the live Neon database** that a human already migrated by hand,
   tell the runner what's already applied so it doesn't re-run (and fail on)
   old migrations:
   ```bash
   MIGRATE_BASELINE_UP_TO=0004_settings_and_soft_delete.sql npm run migrate --workspace=apps/api
   ```
3. Point the API at it:
   ```
   DATABASE_URL=postgresql://user@host:5432/db
   ```
   Nothing else changes. RLS policies, tables, everything comes from the
   migrations.

> Migrations are tracked in a `schema_migrations` table, so `npm run migrate`
> is safe to run any number of times — applied files are skipped.

---

## 3. Switching hosting (Render → anything)

- **API**: it's a stock Node.js process. Build with `npm run build --workspace=apps/api`, run `node dist/index.js`. A `Dockerfile` is included (works on Railway/Fly.io, or `docker compose`).
- **Web**: a stock Vite static build (publish `apps/web/dist`). Serve with nginx (a `Dockerfile` exists) or any static host. Set these at build time: `VITE_API_URL`, `VITE_AUTH_PROVIDER`, and (only if using Clerk) `VITE_CLERK_PUBLISHABLE_KEY`.
- The one deployment gotcha is the same everywhere: `VITE_`-prefixed vars are baked into the bundle at build time, not read at runtime.

---

## 4. Switching auth (Clerk → local/self-hosted)

### 4a. Self-hosting the whole stack (local Postgres + local auth)

The repo ships a one-command path — no cloud at all:

```bash
docker compose up --build
# web  → http://localhost:8088
# api  → http://localhost:3000/health
```

Then bootstrap the first login:

```bash
# inside the repo, against the compose database:
DATABASE_URL=postgresql://ps:ps@localhost:5432/ps_mis \
LOCAL_AUTH_EMAIL=staff@yourcompany.in \
LOCAL_AUTH_PASSWORD='a-strong-password' \
npm run local:set-password --workspace=apps/api
```

Sign in at `http://localhost:8088` with that email/password.

### 4b. Switching an existing (Clerk) installation to local auth

1. Apply the schema change that makes the auth column vendor-neutral:
   ```bash
   MIGRATE_BASELINE_UP_TO=0004_settings_and_soft_delete.sql npm run migrate --workspace=apps/api
   ```
   (`0005_vendor_neutral_auth.sql` renames `clerk_user_id` → `auth_user_id`,
   preserving the existing values, and re-adds `password_hash` as a nullable
   column for local auth — both user tables already carry `email` from 0001.)
2. Set passwords for the people who need to log in, using the same
   first-login script (`npm run local:set-password`).
3. Configure the API:
   ```
   AUTH_PROVIDER=local
   LOCAL_AUTH_SECRET=<openssl rand -base64 32>
   ```
4. Rebuild the web app with `VITE_AUTH_PROVIDER=local`.
5. Done. Existing data rows are untouched; people sign in with their email +
   password instead of Clerk's hosted screen. (Existing Clerk sessions stop
   being valid — expected.)

### 4c. Adding a *future* provider (Auth0, Supabase Auth, Keycloak, …)

- **API**: implement the `AuthProvider` interface (`verifyToken` → user id) in
  a new file under `apps/api/src/auth/`, add a case in
  `apps/api/src/auth/factory.ts`. That's it — every route, RLS policy, and
  calculation stays untouched.
- **Web**: the sign-in/account surfaces live behind `apps/web/src/auth/clerk.tsx`
  + `local.tsx`. A new provider adds a sibling file and one line in
  `apps/web/src/auth/index.tsx`.

---

## 5. What this design deliberately does *not* promise

- **Not zero-downtime**: a DB swap is a backup/restore window; an auth switch
  requires re-login. Planned maintenance, not live migration.
- **Not a generic SQL abstraction**: the app speaks Postgres (RLS is a core
  part of its tenancy model). "Replaceable" means *any Postgres host*, not
  MySQL/Mongo.
- **Not automatic data sync**: Cloud→local movement is export/import, manual.

---

## 6. Files that make this possible

| File | Why it exists |
|---|---|
| `apps/api/src/config.ts` | Every vendor-switchable setting in one place (env-driven) |
| `apps/api/src/auth/provider.ts` | The `AuthProvider` interface + shared identity lookup / `withTenantClient` |
| `apps/api/src/auth/clerk.ts`, `local.ts`, `factory.ts` | The two shipped providers + the env-var switch |
| `apps/api/src/migrate.ts` | Apply migrations to **any** Postgres from the CLI (with baselining) |
| `apps/api/src/scripts/set-local-password.ts` | First-login bootstrap for local auth |
| `db/migrations/0005_vendor_neutral_auth.sql` | `clerk_user_id` → `auth_user_id` + local-auth columns |
| `apps/web/src/auth/` | Mirror seam on the frontend (`context.tsx`, `clerk.tsx`, `local.tsx`, `index.tsx`) |
| `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml` | Self-hosted / container path |
| `.env.example` | Documents every switchable variable |