-- 0001_init.sql
--
-- Real domain schema (v3), modelled directly against a real sample workbook
-- (Majestique Towers East.xlsx) and claude/MIS Application - Handover.md.
-- Two kinds of logins:
--   staff_users    Perfect Solutions' own employees. NOT tied to one builder —
--                  they can see every builder's data (set app.is_staff='true').
--   builder_users  A builder's own admins/CRM staff. Scoped to their own
--                  builder_id only.
-- Every tenant-scoped table carries builder_id directly, even where it could
-- be derived through a join, so the same row-level-security rule applies
-- everywhere without tracing through multiple tables.
--
-- Deliberately NOT copied from the spreadsheet: formula/derived columns
-- (Basic Value (Formula), Agreement Value (Formula), the nine separate
-- stage-percentage columns). Those get computed by the ported calculation
-- engine (packages/calc-engine, not built yet) from the raw inputs stored
-- here, and each payment milestone is its own row, not its own column —
-- see claude/MIS Application - Handover.md section 6, defect 1, for the bug
-- class this avoids.
--
-- Run via Neon's SQL Editor, or: psql "$DATABASE_URL" -f db/migrations/0001_init.sql

create extension if not exists pgcrypto;

-- ── Reference / cross-tenant tables ─────────────────────────────────────

create table banks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  contact_phone text,
  contact_email text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table staff_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  full_name     text,
  phone         text,
  role          text not null default 'staff',
  created_at    timestamptz not null default now()
);

-- ── The tenant ───────────────────────────────────────────────────────────

create table builders (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,           -- e.g. "Majestique Group"
  legal_entity_name   text,                    -- e.g. "Majestique Landmarks Pvt Ltd"
  registered_address  text,
  gstin               text,
  pan                 text,
  contact_name        text,                    -- e.g. "Sameer Kulkarni"
  contact_designation text,                    -- e.g. "GM - CRM"
  contact_phone       text,
  contact_email       text,
  created_at          timestamptz not null default now()
);

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

-- ── Projects, towers, inventory ─────────────────────────────────────────

create table projects (
  id           uuid primary key default gen_random_uuid(),
  builder_id   uuid not null references builders(id) on delete cascade,
  name         text not null,          -- e.g. "Majestique Towers East"
  address      text,
  rera_number  text,                   -- e.g. "P52100031887"
  created_at   timestamptz not null default now()
);

create table towers (
  id                 uuid primary key default gen_random_uuid(),
  builder_id         uuid not null references builders(id) on delete cascade,
  project_id         uuid not null references projects(id) on delete cascade,
  name               text not null,    -- e.g. "E3"
  possession_target  date,
  created_at         timestamptz not null default now()
);

-- The payment-schedule template for a tower — e.g. "Plinth (15%)" due on a
-- planned date. A customer's actual due/paid tracking (customer_milestones
-- below) is generated from this template, not duplicated column by column.
create table payment_milestones (
  id             uuid primary key default gen_random_uuid(),
  builder_id     uuid not null references builders(id) on delete cascade,
  tower_id       uuid not null references towers(id) on delete cascade,
  milestone_name text not null,        -- e.g. "Plinth"
  percent_due    numeric not null,     -- e.g. 15.00
  sort_order     integer not null default 0,
  planned_date   date,
  created_at     timestamptz not null default now()
);

create table inventory_units (
  id                 uuid primary key default gen_random_uuid(),
  builder_id         uuid not null references builders(id) on delete cascade,
  tower_id           uuid not null references towers(id) on delete cascade,
  type_ref           text,                 -- unit type's real identity, not its name (see handover doc invariant 6)
  unit_type          text,                 -- e.g. "3 BHK"
  configuration      text,
  carpet_sqft        numeric,
  balcony_sqft       numeric,
  total_carpet_sqft  numeric,
  total_carpet_sqmt  numeric,
  sellable_sqft      numeric,
  rate_per_sqft      numeric,
  parking            text,
  floor              text,
  flat_no            text,               -- e.g. "E3-201"
  note               text,
  created_at         timestamptz not null default now()
);

-- ── Customers ────────────────────────────────────────────────────────────

create table customers (
  id                        uuid primary key default gen_random_uuid(),
  builder_id                uuid not null references builders(id) on delete cascade,
  inventory_unit_id         uuid references inventory_units(id),
  assigned_staff_id         uuid references staff_users(id),

  ps_client_no              text unique,   -- e.g. "PSFA0000199" — invariant: unique workspace-wide
  agreement_no              text,

  full_name                 text not null,
  contact_number            text,
  email                     text,
  pan_number                text,
  aadhar_number              text,
  profession                text,
  address                   text,

  booking_date              date,
  agreement_date            date,
  possession_date           date,

  rate_per_sqft             numeric,       -- rate actually agreed, may differ from unit's list rate
  basic_value               numeric,
  parking_amt               numeric,
  infra_legal_soc_charges   numeric,
  agreement_value           numeric,
  gst_pct                   numeric,
  stamp_duty_pct            numeric,
  stamp_duty_amount         numeric,
  registration_charges      numeric,
  tds_pct                   numeric,
  other_charges             numeric,
  total_cost_of_flat        numeric,

  funding_source            text,          -- 'BANK' or 'OWN FUNDS'
  loan_expected              numeric,
  bank_id                   uuid references banks(id),
  bankers_contact_number    text,
  loan_file_no              text,
  loan_amount               numeric,
  own_contribution_required numeric,
  own_contribution_received numeric,

  stage                     text,          -- Held / Booked / Funding decided / Agreement executed /
                                            -- Registered / Under collection / Possession / Cancelled
  dl_status                 text,          -- demand-letter / disbursement status
  dl_date                   date,
  remark                    text,

  created_at                timestamptz not null default now()
);

create table co_applicants (
  id             uuid primary key default gen_random_uuid(),
  builder_id     uuid not null references builders(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete cascade,
  full_name      text not null,
  relation       text,
  pan_number     text,
  aadhar_number  text,
  contact_number text,
  email          text,
  profession     text,
  annual_income  numeric,
  address        text,
  created_at     timestamptz not null default now()
);

-- Generated per customer from payment_milestones (the tower's template) —
-- one row per customer per milestone, due date and status tracked here
-- rather than as extra columns on customers.
create table customer_milestones (
  id                uuid primary key default gen_random_uuid(),
  builder_id        uuid not null references builders(id) on delete cascade,
  customer_id       uuid not null references customers(id) on delete cascade,
  payment_milestone_id uuid not null references payment_milestones(id),
  amount_due        numeric not null,
  due_date          date,
  status            text not null default 'not due',  -- not due / due / partial / paid
  created_at        timestamptz not null default now()
);

-- The actual transaction log — every payment received, atomic. This is the
-- source of truth for "amount received"; customer_milestones.status is
-- derived from this, not stored redundantly against it.
create table recovery_transactions (
  id                 uuid primary key default gen_random_uuid(),
  builder_id         uuid not null references builders(id) on delete cascade,
  customer_id        uuid not null references customers(id) on delete cascade,
  received_on        date not null,
  flat_cost_received numeric not null default 0,
  gst_received       numeric not null default 0,
  remark             text,
  source             text,   -- e.g. "Own funds", "LIC Housing"
  created_at         timestamptz not null default now()
);

-- ── Row-level security ─────────────────────────────────────────────────
-- The API sets these once per request, right after verifying who's logged in:
--   select set_config('app.current_builder_id', $1, true);   -- builder login
--   select set_config('app.is_staff', 'true', true);         -- staff login

do $$
declare
  t text;
begin
  foreach t in array array[
    'builder_users','bank_accounts','projects','towers','payment_milestones',
    'inventory_units','customers','co_applicants','customer_milestones',
    'recovery_transactions'
  ]
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

-- banks and staff_users stay open: banks is shared reference data, and
-- staff_users should only ever be reached by staff-only, app-level-gated
-- code paths — no builder login ever queries it.
