-- 0003_force_rls.sql
--
-- Three real bugs found by actually running the seed data and the isolation
-- test locally (see claude/Platform Repo - Git Setup and Deploy Plan.md for
-- the full story) — this migration closes all three:
--
-- 1. FORCE ROW LEVEL SECURITY. 0001 only ran "enable row level security",
--    which is not enough on its own: in Postgres, a table's OWNER is exempt
--    from RLS by default even with it "enabled" — only FORCE makes the
--    policy apply to the owner too. The API's DATABASE_URL connects as
--    neondb_owner, which is also the role that ran 0001 — so neondb_owner
--    IS the owner of every one of these tables. Verified locally: without
--    FORCE, a query run as the owning role with a wrong
--    app.current_builder_id still returned another builder's row. With
--    FORCE, the same query correctly returns nothing, and a staff session
--    (app.is_staff = 'true') still correctly sees everything.
--
-- 2. A defensive rewrite of the policy expression itself. The original
--    policy cast app.current_builder_id straight to ::uuid with no guard:
--    `builder_id = current_setting('app.current_builder_id', true)::uuid`.
--    If that setting is ever the empty string, Postgres throws
--    "invalid input syntax for type uuid" instead of just denying access —
--    and it reliably IS the empty string, not just genuinely unset (NULL),
--    in two real situations: withTenantClient() sets it to '' on purpose
--    for staff sessions (see apps/api/src/auth.ts), and — this is the
--    subtler one, found by actually reproducing it — once a custom GUC
--    like app.current_builder_id has been SET at all on a given pooled
--    connection, Postgres keeps a placeholder for it for the rest of that
--    connection's life; after a `set_config(..., true)` (local-to-
--    transaction) value's transaction ends, it doesn't revert to "never
--    set" (NULL), it reverts to '' — and a later request that reuses that
--    same pooled connection inherits that ''. Guarding the cast with
--    `nullif(..., '') is not null and ...` looks like it should fix this,
--    and does when you test the expression on its own — but tested for
--    real as a table's RLS policy (not a bare SELECT), Postgres does not
--    reliably short-circuit that AND before evaluating the cast, and the
--    same "invalid input syntax" error still happens. Confirmed directly:
--    reproducible with `nullif` guard in place, not reproducible once the
--    cast is removed entirely (see below). So the fix here doesn't try to
--    guard the cast at all — it avoids ever casting text to uuid in the
--    policy, comparing as text instead: `builder_id::text = current_
--    setting(...)`. An empty or unset setting then just fails to match
--    (false, not an error) like any other comparison would.
--
-- 3. builder_users should never have had RLS on it in the first place —
--    0001 put it in the same array as every tenant-scoped data table, but
--    it isn't tenant-scoped data, it's the table used to FIND OUT which
--    tenant someone belongs to. lookupIdentity() in apps/api/src/auth.ts
--    queries it directly (by clerk_user_id, on a fresh connection, before
--    any app.current_builder_id / app.is_staff could possibly be set —
--    that's the whole point of the query). Under RLS, let alone FORCE, that
--    lookup is filtered by the very policy it would need a builder_id to
--    satisfy — a chicken-and-egg problem that silently returns zero rows
--    for every builder login, forever. 0001's own comment already carved
--    out this exact exemption for staff_users ("no builder login ever
--    queries it" — reached only by staff-gated code) but missed that
--    builder_users needs the identical exemption for the mirror-image
--    reason. Confirmed by reproducing it: inserted a real builder_users row
--    matching a real clerk_user_id, queried it exactly the way
--    lookupIdentity() does (no session vars set) — zero rows came back.
--    Fixed below by removing RLS from builder_users entirely, same as
--    banks and staff_users. This is safe: the query is always scoped to
--    one specific clerk_user_id (a unique column), so it can only ever
--    return that one signed-in user's own row, never another builder's.
--
-- Run this against Neon exactly like 0001/0002 (SQL Editor). Safe to run
-- any time relative to 0001/0002 — it doesn't touch data. Run it AFTER
-- loading any seed data through the SQL Editor as the owner role, though:
-- once FORCE is on, even direct SQL Editor inserts/updates/deletes on these
-- tables need `select set_config('app.is_staff', 'true', false);` run
-- first in that same editor session, same as any other write.

drop policy if exists builder_users_isolated on builder_users;
alter table builder_users disable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'bank_accounts','projects','towers','payment_milestones',
    'inventory_units','customers','co_applicants','customer_milestones',
    'recovery_transactions'
  ]
  loop
    execute format('drop policy if exists %I_isolated on %I', t, t);
    execute format(
      'create policy %I_isolated on %I using (
         coalesce(current_setting(''app.is_staff'', true), '''') = ''true''
         or builder_id::text = current_setting(''app.current_builder_id'', true)
       )', t, t
    );
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
