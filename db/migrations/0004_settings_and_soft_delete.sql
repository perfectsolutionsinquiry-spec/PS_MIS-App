-- 0004_settings_and_soft_delete.sql
--
-- Two independent additions, batched into one migration to minimize
-- manual Neon SQL Editor round-trips:
--
-- 1. customers.is_active — the soft-delete field decided on when Delete
--    was first discussed (see CLAUDE.md's "Not started yet"): Delete
--    never removes a row, it sets this to false. Defaults true, so every
--    existing customer stays visible with no backfill needed. GET
--    /customers filters to is_active = true; GET /customers/:id does not
--    (an id you already have — e.g. from history — still resolves), and
--    there's no "view archived / restore" screen yet — a known, disclosed
--    gap, not an oversight.
--
-- 2. app_settings — a tiny generic key/value table for platform-wide
--    display configuration, starting with which customer fields are
--    "highlighted" at the top of a customer record (apps/web/src/
--    CustomerDetailScreen.tsx). Deliberately NOT RLS-scoped: this is
--    app-wide UI configuration (which fields matter enough to highlight),
--    not tenant data — every builder and every staff member sees the
--    same highlighted fields on the same table, same reasoning as `banks`
--    staying open. A future table's record view (once one exists) would
--    get its own key in this same table, not a new migration.
--
-- Run this against Neon exactly like 0001-0003 (SQL Editor). Safe to run
-- any time — additive only, no data touched, no existing column changed.

alter table customers add column if not exists is_active boolean not null default true;

create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
