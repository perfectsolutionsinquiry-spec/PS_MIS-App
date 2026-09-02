-- 0001_init.sql
--
-- Real domain schema (v2 — expanded from the minimal 3-table proof-of-concept
-- after discussion with Azhar). Two kinds of logins:
--   staff_users    Perfect Solutions' own employees. NOT tied to one builder —
--                  they can see every builder's data (set app.is_staff='true').
--   builder_users  A builder's own admins/CRM staff. Scoped to their own
--                  builder_id only.
-- Every tenant-scoped table carries builder_id directly (even towers/payment
-- schedules, which could be derived through project_id) so the same simple
-- row-level-security rule applies everywhere without needing a join.
--
-- Run this against a real Postgres instance, e.g. via Neon's SQL Editor, or:
--   psql "$DATABASE_URL" -f db/migrations/0001_init.sql

create extension if not exists pgcrypto;

-- Reference data: banks Perfect Solutions works with. Shared across the
-- whole platform, not tied to one builder, so no row-level security here.
create table banks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  contact_phone text,
  contact_email text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- The tenant itself — one row per builder partner ("Builder Profile").
-- Every other tenant-scoped table's builder_id points back here.
create table builders (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  registered_address  text,
  gstin               text,
  pan                 text,
  contact_name        text,
  contact_phone       text,
  contact_email       text,
  created_at          timestamptz not null default now()
);

-- Perfect Solutions' own employees. Cross-builder access by design.
create table staff_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  full_name     text,
  role          text not null default 'staff',
  created_at    timestamptz not null default now()
);

-- A builder's own login users (their admins / CRM employees).
create table builder_users (
  id            uuid primary key default gen_random_uuid(),
  builder_id    uuid not null references builders(id) on delete cascade,
  email         text not null unique,
  password_hash text not null,
  full_name     text,
  role          text not null default 'admin',
  created_at    timestamptz not null default now()
);

create table bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  builder_id      uuid not null references builders(id) on delete cascade,
  bank_id         uuid references banks(id),
  account_name    text not null,
  account_number  text not null,
  ifsc            text,
  notes           text,
  created_at      timestamptz not null default now()
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  builder_id  uuid not null references builders(id) on delete cascade,
  name        text not null,
  location    text,
  total_area  numeric,
  created_at  timestamptz not null default now()
);

create table towers (
  id            uuid primary key default gen_random_uuid(),
  builder_id    uuid not null references builders(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  name          text not null,
  total_units   integer,
  saleable_area numeric,
  map_url       text,
  created_at    timestamptz not null default now()
);

create table payment_schedules (
  id           uuid primary key default gen_random_uuid(),
  builder_id   uuid not null references builders(id) on delete cascade,
  tower_id     uuid not null references towers(id) on delete cascade,
  milestone    text not null,
  percent_due  numeric not null,
  due_date     date,
  created_at   timestamptz not null default now()
);

create table customers (
  id          uuid primary key default gen_random_uuid(),
  builder_id  uuid not null references builders(id) on delete cascade,
  tower_id    uuid references towers(id),
  full_name   text not null,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);

-- Row-level security. The API sets these once per request, right after it
-- verifies who's logged in:
--   select set_config('app.current_builder_id', $1, true);   -- builder login
--   select set_config('app.is_staff', 'true', true);         -- staff login
-- Every query on that connection is then scoped automatically, even if the
-- application code forgets a WHERE clause. A staff login sees everything; a
-- builder login sees only rows where builder_id matches its own.

do $$
declare
  t text;
begin
  foreach t in array array['builder_users','bank_accounts','projects','towers','payment_schedules','customers']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_isolated on %I using (
         coalesce(current_setting(''app.is_staff'', true), '''') = ''true''
         or builder_id = current_setting(''app.current_builder_id'', true)::uuid
       )', t, t
    );
  end loop;
end $$;

-- banks and staff_users are intentionally not row-level-secured: banks is
-- shared reference data, and staff_users should only ever be queried by
-- staff-only, app-level-gated code paths (nobody builder-side ever reads it).
