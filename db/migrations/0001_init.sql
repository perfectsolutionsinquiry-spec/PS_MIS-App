-- 0001_init.sql
--
-- First real schema increment: builders (tenants), users (logins), and one
-- tenant-scoped table (customers) wired up with row-level security so that a
-- query missing its own filter returns nothing, rather than another
-- builder's data. This is the pattern from claude/Platform Plan -
-- Architecture Options and Costs.md ("Tenancy: shared DB, tenant_id +
-- Postgres RLS") and it protects against "the bug that ends the company"
-- (Builder A seeing Builder B's data) at the database layer, not just in
-- application code.
--
-- Run this against a real Postgres instance once one exists, e.g.:
--   psql "$DATABASE_URL" -f db/migrations/0001_init.sql

create extension if not exists pgcrypto;

create table builders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table users (
  id           uuid primary key default gen_random_uuid(),
  builder_id   uuid not null references builders(id) on delete cascade,
  email        text not null unique,
  password_hash text not null,
  created_at   timestamptz not null default now()
);

create table customers (
  id           uuid primary key default gen_random_uuid(),
  builder_id   uuid not null references builders(id) on delete cascade,
  full_name    text not null,
  phone        text,
  created_at   timestamptz not null default now()
);

-- The API sets this once per request, right after it verifies the logged-in
-- user's session, e.g.:
--   select set_config('app.current_builder_id', $1, true);
-- Every query that follows on this connection is then automatically scoped,
-- even if the application code forgets a WHERE clause.

alter table customers enable row level security;

create policy customers_isolated on customers
  using (builder_id = current_setting('app.current_builder_id', true)::uuid);

alter table users enable row level security;

create policy users_isolated on users
  using (builder_id = current_setting('app.current_builder_id', true)::uuid);

-- builders itself is not tenant-scoped the same way (it IS the tenant list),
-- so it stays without RLS for now — access to it is an app-level admin
-- concern, revisit if/when Perfect Solutions staff and builders share the
-- same login system.
