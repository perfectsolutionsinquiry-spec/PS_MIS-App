# Launch Guardrails — Builder Isolation and Pre-Launch Standards

> **Status, 4 September 2026:** items 1–4 below are done. Item 1 ("wire the isolation
> test into CI") — `.github/workflows/ci.yml` runs the real suite against a real Postgres
> on every push, connected as a non-superuser role so `FORCE ROW LEVEL SECURITY` is
> actually being tested rather than bypassed (see that file's own comments for why the
> first attempt at this had to be corrected). It does not yet **block** a push — see that
> file for what would still be needed for a real gate. Item 2 ("a written, repeatable
> builder-onboarding runbook") — `docs/BUILDER_ONBOARDING.md`, and its first real use
> tonight found that Shilpkaar's builder-side login never actually existed until then (see
> `CLAUDE.md`'s "Real data loaded" correction) — the runbook's own verification step is
> what surfaced that, which is the strongest evidence yet that step is worth keeping
> mandatory. Item 3 ("move Clerk off test keys") — done; production keys, a verified
> custom domain (`app.perfectfinadvisory.com`), both re-linked/created production users.
> See `CLAUDE.md`'s "Live deployment" for what that took and what to know before touching
> it again. Item 4 ("confirm nightly backups and PITR are actually on... restore one for
> real") — actually rehearsed, not just confirmed enabled: restored `production` to a new
> Neon branch (`restore-test`) from a point roughly an hour in the past, then queried it
> directly and got back the real numbers (288 customers, 8,950 recovery transactions) —
> not an empty shell. One real constraint this surfaced: Neon's free plan retains only
> **6 hours** of point-in-time history — a problem caught more than 6 hours after it
> happened cannot be recovered this way, worth knowing before treating PITR as a safety
> net for anything older than that. Items 5-9 are done. What.s left before builder #6: — a fuller
> draft than just the support-access clause now exists at
> `docs/BUILDER_AGREEMENT_DRAFT.md` (guardrail #10's full agreement scope, requested to
> give a lawyer more to start from), with `docs/SUPPORT_ACCESS_COMMITMENT.md` covering
> the same ground as that draft's Section 5 alone. Both need a lawyer before either goes
> near a builder. This document stays the original decision record rather than being
> edited into a live checklist.

Written 3 September 2026, in response to: "10 builders might log in — what are the
standard things we discussed before launching this app." This is the decision record for
that question. It draws on ground rules already on file (`claude/Platform Plan -
Architecture Options and Costs.md`'s "nine decisions before code" and `claude/
Configuration Catalogue - Where the App Should Bend.md`'s "never configurable" list) and
on what actually got built and bug-fixed while loading Shilpkaar's real data (see
`CLAUDE.md` at the repo root for the full technical account). Treat this as the checklist
to run through before signing builder #2, and again before builder #6.

## The one rule everything else serves

> **The bug that ends the company: Builder A seeing Builder B's data.**

Every guardrail below is either preventing that directly or making it detectable fast if
prevention ever fails. This is the standard the platform gets judged against, not "does
the dashboard look good."

## Where isolation actually stands today — confirmed, not assumed

Three real isolation bugs were found and fixed while loading the first builder's data —
not in review, by actually running a local Postgres, applying every migration, loading
real seed data, and running the isolation test end to end before anything shipped. That
process is itself a guardrail worth keeping, not a one-time cleanup:

1. **Row-level security is now forced, not just enabled.** Postgres exempts a table's
   *owner* from RLS by default, even when RLS is "on" — the API's own database role owns
   every table, so the policy was silently not applying to the very connection serving
   real traffic. Fixed with `FORCE ROW LEVEL SECURITY` on every tenant-scoped table
   (`db/migrations/0003_force_rls.sql`).
2. **Tenant scope is now set inside the same transaction as the query it protects.**
   The session variables that carry "who is this" (`app.is_staff`,
   `app.current_builder_id`) were being set and then silently reverted before the real
   query ran, because each bare call was auto-committing separately. Every request was
   briefly running with no tenant scope at all — invisible while the database was empty.
   Fixed in `apps/api/src/auth.ts` (`withTenantClient`) by wrapping both in an explicit
   transaction.
3. **`builder_users` has RLS removed entirely, deliberately** — the login lookup itself
   has to run before any tenant context exists, so RLS on that one table was a
   chicken-and-egg bug that would have silently broken every builder login forever.

The automated test that asserts this (`apps/api/tests/isolation.test.ts`) checks three
things: builder A cannot read builder B's rows, a session with no builder set sees
nothing, and staff sees everything. It has been run by hand, repeatedly, and passes.

**What it does not yet do: run itself.** That is guardrail #1 below.

## Before builder #2 — do these before another builder's real data is loaded

1. **Wire the isolation test into CI, and make it a required check.** Today it only runs
   when someone remembers to run it locally. At one builder that was survivable; at two
   or more it is the exact test that must never be skippable before a merge to `main`
   touches `auth.ts`, any migration, or any RLS policy. This is the single highest-value
   guardrail on this list and should happen before builder #2's data goes in, not after.
2. **A written, repeatable builder-onboarding runbook — followed exactly, every time.**
   There's no admin UI yet; provisioning is manual SQL via Neon's SQL Editor. That's fine
   at this scale, but it means the *procedure* has to be the safety net instead of a form
   with validation. The runbook should be: create the `builders` row → create the
   `builder_users` row(s) with the real `clerk_user_id` → **sign in as that builder and
   confirm they see only their own data, and confirm they cannot see the previous
   builder's data by trying** → only then hand over the login. That last verification
   step is not optional and should ideally be done by a second person, not just the
   person who ran the SQL.
3. **Move Clerk off test keys before a second real builder's staff log in.** The
   deployment is currently on `pk_test_`/`sk_test_` — fine for Azhar's own confirmed
   login, not appropriate once outside people are authenticating against real financial
   data.
4. **Confirm nightly backups and PITR are actually on in Neon, and restore one for
   real.** "Backups are enabled" and "we have confirmed we can restore from a backup"
   are different claims — only the second is a guardrail. Do the second before a second
   builder's data is irreplaceable.
5. **Decide and write down the support-access rule, then hold to it.** Staff logins
   bypass RLS by design (`is_staff` sees everything) — that's necessary for support, but
   it means "Perfect Solutions staff can see any builder's data" is currently true with
   no record of who looked at what or when. At minimum this needs to be stated in
   whatever agreement each builder signs (support access exists, is logged, is
   attributed, is time-limited — the exact language already drafted in the platform
   plan). The logging itself doesn't need to exist before builder #2, but the written
   commitment and internal discipline about when staff actually query another builder's
   data should.

## Before scaling past a handful of builders (builders #6–10 and beyond)

These matter less at 2–3 builders where Azhar can eyeball everything by hand, and matter
a lot once there are enough builders that nobody is checking each one personally.

6. **An actual audit log of staff cross-builder access.** Every time a staff session
   queries data belonging to a specific builder, that should write a row — who, when,
   which builder, what for. This is what turns "we said we'd log it" into something a
   builder (or a regulator) could actually be shown.
7. **A data-export button, per builder.** If Perfect Solutions ever stops running this
   platform, a builder should be able to get an exact export of their own data without
   asking anyone for help. This is explicitly the answer to "what if you disappear" —
   it's a trust feature, not a nice-to-have, and it's much easier to build once than to
   retrofit after ten builders are relying on the platform.
8. **Real pagination on every listing, not `limit 1000`.** ? DONE � page sizes 10/20/50/100/500, with First/Prev/Page/Next/Last controls. The current `/customers`
   route caps at 1000 rows as a stopgap — it already silently hid data once (88 of 288
   real customers, caught by comparing on-screen counts against Neon). Fine for one
   builder at ~300 customers; not fine once several builders' real datasets are live
   simultaneously.
9. **Rate limiting and basic abuse protection.** ? DONE � `@fastify/rate-limit`, 100 req/min per IP, active now. Low risk today, worth
   people outside Perfect Solutions' own staff and builder logins — low risk today, worth
   flagging before any public-facing form (lead capture, connector signup) goes live.
10. **A signed agreement per builder**, covering: what Perfect Solutions can see and log,
    data ownership, the export right above, support hours and the explicit *no SLA
    promised in writing* stance, and what happens to their data if the relationship ends.
    Budget for a lawyer here rather than freehand-drafting it — this is exactly where a
    generic template creates more risk than it removes.

## The standards that don't change as the builder count grows

These are not settings, not something a builder can request differently, and not
something that gets relaxed under deadline pressure. State them to a builder as a
guarantee, not an option:

- **One builder never sees another builder's data — not even a group with two related
  entities.** No exceptions, no "just this once," no shared logins across two builder
  accounts even if they're the same company group.
- **Financial records are never deleted, only reversed with a reason.** A receipt, once
  issued, stays in the record; correcting it means a reversal entry, not an edit or a
  delete.
- **The change trail cannot be switched off, for anyone** — including staff, including
  Azhar's own account.
- **Rounding happens once, at the point of money**, never recomputed differently in two
  places.
- **A payment demand can't be quietly overpaid or short-settled** — a mismatch produces a
  note, not a silent adjustment.
- **The client never decides who can see what.** Every access decision is enforced by the
  database (RLS), never by the frontend hiding a button — the frontend only ever displays
  what the API already decided to send it.

## PII and data-minimisation rules to lock now, not later

- Do not store full Aadhaar numbers unless a specific lender requires it for that loan;
  keep the last 4 digits plus a document reference otherwise.
- PAN and phone numbers should be masked by role — decide today which roles see the full
  number and which see a masked version, and build new screens against that decision
  rather than defaulting every new field to "everyone sees everything."
- India's DPDP Act transition window ends November 2026, full enforcement mid-May 2027,
  with penalties running as high as ₹250 crore for a serious breach — this isn't a
  someday concern, it lands inside the Phase 2 window this platform is currently in.

## A short pre-launch checklist, in the order to actually do them

1. Isolation test wired into CI, blocking on failure.
2. Written onboarding runbook, with the "sign in as the new builder and try to see
   someone else's data" step treated as mandatory, not optional.
3. Clerk switched to production keys.
4. One real backup restore rehearsed and confirmed.
5. Support-access commitment written into whatever each builder signs.
6. Everything in "before scaling past a handful" above, timed to land before builder #6,
   not after.

Nothing here blocks builder #2 today if items 1–5 are done first — the platform's actual
isolation enforcement (RLS forced, transaction-scoped, tested) is already real and
already confirmed working, which is the part that would have been hardest to retrofit.
What's missing is process and paperwork around a mechanism that already works, not the
mechanism itself.
