# Perfect Solutions — Builder Agreement (Draft for Legal Review)

## This is not legal language. Read this box before reading anything else.

This document is a **drafting aid**, written from the actual technical and business
facts of this platform, so a lawyer has something grounded to start from instead of a
generic SaaS template — which is exactly what `docs/LAUNCH_GUARDRAILS.md` (item 10)
warns against: *"Budget for a lawyer here rather than freehand-drafting it — this is
exactly where a generic template creates more risk than it removes."* This draft is the
input to that conversation, not a substitute for it.

**Do not send this to a builder, in this form, for signature.** Every clause needs review
by a qualified Indian contract and data-protection lawyer before it goes near anyone.
Text in `[BRACKETS]` marks a real decision (a number, a notice period, a company detail)
that needs to be made — by Azhar, or with counsel — not guessed at here. Where a clause
describes what the *software* does, it's been checked against the actual code and
migrations as of 4 September 2026; where it describes what the *business* intends to do
but hasn't built yet, that's said explicitly — a contract that promises a capability that
doesn't exist yet is worse than one that's honest about the roadmap.

---

## PERFECT SOLUTIONS — COLLECTIONS & FUNDING TRACKER
### Builder Agreement

**Between:** Perfect Solutions [legal entity name — `[BRACKET]`, registered address
`[BRACKET]`, GSTIN `[BRACKET]`, PAN `[BRACKET]`] ("**Perfect Solutions**", "**we**", "**us**")

**And:** `[Builder legal entity name]`, `[registered address]`, GSTIN `[BRACKET]`, PAN
`[BRACKET]` ("**Builder**", "**you**")

**Effective date:** `[BRACKET]`

---

### 1. What this agreement covers

Perfect Solutions provides Builder with access to a hosted collections, funding
coordination, and (where applicable) loan-distribution tracking tool for the project(s)
named in Schedule A ("**the Platform**"). The Platform is not an ERP, not a customer
relationship management system, and not a substitute for Builder's statutory accounting
or regulatory record-keeping — it is a narrow, purpose-built tracker for the finance leg
of Builder's unit sales: booking, agreement, loan sanction/disbursement status, and
payment collection against the Builder's own payment schedule.

Where Perfect Solutions is also acting as the financial channel partner / DSA for loans
originated through Builder's project (a separate, related arrangement — see Schedule B if
applicable), that relationship is governed by its own terms and is not created or varied
by this Agreement.

### 2. Fees

`[Pick one, per Schedule A, and fill in the number — see docs/VISION_AND_ROADMAP.md's
"Revenue model" for the two shapes this can take:]`

- **(a) Included at no charge**, for the duration that Perfect Solutions is acting as the
  financial channel partner for the project named in Schedule A; or
- **(b) A standalone subscription** of ₹`[BRACKET, e.g. 6,000–9,000]` per project per
  month, billed `[monthly/quarterly]`, payable within `[BRACKET]` days of invoice.

Fees, if any, do not include GST, which is payable in addition at the applicable rate.
`[Late payment / suspension terms — needs counsel: what happens to Builder's access to
its own data if a standalone invoice goes unpaid is a real question, and the answer
should not simply be "we cut off your data" — see Section 7, Data Export, which should
survive a fee dispute.]`

### 3. Data ownership

All data Builder or Builder's customers input into the Platform — customer records,
booking and agreement details, payment records, unit inventory — remains **Builder's
property**. Perfect Solutions does not acquire ownership of Builder's data by hosting it,
and does not use Builder's data for any purpose other than operating the Platform for
Builder, except as described in Section 5 (staff access) or with Builder's separate,
explicit consent.

`[A real question for counsel: does Perfect Solutions want the right to use anonymised,
aggregated data across builders for its own product analytics or benchmarking — e.g.
"average collection efficiency across N projects"? If so, that needs its own clause and
Builder's explicit opt-in, not an assumed default.]`

### 4. What the Platform's access controls actually do

This section states technical fact, not aspiration, as of 4 September 2026 — see
`CLAUDE.md` in the platform's repository for the underlying detail if this is ever
disputed or needs updating.

- Every Builder's data is isolated at the database level (row-level security, forced —
  not merely application-level filtering that a bug could bypass) from every other
  builder on the Platform. This is automatically tested on every change to the Platform's
  code (`apps/api/tests/isolation.test.ts`, run in CI on every push).
- Builder's own users see only Builder's own data. There is no configuration, request, or
  "just this once" exception under which one builder's users can see another builder's
  data.
- Financial records are never silently deleted or edited in place. A correction is
  recorded as a reversal with a reason, not an overwrite — the original record and the
  correction are both visible in the record's history.

### 5. Perfect Solutions staff access

Perfect Solutions' own staff can access Builder's data on the Platform, for the purpose
of providing support, troubleshooting, and (where applicable) delivering the
loan-distribution service described in Schedule B. This access is necessary for the
Platform to be operable and supportable at all, and is not something Builder can opt out
of while remaining on a platform Perfect Solutions hosts and is accountable for.

Perfect Solutions commits that this access is:

- **Attributed** — always tied to one named staff member's own login, never a shared or
  generic account.
- **Purpose-limited** — for an active support or service need, not standing, unlimited
  visibility into Builder's data.
- **Logged** — `[as of 4 September 2026, this is a commitment backed by internal
  discipline, not yet a technical guarantee: an automated audit log recording who
  accessed what, when, and why is planned (see docs/LAUNCH_GUARDRAILS.md guardrail #6)
  but not yet built. Counsel should decide whether this Agreement is signed before or
  after that log exists — if before, this clause needs to say plainly that the log is
  forthcoming and give a date, not imply it already exists.]`

Builder may request, in writing, a record of what Perfect Solutions staff accessed
regarding Builder's data and why, and Perfect Solutions will provide what it has —
manually, until the automated log above exists.

### 6. Personal data Perfect Solutions holds on Builder's customers

Because the Platform tracks Builder's customers' bookings and payments, it necessarily
holds personal data about them — names, contact details, and (for loan-linked units) PAN,
and in some cases partial Aadhaar details. Perfect Solutions' stated practice (not yet
fully enforced in the software as of this draft — see `docs/LAUNCH_GUARDRAILS.md`'s "PII
and data-minimisation rules") is:

- Full Aadhaar numbers are not stored unless a specific lender requires it for that loan;
  otherwise only the last 4 digits plus a document reference are kept.
- PAN and phone numbers are intended to be masked by role, so that not every login that
  can see a customer record sees their full PAN/phone — this is a design intention as of
  this draft, not yet built.

`[Counsel: this Agreement is being drafted inside India's DPDP Act transition window
(ends November 2026, full enforcement mid-May 2027, per docs/LAUNCH_GUARDRAILS.md) —
whether Perfect Solutions is a "Data Fiduciary" and/or Builder is a joint fiduciary or
principal for this data, what consent artefacts are actually required from the
end-customer (not just Builder), and what breach-notification obligations attach, all
need real DPDP-Act-specific advice, not a generic privacy clause. This is probably the
single highest-stakes section of this whole document given the ₹250 crore penalty ceiling
for a serious breach.]`

### 7. Data export

Builder has the right to obtain a complete export of Builder's own data from the
Platform, in a usable format (e.g. CSV/spreadsheet per table), on request, at any time,
including after termination of this Agreement. `[As of 4 September 2026 there is no
self-service export button in the Platform yet — see docs/LAUNCH_GUARDRAILS.md guardrail
#7, scoped for "before scaling past a handful of builders." Until it's built, exports are
manual — Perfect Solutions commits to a response time of [BRACKET] business days for a
manual export request. This clause should not promise an automated feature that doesn't
exist; it should promise the underlying right and be honest about how it's currently
fulfilled.]`

This right exists specifically so that Builder is never dependent on Perfect Solutions
continuing to operate the Platform in order to keep Builder's own records — see
`docs/VISION_AND_ROADMAP.md`'s framing of this as a trust feature, not a nice-to-have.

### 8. Support and service levels

Perfect Solutions provides support for the Platform during `[BRACKET, e.g. business
hours, IST]`, via `[BRACKET — email/phone/WhatsApp channel]`.

**No uptime or response-time SLA is promised in writing under this Agreement.** This is a
deliberate, stated position (`docs/LAUNCH_GUARDRAILS.md`), not an oversight — the Platform
is provided at the free-tier / early-stage hosting scale described in
`docs/VISION_AND_ROADMAP.md`'s build phases, and Perfect Solutions is not in a position to
contractually guarantee uptime it cannot yet back with hosting infrastructure to match.
`[Counsel: if a standalone-paying builder (Section 2(b)) will reasonably expect some
service commitment in exchange for a fee, that gap probably needs addressing explicitly
here rather than left silent — even if the answer is "best-effort, no penalty," saying so
is safer than saying nothing.]`

### 9. Confidentiality

Each party will keep confidential any non-public information disclosed by the other in
connection with this Agreement — for Perfect Solutions, that includes Builder's business
and customer data; for Builder, that includes Perfect Solutions' pricing, methodology,
and any non-public aspects of how the Platform works — except where disclosure is
required by law or regulator.

### 10. Term and termination

This Agreement runs `[BRACKET — e.g. month-to-month, or for the life of the named
project]` from the Effective Date. Either party may terminate on `[BRACKET]` days' written
notice. `[Counsel: what happens on termination — Builder's data export window (should
tie to Section 7), whether Perfect Solutions retains a copy of Builder's data after
termination and for how long (relevant to DPDP data-minimisation obligations too), and
whether any fees are owed/refundable — all need explicit terms, not left implicit.]`

### 11. Limitation of liability

`[This entire section needs to be drafted by counsel, not inferred from the technical
docs. Flagging what it needs to address, not attempting to draft it: the Platform
displays and tracks financial figures but (per CLAUDE.md's hard rule) never itself
decides loan eligibility, sanctions, or disburses funds — the underlying financial
transactions are between Builder, the customer, and the lending bank, not created by the
Platform. Liability for a figure being wrong, for downtime, for a data-isolation failure
despite the controls in Section 4, and for the Platform simply not existing (Perfect
Solutions ceasing to operate it) are all different risks with probably different
appropriate caps — do not let a single generic liability cap paper over that they're
different things.]`

### 12. Governing law and disputes

`[BRACKET — governing law, courts/arbitration forum. Given both parties are presumably
Maharashtra-based per docs/VISION_AND_ROADMAP.md, Mumbai/Pune jurisdiction and Indian law
is the likely default, but this is exactly the kind of clause a lawyer should set, not a
default assumed here.]`

### 13. Miscellaneous

`[Standard boilerplate a lawyer will add: entire agreement, amendment only in writing,
no assignment without consent, notices, severability, force majeure. Not drafted here —
this is genuinely the low-risk, template-safe part of the document.]`

---

**Signed for Perfect Solutions:** `[name, title, date]`

**Signed for Builder:** `[name, title, date]`

---

## Schedule A — Project(s) covered, and fee basis

`[Project name(s), Perfect Solutions entity acting as finance partner Y/N, fee basis per
Section 2.]`

## Schedule B — Loan distribution / DSA relationship (if applicable)

`[Only needed if Perfect Solutions is also the financial channel partner for loans
originated through this project — see docs/VISION_AND_ROADMAP.md business line 2. This is
a related but legally distinct relationship from the software-access terms above and
probably deserves its own schedule or even its own agreement, per counsel's judgment.]`
