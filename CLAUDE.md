# Perfect Solutions — Platform (MIS / Builder Dashboard)

This file is project context for Claude Code (or any fresh session) picking
up this repo with no memory of how it got here. Read this first.

## What this is

Perfect Solutions is Azhar Tamboli's fintech/financial-distribution company
(loans + DSA + builder channel-partner business, based in Maharashtra).
This repo is a hosted, multi-tenant MIS/dashboard platform: builders log in
and see only their own project/customer/loan data; Perfect Solutions staff
log in and see everything across every builder. It's meant to eventually
replace/complement an existing local Excel-based MIS tool (see
`docs/DEPLOY_PLAN.md` and the "MIS Application - Handover" doc in the
Claude Project this was built alongside).

**Read these before touching auth, RLS, migrations, or onboarding a builder:**
`docs/VISION_AND_ROADMAP.md` (why this platform exists, and where it sits in
the four business lines), `docs/LAUNCH_GUARDRAILS.md` (the pre-launch
checklist this repo is currently working through — start here for "is it
safe to sign builder #2 yet"), `docs/BUILDER_ONBOARDING.md` (the exact
runbook — no admin UI exists yet, so this procedure *is* the safety net), and
`docs/BUILDER_AGREEMENT_DRAFT.md` (draft-only, needs a lawyer, do not send to
a builder as-is — the full per-builder agreement guardrail #10 calls for:
staff access, data ownership, export rights, support/SLA stance, DPDP Act
exposure, termination; grounded in the actual code and business terms, not a
generic template). `docs/SUPPORT_ACCESS_COMMITMENT.md` covers the same staff-
access ground as that draft's Section 5 alone, kept separately since
guardrail #5 is tracked as its own checklist item.

**Read these before changing anything, and update them in the same
commit as whatever prompted the change:** `docs/TECHNICAL_DOCUMENTATION.md`
(schema map, data-flow diagrams, and a file-by-file/route-by-route index —
"which file do I look at when X breaks") and `docs/FUNCTIONAL_GUIDE.md`
(the same platform explained screen-by-screen in plain business language,
for a non-technical reader — what a button does, what a number means,
which settings are configurable and where). See "Documentation practice"
below for the standing rule these two exist to enforce.

**Hard rule that shaped every design decision below:** business logic and
access control live on the server, never the client. The frontend
(`apps/web`) only ever displays what the API sends it — it never computes a
number or decides who can see what.

## Architecture

npm-workspaces monorepo:

- `apps/api` — Fastify + TypeScript. Auth via Clerk (`@clerk/backend`).
  Talks to Postgres via `pg`.
- `apps/web` — Vite + React + TypeScript. Clerk's prebuilt `<SignIn/>` for
  login. Fetches from the API with a Bearer token from
  `useAuth().getToken()`.
- `db/migrations` — plain numbered `.sql` files, run by hand via Neon's SQL
  Editor (the sandbox this was built in cannot reach Neon directly over
  the network — raw Postgres and arbitrary HTTPS are blocked — so all
  schema work has always gone through Neon's web SQL Editor, never `psql`
  against the live database).
- `packages/` — reserved for `calc-engine` (not built yet — see "Not
  started yet" below).

**Tenancy model:** two kinds of logins, both authenticated via Clerk and
resolved to a local identity by `clerk_user_id`:
- `staff_users` — Perfect Solutions' own employees. Not tied to one
  builder; see everything.
- `builder_users` — a builder's own admins/CRM staff. Scoped to their own
  `builder_id` only.

Enforcement is Postgres row-level security (RLS), not app-level filtering:
every tenant-scoped table carries `builder_id` directly and has a policy
`is_staff OR builder_id::text = current session's builder_id`, with the
policy **forced** (binds even to the owning DB role — see "Bugs found and
fixed" below for why that distinction mattered). The API sets these two
Postgres session variables per request, from the verified Clerk identity,
never from anything the client claims:
```
select set_config('app.is_staff', 'true'|'', true);
select set_config('app.current_builder_id', '<uuid>'|'', true);
```
See `apps/api/src/auth.ts` (`withTenantClient`) for exactly how.

## Live deployment

- **API**: `https://perfect4developers.onrender.com` (Render web service,
  free tier — cold starts). Health check: `/health`. DB check: `/db-check`.
- **Frontend**: `https://app.perfectfinadvisory.com` (custom domain, Render
  Static Site under the hood — `perfect4developers-app.onrender.com` still
  resolves too, but Clerk's production instance is domain-restricted, so the
  app only actually works from the custom domain now; treat the onrender.com
  address as legacy, not the one to hand anyone). Build command `npm install
  && npm run build --workspace=apps/web`, publish dir `apps/web/dist`.
- **Database**: Neon Postgres, project "perfect4developers", region AWS
  US West 2 (Oregon, matched to Render's region), free tier (permanent,
  unlike Render's own free Postgres which deletes after 30 days — this is
  why Neon was chosen over Render's built-in database). **Point-in-time
  restore rehearsed for real on 4 September 2026** (guardrail #4) — branched
  `production` from ~1 hour in the past into a throwaway branch and confirmed
  the real row counts came back (288 customers, 8,950 recovery transactions),
  not an empty branch. The free plan's history retention is **6 hours** —
  anything older than that cannot be recovered this way; know that before
  relying on PITR as the answer to "how far back can we go."
- **Auth**: Clerk, "Consumer" app type (not B2B/Organizations — tenancy is
  handled in our own DB, not Clerk's). **On production keys (`pk_live_`/
  `sk_live_`) as of 4 September 2026** — guardrail #3 from
  `docs/LAUNCH_GUARDRAILS.md`, done. Production domain is
  `app.perfectfinadvisory.com`, with Clerk's own subdomains
  `clerk.perfectfinadvisory.com` (Frontend API) and
  `accounts.perfectfinadvisory.com` (Account Portal) — all three, plus the
  three email-sending CNAMEs, are DNS records at MilesWeb (the registrar for
  `perfectfinadvisory.com`; nameservers are the giveaway if this ever needs
  rediscovering — `*.mydnsvault.com`). Clerk would not begin issuing SSL
  certificates for the domain until *every* configured section (Application
  **and** Email) verified — not just the Application CNAMEs that actually
  gate sign-in — which cost real time to discover; worth knowing before
  anyone next touches Clerk's domain config. Development-instance keys and
  users (`pk_test_`/`sk_test_`) still exist and still work independently, for
  local development.

Both Render services auto-deploy on every push to `main`. Actual secret
values (Clerk keys, `DATABASE_URL`) live in each service's Environment tab
on Render and in Neon's dashboard — intentionally not restated here. One
non-obvious gotcha confirmed the hard way: `VITE_`-prefixed variables are
baked into the frontend's build at deploy time, not read at runtime — saving
a new value in Render's Environment tab does **not** take effect until that
service's next build actually runs, and Render does not reliably
auto-trigger one on an env-var-only change. Trigger **Manual Deploy → Deploy
latest commit** on `perfect4developers-app` explicitly after changing any
`VITE_` variable, and confirm by checking the deployed bundle's own content
(`/assets/index-*.js`) for the expected value, not just the filename hash —
don't assume a save took effect.

## Git

- Repo: `https://github.com/perfectsolutionsinquiry-spec/PS_MIS-App.git`
  (this repo was originally created under the name `MIS-App` for an unrelated
  single-file HTML tool, then renamed to `PS_MIS-App` and had this platform's
  history force-pushed onto `main` in its place — see `archive/html-tool`
  below for where that original project went. A remote still configured with
  the old `MIS-App.git` URL will keep working: GitHub redirects renamed repos,
  and `git push`/`git fetch` follow it, printing "This repository moved.")
- Branch: `main` — everything ships straight to main, deploy-one-thing-at-a-time
  style, no PR workflow yet. One other branch exists, `archive/html-tool`:
  the two commits of the original single-file MIS tool that used to live at
  this repo's name, kept so that work isn't lost, not part of this app's
  history (no common ancestor with `main`). Tags `baseline-import` and
  `html-tool-final` mark the same two commits.
- Local working copy: `C:\Users\AzharTamboli\MIS-App` (note the folder name
  still says `MIS-App` — that's just a local directory name and doesn't need
  to match the repo's current name on GitHub. A second clone briefly existed
  at `Downloads\perfect-solutions-platform`; it was deleted once confirmed
  clean and pushed, to stop uncommitted work in one clone from going unseen
  in the other.)
- Commit history so far (oldest to newest):
  1. `ddbadb7` — Scaffold platform repo: increment 1 (health-check API +
     isolation test)
  2. `6d1e4ec` — Expand schema: builder profile, staff vs builder users,
     projects/towers/payments, banks
  3. `424644e` — Expand schema to match the real MIS workbook (v3)
  4. `0d021c3` — Add Clerk auth and a first working screen (increments 3
     and 4, first slice)
  5. `e22159c` — Fix RLS enforcement, tenant-scope bug, and customers query
     column (the three-bugs fix, see below)
  6. `fde6cdc` — Add sidebar navigation and Customers screen
  7. `45627a4` — Add CLAUDE.md: project context for a fresh session
  8. `e740ae4` — Update CLAUDE.md: this repo was renamed from MIS-App,
     consolidate to one clone
  9. `114d5c0` — Add a real Overview dashboard: nav rail, KPI tiles, one new
     API endpoint (see "Current UI" below)
  10. `b2d0912` — Add the disbursement-status and loan-by-bank chart cards
  11. `b711f1c` — Fix donut ring getting clipped at its tangent points
  12. `dbd7cfa` — Wire the tenant-isolation test into CI (first attempt —
      see 13)
  13. `8620ba7` — Fix CI: connect as a non-superuser role, not Postgres's
      default superuser (12 connected as a superuser, which bypasses RLS
      unconditionally — both isolation tests failed for that reason, not
      because the app's RLS was broken; see the commit and
      `.github/workflows/ci.yml`'s own comments)
  14. `1adfdbe` — Bring Vision and Roadmap + Launch Guardrails into the repo
      as `docs/`, plus the builder-onboarding runbook and a draft
      support-access commitment (guardrails items 2 and 5)
  15. `6e39a19` — Update CLAUDE.md: point at the new guardrails docs, catch
      up commit list
  16. `4a649c2` — Clerk switched to production keys and a custom domain
      (`app.perfectfinadvisory.com`), Shilpkaar's builder login created for
      the first time (see "Real data loaded" below), guardrail #3 done
  17. `d68b050` — guardrail #4 done: Neon point-in-time restore actually
      rehearsed, not just confirmed enabled
  18. `d9c111f` — detailed builder-agreement draft (guardrail #10 / #5),
      grounded in the actual code and business terms rather than a generic
      template, for a lawyer to work from
  19. `00a4ff1` — the last two Overview chart cards: outstanding balance by
      customer and daily collection, `LineChart.tsx` new
  20. `a36a908` — donut: exploded-slice hover, tooltip anchored to the
      hovered segment
  21. `5e73248` — donut: 4 real categories instead of 3 (violet as slot 4,
      not the documented yellow — see DonutChart.tsx)
  22. `8315ed8` — finish outstanding-by-customer (searchable picker, no
      top-N cap) and daily collection (4/12/26/52-week range picker); real
      "View as table" for both
  23. `d35ab3d` — catches up this list and the Overview screen description
  24. `d6e9d29` — the first real CRUD slice: a per-customer detail page
      (full record view/edit + record-a-payment), `CustomerDetailScreen.tsx`
      new, 4 new API routes
  25. `8144fed` — real Perfect Solutions branding (logo mark + wordmark)
      replacing the placeholder "PS" box and system favicon
  26. `f01cfa9` then `f31f40f` — adopted the real brand fonts (IBM Plex
      Sans/Serif), then reverted figures from Serif to Sans on explicit
      feedback — Sans is the only brand font actually in use anywhere now
  27. `bed0be3` — `DataTable.tsx`: a generic sortable/searchable/column-
      configurable list engine, Customers wired up to it first; a working
      "New customer" flow (`NewCustomerModal.tsx`, `POST /customers`,
      `GET /builders`)
  28. this file, plus `docs/TECHNICAL_DOCUMENTATION.md` and
      `docs/FUNCTIONAL_GUIDE.md` (new) — establishes the standing
      documentation practice (see that section above) and catches up
      this list

## Database schema (13 tables, migrations 0001-0003)

Modelled directly against a real sample workbook (`Majestique Towers
East.xlsx`, referenced in the Claude Project) and the existing MIS tool's
handover doc. Full column-level detail is in `db/migrations/0001_init.sql`
— summary:

- **Reference / cross-tenant**: `banks`, `staff_users` (no RLS on either —
  intentionally shared/staff-only-gated)
- **The tenant**: `builders`, `builder_users` (RLS was removed from this
  one — see bug 4 below), `bank_accounts`
- **Projects/towers/inventory**: `projects`, `towers`, `payment_milestones`
  (the payment-schedule *template* per tower), `inventory_units`
- **Customers**: `customers` (~35 columns — booking/agreement/loan/GST/
  stamp-duty fields, deliberately *not* the spreadsheet's derived/formula
  columns), `co_applicants`, `customer_milestones` (generated per customer
  from `payment_milestones`, one row per customer per milestone),
  `recovery_transactions` (the actual payment log — source of truth for
  "amount received", not duplicated as a running balance anywhere else)

Deliberately excluded from the schema: spreadsheet formula/derived columns
(basic value formula, agreement value formula, per-stage percentage
columns). Those belong in a future ported calculation engine
(`packages/calc-engine`, not built yet), computed from the raw inputs
stored here — see "defect 1" in the MIS handover doc for the exact bug
class this avoids (storing the same fact in two derived forms → drift).

### Migrations

- `0001_init.sql` — the 13 tables + `enable row level security` (not yet
  forced) on every tenant-scoped table.
- `0002_clerk_auth.sql` — drops `password_hash` from `staff_users` and
  `builder_users`, adds `clerk_user_id text unique` to both. The original
  schema had its own password column, which directly contradicted "never
  build your own auth/sessions" — caught before the login feature was
  built, not after.
- `0003_force_rls.sql` — see "Bugs found and fixed" below. Adds `FORCE ROW
  LEVEL SECURITY`, rewrites the policy to compare `builder_id::text`
  instead of casting to `::uuid`, and removes RLS from `builder_users`
  entirely.

## Real data loaded

First real builder: **Shilpkaar** (builder), project **Aarambh** (renamed
from the sample workbook's "Majestique Group" / "Majestique Towers East" —
towers E3/E4/E5 and all customer data kept as-is). Loaded via 9 SQL files
run by hand in Neon's SQL Editor (generated by a one-off local script, not
committed to this repo):

- 1 builder, 1 project, 3 towers, 54 payment milestones, 312 inventory
  units, 12 financing banks, 3 extra staff logins (placeholders, no Clerk
  account yet), 288 customers, 170 co-applicants, 5,184 customer-milestone
  rows, 8,950 recovery transactions.
- Confirmed live via a count query in Neon and visually on the deployed
  dashboard (Azhar: "data visible").

**Correction, 4 September 2026:** "data visible" above was always Azhar
signed in as **staff** (which bypasses RLS and sees every builder), not a
real Shilpkaar builder login — `builder_users` was completely empty (0 rows)
until tonight, discovered while re-linking production Clerk users per
`docs/BUILDER_ONBOARDING.md`. Shilpkaar's first real builder-side login now
exists (`builder_users` has one row, `role: admin`, linked to a real
production Clerk user) — this is the actual first run of that runbook's
verification step for this builder, not a formality.

## Bugs found and fixed (all real, all found by actually running things, not just reading the code)

This sandbox has a local Postgres 16 available, which made it possible to
apply every migration, load the real seed data, and run the real
`apps/api/tests/isolation.test.ts` suite and the real `withTenantClient`
function end to end *before* handing anything over — this is what
surfaced all three of these, and is worth doing again for any future
schema/RLS change.

1. **RLS wasn't actually enforced in production at all.** A Postgres
   table's *owner* is exempt from RLS by default even when it's "enabled"
   — only `FORCE ROW LEVEL SECURITY` binds the policy to the owner too.
   The API's `DATABASE_URL` connects as `neondb_owner`, which also owns
   every table (it ran 0001). Fixed in 0003.
2. **`withTenantClient()` was silently running every query with no tenant
   scope at all.** It set `app.is_staff`/`app.current_builder_id` via
   `set_config(..., true)` (local-to-*transaction*) as one bare
   `client.query()` call, then ran the actual data query as a *separate*
   call — each bare call auto-commits its own implicit transaction, so the
   setting had already reverted before the real query ran. Invisible
   because the database was empty when this was first tested (0 real rows
   looked identical to "correctly scoped, 0 results"). Fixed by wrapping
   the `set_config` calls and the query in an explicit `begin`/`commit` —
   see `apps/api/src/auth.ts`.
3. **`builder_users` should never have had RLS on it.**
   `lookupIdentity()` queries it directly by `clerk_user_id`, before any
   tenant context can exist — that query's whole job is to *discover* the
   builder_id, so RLS on it is a chicken-and-egg problem that silently
   returns zero rows for every builder login, forever. Fixed in 0003 by
   disabling RLS on it entirely, same treatment as `staff_users` and for
   the identical reason.
4. (Smaller, same cleanup pass) `/customers` selected a column that
   doesn't exist (`phone` instead of the real `contact_number`), and the
   frontend didn't check the response status, so a 500 error silently
   rendered as "No customers yet." Both fixed.

Full reasoning for all of these is inline as comments in
`db/migrations/0003_force_rls.sql` and `apps/api/src/auth.ts`.

## Current UI

The look-and-feel target is the old single-file MIS tool's dashboard
(`archive/html-tool`, its Portfolio Overview screen) — a reference for shape
and style, not a literal spec to copy pixel for pixel. Building it as a
sequence of real, working increments rather than one big screen: KPI tiles
first (cheap, real SQL, no new dependency), the chart cards next.

`apps/web/src`:
- `App.tsx` — top-level shell: Clerk `SignedOut`/`SignedIn`, fetches `/me`,
  `/customers` and `/dashboard/overview` (the last two in parallel), renders
  the sidebar + active screen. Default screen is Overview.
- `Sidebar.tsx` — dark sidebar, grouped nav matching the old tool's rail
  shape: Action Items (top) / **Dashboard** (Overview, Customer 360,
  Reliability, Forecast) / **Records** (Customers, Collections, Documents) /
  Settings. Only Overview and Customers are wired to a real screen; the rest
  render disabled ("soon") so the intended shape is visible without
  pretending they exist. Has a working collapse toggle (pure UI state).
  This replaced an earlier Builders/Projects/Recovery/Staff draft nav once
  the screenshot above gave a concrete shape to build toward instead — see
  git history if that draft's reasoning is ever needed again.
- `OverviewScreen.tsx` — the six KPI tiles (total agreement value, total
  received, balance outstanding, loan amount sanctioned, collection
  efficiency, units tracked) plus all four "Collection & loan pipeline"
  chart cards, all from `/dashboard/overview`: disbursement split
  (`DonutChart.tsx`, 3 real categories + violet as a 4th — see that file's
  own comment for why violet and not the documented yellow slot, and for
  its exploded-slice hover + anchored tooltip), loan by bank and
  outstanding by customer (both `BarChart.tsx`, reused — a ranked
  single-hue bar chart is the same form either way), and daily collection,
  grouped by week (`LineChart.tsx`, with a hover crosshair — the one chart
  here with too many points to direct-label every one). All hand-rolled
  SVG, colors validated against the dataviz skill's checks, no charting
  library — deliberately, since a dependency that can't be typechecked or
  installed locally (no Node on this machine) is real risk to add blind.

  Outstanding-by-customer and daily collection are the two cards with real
  interactivity, matched against `archive/html-tool`'s actual source
  (`src/charts.js`) rather than guessed at: a searchable `<select>` picker
  over every outstanding customer (not a top-N chart — the cap that used to
  be there is gone, `limit 500` in the query is a safety ceiling only,
  same stopgap pattern as `/customers`' `limit 1000`), and a 4/12/26/52-week
  range picker on daily collection backed by a second endpoint,
  `GET /dashboard/daily-collection?weeks=N`, called only when the range
  changes so switching it doesn't re-run the KPI/donut/bank-bar queries.
  Both have a real "View as table" now (`ChartCard`'s `table` prop) — the
  other two cards keep the disabled "soon" version.
- `PageHeader.tsx` — shared all-caps title + icon-button row (email/export),
  used by Overview and Customers so they read as one app. The icon buttons
  are visibly present but disabled, same "soon" treatment as an unbuilt nav
  item — nothing pretends to work that doesn't yet.
- `format.ts` — presentational number formatting only (the Cr/L compact
  form, plus a UTC-safe short-date formatter for the daily-collection
  chart's axis). Never derives a figure; every number it touches was
  already computed by the API.
- `CustomersScreen.tsx` — the actual data table: client-side search filter,
  color-coded stage badges (REGISTERED/BOOKED/AGREEMENT DONE/UNSOLD/HOLD/
  CANCELLED), all from data the API already sent — no new business logic
  on the frontend.
- `types.ts` — shared `Identity`/`Customer`/`DashboardKpis` types matching
  what the API returns.

`/customers` API route currently caps at `limit 1000` (was `limit 200`,
which silently hid 88 of Shilpkaar's 288 real customers once seed data
landed — this is a stopgap, not real pagination; fine today, won't be once
a builder has thousands of customers).

`/dashboard/overview` computes every figure and every percentage between
them in one SQL query (`apps/api/src/index.ts`), RLS-scoped like every other
route. "Amount due" — what balance outstanding and collection efficiency are
measured against — is the sum of `customer_milestones.amount_due` where a
milestone has actually come due (`status` in `due`/`partial`/`paid`), not the
full eventual agreement value. Not yet independently confirmed against the
live Shilpkaar/Aarambh numbers in the deployed UI — worth a look next time
someone's logged in, especially if a tile looks off.

## Not started yet

- No admin UI for provisioning `staff_users`/`builder_users` — still
  manual SQL via Neon's SQL Editor.
- Customers has real CRUD now (list, create, view/edit full record,
  record a payment — see `docs/TECHNICAL_DOCUMENTATION.md` §4-5). Every
  other table — projects, towers, inventory, banks, bank accounts,
  payment milestones — still has no screen at all, list or otherwise.
  Editing co-applicants and deleting a customer (soft delete, an
  `is_active`/archived-style field — explicit decision, not built yet)
  are the two known gaps on the Customers side specifically.
- The ServiceNow-style record view this was heading toward (a record
  opens in its own tab alongside the list, configurable "highlight
  fields," Overview/Details/Related-records tabs per record) — the list
  side of this shipped as `DataTable.tsx`; the record-view redesign is
  the deliberately-deferred next increment.
- `packages/calc-engine` — porting the verified calculation logic (basic
  value, agreement value, GST/stamp-duty breakdowns) from the existing MIS
  HTML tool.
- Real pagination on `/customers` (see above).
- CI (`.github/workflows/ci.yml`) reports pass/fail on every push but doesn't
  yet **block** one from landing — this repo has no PR gate, and GitHub
  Actions runs after a push is already received. That needs branch
  protection with "require status checks" turned on in the repo's GitHub
  settings, a manual toggle for whoever has admin on the repo.
- `docs/BUILDER_AGREEMENT_DRAFT.md` (and `docs/SUPPORT_ACCESS_COMMITMENT.md`,
  its Section 5) are drafts — need a lawyer before anything a builder
  actually signs. Guardrail #5, the last one on the pre-launch list.

## Documentation practice

**`docs/DEFINITION_OF_DONE.md` is the actual checklist — run it against
every change before calling it complete, not just when something visibly
breaks.** Its first section is documentation itself (the three items
below, checked before anything else); its later sections cover visual
verification, deploy verification, and disclosing known gaps. This
section explains *what* the three docs are; that file is *the checklist
that enforces updating them*.

Three living reference docs exist alongside this narrative one, and
**every change — however small — updates the relevant ones in the same
commit**:

- `docs/TECHNICAL_DOCUMENTATION.md` — schema map, data-flow diagrams
  (Mermaid, so they render on GitHub and stay diffable as plain text —
  not images, not a Word file), an API route table, and a frontend
  file-by-file index. The answer to "which file do I look at when this
  breaks."
- `docs/FUNCTIONAL_GUIDE.md` — the same platform, screen by screen, in
  plain business language for a non-technical reader (a builder, a new
  staff member) — what a button does, what a number means, which
  settings are configurable and where. No jargon, no file paths.
- `docs/portal/index.html` — a single searchable, browsable HTML
  rendering of the two docs above (left nav by category, keyword search
  across every article, Mermaid diagrams rendered for real). Not a third
  independent source — it needs the same manual update whenever either
  of the two above changes, or it drifts.

Division of labor with *this* file: `CLAUDE.md` stays the narrative —
decisions made, bugs found and fixed, commit-by-commit history, the
"why." The docs above are the reference — always-current structure,
never a history. A new table, route, or screen gets a row/diagram/section
in the technical doc, a plain-language paragraph in the functional
guide, and a matching edit in the portal before that change is considered
done, the same way a schema change was already expected to update this
file's own sections.

**In-code comments** follow the same spirit this repo has used from the
start (see how liberally `apps/api/src/index.ts` and every `apps/web/src/
*.tsx` file already explain themselves) — explain the *business* reason
for a piece of code in plain English (what a customer/builder/staff
member would call it), not just what the code technically does. This
doesn't mean renaming variables or functions to business terms — code
still needs real identifiers — it's about what the prose *around* the
code says. That's already been the practice throughout; this just names
it so it stays deliberate rather than accidental.

## Working style notes (for whoever picks this up next)

Azhar is comfortable with git basics but is a first-time deploy/production
user — prefers exact copy-paste commands and being told precisely what a
"good" result looks like (an exact byte count, an exact row count) so he
can self-verify rather than guess. Prior to this file, changes were
shipped as zip files he'd extract and manually merge into this folder,
which caused a near-miss once (a bulk extract-and-replace left 4 changed
files staged as *deleted* in git rather than replaced — caught before
committing, recovered with `git restore --staged --worktree`). This
session moved to writing files directly into this local folder instead
(once folder access was granted) — much less error-prone, worth continuing
that way rather than going back to zips.

**Instruction fidelity is mandatory:** follow Azhar's wording and requested
scope exactly. Do not guess, add, simplify, or improve behavior, labels,
styling, or scope beyond the command. If an interpretation or improvement
would be reasonable but was not explicitly requested, ask for permission
before implementing it.

**Node is not installed on this machine, and `node_modules` has never been
installed in this folder.** Nothing here can be built, typechecked or run
locally — `npm run build`, `tsc` and the isolation test suite are all
unavailable, so a Render deploy is currently the first place a type error would
surface. Render keeps the last successful deploy when a build fails, so a bad
push stalls the site rather than breaking it, but it does mean "it compiles" is
an assumption until Render says otherwise. Installing Node here would close
that gap and is worth doing.

Claude Code, unlike the session this file was written in, can run shell commands
and git directly, so the commit/push loop no longer needs to be handed over as
copy-paste. `db/migrations` still goes through Neon's SQL Editor by hand: there
is no connection from this machine to Neon.

This repo has no `.gitattributes` and `core.autocrlf` is on, so git warns on
every add that LF will become CRLF. Harmless today, but a `.gitattributes`
pinning `* text=auto eol=lf` would silence it and keep line endings stable if
anyone else ever clones this.
