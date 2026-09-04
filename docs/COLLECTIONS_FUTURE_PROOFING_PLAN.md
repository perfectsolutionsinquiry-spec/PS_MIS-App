# Collections Application — Future-Proofing Plan

## Purpose

This is the approved implementation plan for the Collections application.
It explains what we build now, what we deliberately defer, and which small
foundations must be reusable when future applications are added.

This document is written so a future developer or AI assistant can execute
the work without guessing.

## Strategic objective: Collections is the first bounded application

Collections is the first bounded application in the architecture described by
the platform handbook. We are not building a throwaway application and
planning to rewrite it later. We are building the minimum reusable foundation
needed for tenant isolation, identity, authorization, audit, financial
integrity, exportability, and future application boundaries.

The future platform may present multiple applications through one product
experience. That is a later product decision, not a reason to introduce a
generic schema or framework now. Shared platform services may be reused;
application business rules and private data remain separately owned.

Scalability has four required dimensions:

1. **Data scale:** more tenants, customers, payments, documents, and history
   without loading everything into one browser or changing financial meaning.
2. **User scale:** more staff and tenant users with explicit roles,
   capabilities, scoped access, and audited support access.
3. **Application scale:** more bounded applications that reuse platform
   services without coupling their private data to Collections.
4. **Operational scale:** independent workers, deployments, regions, providers,
   backups, and observability when measurements justify them.

The current viewing experience must remain stable while the server-side
foundation is designed for these measurable concerns.

## Evidence rule for future changes

Add a future-proofing abstraction only when at least one of these is true:

1. The platform handbook requires it for the current stage.
2. The current Collections application already needs it.
3. A second application or provider has a documented, concrete requirement
   for it.
4. A production safety, isolation, financial-integrity, portability, or
   operational problem is demonstrated by a test or incident.

Do not add speculative framework layers, generic tables, providers, services,
workflow engines, or configuration systems because they might be useful later.
Record deferred ideas under the deferred section instead.

## Non-negotiable product rule

The current user experience must remain stable while this work is delivered.
Existing navigation, branding, Customers screens, filters, record URLs,
React Aria controls, and current business terminology must not be changed
unless a separate request explicitly asks for that change.

If an implementation choice is not specified here, ask for permission before
changing behavior, labels, layout, or scope.

## Current scope

### Build now

Only the Collections application is being built:

- Customers
- Projects and towers
- Inventory units
- Payment milestones
- Recovery transactions and collections
- Loan information already supported by the current application
- Collections reporting and exports

### Generalize now

Generalize only the small foundations that every future application is
expected to reuse:

- Tenant-aware request context
- Provider-neutral identity types
- Capability-based authorization
- Audit events
- Settings scope
- Export contract
- Repository/application-service boundaries
- A future-compatible event/outbox seam

### Deliberately defer

- Microservices
- A second database engine
- Vendor Risk screens
- Partner CRM screens
- A visual workflow designer
- Arbitrary tenant-authored scripts
- A universal generic `records` table
- Full regional cell routing
- A complete platform administration UI

## Provider replaceability and deployment rationale

The current providers are useful operational choices, not permanent business
dependencies:

| Current provider | Current responsibility | Replacement rationale |
|---|---|---|
| Clerk | Authentication, session identity, and sign-in UI | Authentication must be replaceable without changing Collections business rules or database ownership. |
| Neon/PostgreSQL | Relational storage, transactions, and RLS | PostgreSQL remains the reference database because the current schema and RLS are strong; Neon-specific access must not spread into domain code. |
| Render | API and frontend deployment | Deployment should be replaceable without changing application contracts, tenant rules, or export behavior. |

### Approved approach

1. Keep Clerk, Neon/PostgreSQL, and Render for the current product.
2. Do not add a second provider merely to demonstrate portability.
3. Hide provider details behind small interfaces for new code:
   - identity verification
   - tenant/context resolution
   - unit of work and repositories
   - object storage
   - event publishing
   - telemetry
4. Keep provider adapters at the edge of the system.
5. Keep business services dependent on internal types and interfaces, not
   Clerk objects, `pg` result types, Render APIs, or Neon-specific behavior.
6. Maintain a versioned tenant export so data can leave the provider stack.
7. Add a second-provider conformance test only when there is a real migration
   or procurement need.

This is practical replaceability, not a promise that every database,
authentication vendor, or hosting platform can be swapped without migration
work. The goal is to prevent provider replacement from becoming a rewrite of
Collections or every future application.

## Multi-application foundation

Collections is the first application, not the whole platform. The foundation
must make a second application possible without making Collections a shared
database of everything.

### Shared platform layer

Future applications may reuse:

- user and identity links
- tenant and membership context
- roles and capabilities
- audit events
- settings and feature flags
- export and import contracts
- object/file metadata
- workflow/task contracts
- event envelopes and outbox processing
- request correlation and telemetry

### Collections-owned layer

Collections owns its:

- customer and co-applicant records
- projects, towers, and units
- milestones and obligations
- payments, allocations, adjustments, and reversals
- loan and collection workflows
- Collections reports

Future applications must not directly update these private tables. They should
use explicit contracts, read models, or approved application services.

### Rules for adding a future application

Before a second application is built:

1. Give it a separate application identity and manifest.
2. Give it explicit tenant installation/entitlement rules.
3. Give it an owned schema namespace and migration set.
4. Reuse platform identity, authorization, audit, settings, export, and
   telemetry instead of copying them.
5. Define which shared concepts are contracts rather than shared mutable
   tables.
6. Add tests proving it cannot bypass tenant isolation or read Collections
   private data accidentally.
7. Keep its routes, services, repositories, and UI modules separate from
   Collections.

### Scaling path

Start as a modular monolith. Scale the busiest application or worker
independently only when measurements justify it. The logical boundaries come
first; separate deployables or services come later. This avoids premature
microservices while preserving a clear path to multiple applications, cells,
or providers.

## Multi-application scalability guardrails

1. **Bounded applications.** A future shared product experience may provide
   common navigation and sign-in, but each application keeps its own
   routes, services, repositories, migrations, permissions, and vocabulary.
2. **Shared platform, not shared mutation.** Identity, tenant context,
   authorization, audit, settings, exports, files, events, and telemetry may
   be reused. Applications must not directly mutate another application's
   private tables.
3. **Tenant isolation at every layer.** Tenant scope must exist in requests,
   authorization, database policy, background jobs, exports, files, search,
   and logs.
4. **Contracts before extraction.** Stable internal contracts are established
   before a module becomes a separate deployable or service.
5. **Independent scaling by measurement.** A slow report, export worker, or
   high-volume application may scale independently without forcing every
   application to scale together.
6. **Portability by design.** Provider adapters, canonical exports, migration
   evidence, and restore procedures prevent the foundation from becoming
   trapped in one vendor.
7. **Financial correctness over convenience.** Payment writes, reversals,
   allocations, approvals, idempotency, and audit evidence remain correct
   under retries, concurrency, and background processing.
8. **No premature generalization.** Add generic abstractions only for real
   shared use cases; future-proofing must not turn Collections into an
   unreadable framework.

## Super-app maturity path

| Stage | What exists | Scaling decision |
|---|---|---|
| 1. Collections foundation | One modular monolith, one application, current providers, strong RLS and CI | Optimize correctness and boundaries; no microservices |
| 2. Platform kernel | Shared identity, tenant context, capabilities, audit, settings, export, events, telemetry | Add a second application only after boundary tests pass |
| 3. Multi-application monolith | Multiple bounded apps in one deployable with owned schemas and contracts | Scale slow workers or modules independently where useful |
| 4. Selective extraction | A measured bottleneck becomes a worker or service with explicit contracts | Extract only the bottleneck, not the whole platform |
| 5. Cell/provider scale | Tenant placement, regional cells, provider adapters, controlled migrations | Add regions or providers only for a real business, resilience, or residency need |

The platform must be able to stop safely at every stage. A later application
is ready only when it can be added, secured, operated, exported, and scaled
without damaging the existing Collections product.

## Scalability completion test before a second application

- [ ] Tenant isolation is proven across API, database, jobs, exports, files,
      and search.
- [ ] A capability can be granted to one application without granting
      unrelated application access.
- [ ] Audit evidence identifies actor, tenant, application, action, and
      reason.
- [ ] Collections private tables have an explicit ownership boundary.
- [ ] A new application's migrations and routes can be added without editing
      unrelated Collections business logic.
- [ ] A tenant export can be produced independently.
- [ ] Payment operations remain idempotent and auditable under retries.
- [ ] CI tests isolation and application-boundary rules automatically.

## Plain-language definitions

### Tenant

A tenant is one organization whose data must be separated from another
organization's data. In the current application, a builder is the tenant.
For example, Shilpkaar is one tenant. Its customers, projects, units,
milestones, and payments belong to Shilpkaar.

A tenant is not a user, customer, project, or login. Perfect Solutions staff
may be allowed to work across tenants, but that access must still be
permission-controlled and audited.

### User

A person who authenticates with Clerk and is linked to a local staff or
builder identity.

### Membership

The relationship between a user and a tenant/application, including roles,
capabilities, and scope.

### Application

A bounded business product. The current application is Collections. Future
applications may reuse the platform foundations without reading Collections'
private tables directly.

### Role

A named bundle of capabilities, such as Collections Manager or Finance
Operator. A role is not the complete authorization decision.

### Capability

One exact action, such as `customers.read`, `payments.record`, or
`payments.reverse`.

## Current table-schema rationale

The current schema is intentionally optimized for the Collections application
and the imported MIS data. It is not yet the final platform-wide schema.
Tables remain business-specific so the current application stays understandable
and safe to operate.

| Table | Why it exists now | Boundary and future direction |
|---|---|---|
| `builders` | The current organization/tenant root for Collections. | Keep as the compatibility root while a future tenant registry is introduced gradually. |
| `builder_users` | Links a builder's Clerk users to one builder. | Keep for current identity lookup; future membership/capability records should become the authorization source. |
| `staff_users` | Identifies Perfect Solutions staff who may work across builders. | Keep separate from tenant users; future staff access must be capability-controlled and audited. |
| `projects` | Stores a builder's real-estate projects. | Collections-owned operational data; retain direct tenant ownership for reliable RLS. |
| `towers` | Stores buildings within a project. | Collections-owned project structure; future applications must use contracts, not direct private-table joins. |
| `inventory_units` | Stores saleable flats/units and their project relationship. | Collections-owned inventory; later booking concepts may be separated without losing this source data. |
| `payment_milestones` | Stores reusable payment-schedule templates for towers. | Template data is distinct from a customer's actual obligations. |
| `customer_milestones` | Stores the customer-specific obligation generated from a milestone template. | Keeps what is due separate from what was received; future payment obligations can be modeled explicitly. |
| `customers` | Stores the current buyer record and the raw facts imported from the MIS workbook. | A practical Collections aggregate today; later it may be decomposed into party, account, booking, agreement, and loan-case concepts. |
| `co_applicants` | Stores people associated with a customer's booking or loan. | Preserve the relationship; future party/person modeling can make co-applicants reusable without changing the current screen first. |
| `recovery_transactions` | Stores each received payment as the financial source of truth. | Insert-only direction is intentional; future corrections use reversals, adjustments, allocations, idempotency, and reconciliation. |
| `banks` | Shared financing-bank reference data. | Cross-tenant reference data; not Collections customer-owned data. |
| `bank_accounts` | Stores builder collection bank accounts. | Tenant-owned financial configuration; future access must be capability-restricted and audited. |
| `app_settings` | Stores current application display configuration such as highlighted customer fields. | The current table is a small compatibility step; future settings need scope, typing, validation, versioning, and audit. |

### Schema decisions that must be preserved

1. Tenant-scoped tables carry their tenant ownership directly where required
   for dependable RLS; do not rely only on multi-hop joins for isolation.
2. Raw business facts are stored; spreadsheet-derived figures are not copied
   into competing stored columns.
3. Payment history is not overwritten to create a new balance. Balances are
   calculated from authoritative obligations and posted transactions.
4. Shared reference data is separate from tenant-owned operational data.
5. New platform-level tables must use tenant-neutral concepts, while existing
   Collections tables may retain `builder_id` during a tested compatibility
   migration.
6. No future application may directly alter Collections-owned tables without
   an explicit contract and migration plan.

### Why we are not normalizing everything now

The blueprint's future model separates party, customer account, booking,
agreement, unit, obligation, receipt, allocation, adjustment, and loan case.
That is the right direction for Collections v2, but replacing the current
schema immediately would create migration and production risk without a current
user-facing requirement. The approved approach is expand-contract: add
compatibility structures, backfill and reconcile, move reads/writes, verify
counts and access, then remove obsolete structures only after approval.

## Approved role model for Collections

Implement only the roles needed by Collections now. Keep the model capable of
supporting future applications later.

| Role | Intended scope |
|---|---|
| Platform Staff | Perfect Solutions internal user; access is still capability- and audit-controlled |
| Tenant Administrator | Manages one builder tenant's users and tenant configuration |
| Collections Manager | Manages day-to-day Collections operations and reports |
| Collections Operator | Performs permitted customer and collection work |
| Finance Operator | Records and reviews ordinary payment activity |
| Read-only User | Views permitted records without changing them |
| Support Staff | Temporary, reason-based support access; not an unrestricted permanent role |

Initial capability examples:

```text
customers.read
customers.create
customers.edit
customers.archive
projects.read
inventory.read
milestones.read
payments.read
payments.record
payments.adjust
payments.reverse
payments.approve
reports.read
customers.export
users.manage
tenant.settings.manage
```

The existing `builder_users.role` value may remain as a compatibility field
while the capability model is introduced. Do not remove it until migration
and access tests prove the replacement is complete.

## Approved implementation checklist

Status meanings:

- `[ ]` not started
- `[~]` in progress
- `[x]` complete and verified
- `[D]` deliberately deferred

### Phase 0 — Protect the existing experience

- [x] Record the current routes, tables, roles, permissions, and migrations.
- [x] Record the current Customers screen behavior as the regression baseline.
- [ ] Confirm that no foundation change alters current labels, navigation,
  filters, table behavior, or URL-backed customer detail navigation.
- [ ] Keep current `builder_id` behavior working during all compatibility work.
- [ ] Add or update documentation in the same change as every implementation.
- [ ] Require CI status checks in branch protection before relying on CI as a
  merge gate.

### Phase 1 — Define Collections authorization

- [ ] Define the capability catalogue in one server-owned module.
- [ ] Define the approved Collections roles and their capability bundles.
- [ ] Introduce an internal membership/context type without changing the
  current login experience.
- [ ] Enforce capabilities on the server, never in the frontend alone.
- [ ] Keep staff access explicit and auditable rather than treating staff as
  an automatic unrestricted role.
- [ ] Add tests for tenant user, staff user, read-only user, finance operator,
  and denied actions.

### Phase 2 — Add tenant-aware request context

- [ ] Create a request context containing verified user ID, tenant ID,
  application ID, staff status, correlation ID, and capabilities.
- [ ] Resolve the context only from the verified Clerk identity and local
  database records.
- [ ] Keep `builder_id` as the current Collections database compatibility
  field.
- [ ] Use tenant context in new services and repositories.
- [ ] Keep RLS session variables and the business query in the same database
  transaction.
- [ ] Test that one tenant cannot read or mutate another tenant's data.

### Phase 3 — Add audit-event foundations

- [ ] Add an append-only audit event model and migration.
- [ ] Record actor, tenant, application, action, object, timestamp,
  correlation ID, and reason where required.
- [ ] Audit customer edits, archive actions, payment writes, payment
  corrections/reversals, exports, role changes, and staff access.
- [ ] Make audit records unavailable for ordinary update/delete operations.
- [ ] Add tests proving sensitive actions create the expected audit evidence.

### Phase 4 — Strengthen payment integrity

- [ ] Use decimal-safe money handling and store currency explicitly.
- [ ] Add an idempotency key for payment creation.
- [ ] Reject duplicate submissions safely.
- [ ] Keep posted payment records immutable.
- [ ] Implement corrections as adjustment or reversal records, never silent
  edits or deletes.
- [ ] Require a separate approval capability for reversals and corrections.
- [ ] Preserve allocation history between receipts and obligations.
- [ ] Add reconciliation checks for totals, duplicates, and reversals.
- [ ] Document the correction policy in the Functional Guide.

### Phase 5 — Extract Collections services

- [ ] Keep HTTP route handlers thin.
- [ ] Create Collections application services for customer, milestone,
  payment, and reporting use cases.
- [ ] Create repository interfaces for database operations.
- [ ] Keep PostgreSQL as the reference adapter; do not add another database
  engine now.
- [ ] Keep Clerk behind an identity verification boundary for new code.
- [ ] Prevent Collections code from importing future application modules.
- [ ] Move existing routes incrementally, one use case at a time.
- [ ] Run build, isolation, authorization, and migration tests after each
  extraction.

### Phase 6 — Add scalable Collections queries

- [ ] Replace the Customers `limit 1000` stopgap with server-side cursor
  pagination.
- [ ] Make filtering and sorting server-owned for large result sets.
- [ ] Preserve the current filter and search experience while changing only
  the data-loading mechanism.
- [ ] Use stable, tenant-safe sort keys and cursors.
- [ ] Add tests for first page, next page, empty page, filters, sorting, and
  tenant isolation.

### Phase 7 — Add tenant export

- [ ] Define a versioned Collections export contract.
- [ ] Export one tenant only, subject to authorization.
- [ ] Include customers, projects, units, milestones, payments, and relevant
  reference relationships.
- [ ] Include schema version, export time, counts, and checksums.
- [ ] Audit every export request and completion.
- [ ] Add an import/validation plan before promising portability.
- [ ] Do not expose an export button in the UI until the server behavior is
  implemented and verified.

### Phase 8 — Strengthen tests and migrations

- [ ] Add migration upgrade tests from the current schema.
- [ ] Add authorization matrix tests for roles and capabilities.
- [ ] Add repository/adapter contract tests.
- [ ] Add payment idempotency, reversal, and reconciliation tests.
- [ ] Add export completeness and tenant-isolation tests.
- [ ] Add audit evidence tests.
- [ ] Rehearse restore and roll-forward procedures.
- [ ] Keep CI builds for both workspaces and the real PostgreSQL RLS suite.

## Future platform capabilities — design now, build later

These are architectural targets, not current delivery tasks:

| Future capability | Current decision |
|---|---|
| Universal `tenant_id` | Introduce gradually; do not rename all `builder_id` columns now |
| Platform tenant registry | Add when a second application or tenant lifecycle requires it |
| App registry/manifests | Define ownership boundaries now; build before the second app |
| Transactional outbox/inbox | Add a seam during important write work; build full processing when events are needed |
| Object/blob storage | Add before storing customer or vendor documents |
| Workflow/task runtime | Start with one approval workflow; do not build a designer first |
| Canonical export/import | Implement for Collections before making portability claims |
| OpenTelemetry | Standardize request/correlation fields now; add full tracing before scale |
| Regional cells and residency | Do not promise India-only residency until runtime, data, backups, logs, and support access are covered |
| Provider replaceability | Use ports for new code; retain Clerk/PostgreSQL adapters |

## Architecture rules for future work

1. Collections owns Collections business rules and private tables.
2. Platform foundations own identity, tenant context, authorization, audit,
   settings, export contracts, and shared infrastructure seams.
3. Applications communicate through contracts/services, not direct SQL joins
   into another application's private tables.
4. The API decides access and business values; the frontend displays them.
5. Financial records are append-only after posting.
6. Tenant isolation is enforced by the server and database, never by a
   client-supplied tenant ID.
7. Every migration is additive/expand-contract where practical, reversible by
   a documented roll-forward path, and tested before production.
8. Every deliberate gap is documented rather than implied to be complete.

## Completion gate

The Collections future-proofing work is complete only when:

- all Phase 1–8 checkboxes are checked or explicitly marked deferred;
- current user-facing behavior still matches the Functional Guide;
- Technical Documentation contains the final routes, tables, modules, and
  data-flow diagrams;
- the documentation portal has been updated;
- CI passes builds, migrations, isolation tests, authorization tests, and
  targeted financial tests;
- production verification is recorded after deployment;
- unresolved risks and deferred capabilities are stated plainly.
