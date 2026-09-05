-- 0006_audit_log.sql
--
-- Audit log for staff access to builder data.
-- Guardrail #6 from docs/LAUNCH_GUARDRAILS.md: log every instance of staff
-- accessing a specific builder's data — who, when, which endpoint, which
-- builder (when scoped to one).
--
-- This table records staff access to tenant-scoped routes. It does NOT log
-- builder-user access (a builder only ever sees their own data) — only staff
-- cross-builder access, which is the trust concern.
--
-- Run via Neon's SQL Editor, or: psql "$DATABASE_URL" -f db/migrations/0006_audit_log.sql

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff_users(id),
  staff_email   text not null,                     -- denormalized so the log stays readable even if the staff row is later deleted
  route         text not null,                     -- e.g. "GET /customers", "GET /customers/:id"
  builder_id    uuid references builders(id),      -- null when the route isn't scoped to a specific builder (e.g. list endpoints that return all builders' data)
  builder_name  text,                              -- denormalized for readability
  method        text not null default 'GET',
  accessed_at   timestamptz not null default now(),
  ip_address    text                               -- populated when available from the request
);

-- Index for the most common query: "show me everything staff member X did"
create index idx_audit_log_staff_access on audit_log(staff_id, accessed_at desc);

-- Index for: "show me everything that touched builder Y"
create index idx_audit_log_builder_access on audit_log(builder_id, accessed_at desc);
