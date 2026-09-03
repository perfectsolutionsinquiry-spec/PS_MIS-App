# Vision and Roadmap — Perfect Solutions Financial Distribution Platform

Written 3 September 2026, for decision-making before wider builder launch. Synthesises
the business vision already on record (project brief, company profile, brochure draft)
with the technical platform plan (`claude/Platform Plan - Architecture Options and
Costs.md`, `claude/Platform Layer - How Far to Take It.md`) and where the build actually
stands today. Nothing here is new strategy — it is the existing strategy written down in
one place so decisions get checked against it, rather than re-litigated each time.

## The positioning, stated plainly

Perfect Solutions is not a DSA (direct selling agent) that happens to have a website. It
is a **financial distribution and advisory company** — DSA/loan distribution is the
current engine, not the ceiling. Say this out loud whenever a decision risks narrowing
the company back down to "loan agent with an app."

Tagline: *Turning your financial dreams into reality.*
Company description: *financial distribution and advisory — loan services.*
Vision (long-term): become Maharashtra's trusted financial distribution network, then
obtain direct DSA codes from major banks (SBI, ICICI, and others) at scale, rather than
routing everything through a handful of existing codes and aggregators.

## The four businesses under one roof

Everything being built — including this MIS platform — serves one of four connected
lines. They are sequenced, not simultaneous; each one funds and feeds the next.

1. **Loan distribution (the DSA business, today's core).** Home loans, home
   construction/renovation finance, plot purchase, balance transfer, loan against
   property, business/professional funding, vehicle and asset finance. Currently
   running on a small number of directly-held bank DSA codes plus partner channels —
   evaluating Apna Rupi, Andromeda, and Rubique (or whichever gives the best long-term
   terms) as the interim aggregation layer while direct codes are built out one bank at
   a time.

2. **Builder / channel partner business (what this platform exists to run).** Perfect
   Solutions becomes the financial channel partner for real-estate developers: handling
   disbursement coordination, collections tracking, and the finance layer for every flat
   a partnered builder sells. First live partner is Shilpkaar (project Aarambh, ~400
   flats). This is deliberately **recurring, compounding business** — a signed builder
   keeps generating new loan leads for the life of the project, and a builder relationship
   that goes well tends to follow that builder to their next site. Initial target: 10
   builder/project-site tie-ups. Year-one stretch target: 50.

3. **The connector network.** Real estate brokers, chartered accountants, architects,
   interior designers, insurance agents, property consultants, education consultants,
   and vehicle dealers — anyone already standing next to a financial decision — as a
   lead-generation layer. Perfect Solutions processes the loan and shares commission
   back. This is lower-effort per lead than builder partnerships but scales the
   customer-acquisition side independently of how many builders are signed.

4. **The DSA workforce and Academy (phase 3, longer horizon).** Recruit and train
   individuals to become DSAs under Perfect Solutions' own corporate DSA structure —
   provide them the CRM, the SOPs, marketing support, and a training curriculum
   (monetised as the Academy), then send them into the market as an owned sales
   workforce. This is explicitly **not an education business that happens to sell loans**
   — training exists to build the workforce, the workforce is the point.

The strategic chain, in order: **customers → Perfect Solutions → financial products →
trusted partners → long-term growth.** Builders and connectors are the acquisition
engine; the Academy is what turns that engine from "as many people as Azhar can
personally manage" into an actual organisation.

## What this specific platform is (and isn't)

This MIS/dashboard build is the operating system for business line 2 — collections
tracking, funding coordination, and (eventually) the loan-distribution workflow for the
builder side. It is **not** being sold to builders as a platform, an ERP, or a DSA tool.
The internal framing (from the platform plan) is: *never say "ERP" or "platform" to a
builder — say collections and funding tracker, running by Friday.* The website language
follows the same rule from the business side: this is a financial distribution platform
with loan pages, builder pages, channel-partner pages, and a future DSA/Academy portal —
never a "DSA website."

## Competitive position

The market has full builder ERPs (In4Suite/In4Velocity, Farvision, Xpedeon) priced at
₹8–17 lakh/year plus onboarding, sold to an MD or CFO as a capex decision, live in
months. None of them track the bank leg — sanction, disbursement, lender chasing — because
none of them are a financing business. That gap is the entire point of this platform:
narrow, cheap, fast, and finance-aware, sitting next to (not replacing) whatever ERP a
larger builder already owns. At ~₹72,000/year per project against In4Suite's ~12–20×
price, Perfect Solutions is not competing for the same deal — it's solving the problem
sitting next to it (the spreadsheet next to the ERP).

## Revenue model — decide, don't drift

Two shapes of the same software, and they should not be blurred:

| | Software as the product | Software as the wedge |
|---|---|---|
| What's charged | ₹6,000–9,000/project/month | Free, when Perfect Solutions is the finance partner |
| What's earned | Subscription fee | 0.5%+ of disbursed loan value, ~70% conversion assumed |
| At 50 builders | ~₹43 lakh/year gross | ~₹3+ crore/year gross |

Recommendation on record: **free wherever Perfect Solutions is the finance partner on
that project; priced standalone otherwise.** A price on the standalone product isn't
about the revenue — it creates an owner on the builder's side, which is what makes the
tool actually get used rather than ignored.

## Platform build phases

| Phase | Scope | Builder count | Status |
|---|---|---|---|
| 0 | Run it as a manual service, learn what builders actually use | 2–3 | Done — this is how Shilpkaar came on |
| 1 | Real hosted app, Postgres, real login, one builder live end to end | 3 | **Done** — Shilpkaar/Aarambh live with real data, login working |
| 2 | True multi-tenancy hardened for real use, importer, billing, isolation testing wired into the release process, a new builder goes live in a day | 10–15 | **In progress — this is where the guardrails document below applies** |
| 3 | APIs in and out, custom domains, WhatsApp, embedded dashboards for large builders who already run an ERP | Beyond 15 | Not started |

The request that produced the companion guardrails document — "10 builders might log
in, what are the standard things before launch" — is precisely the Phase 1→2 transition.
That is the correct moment to ask it: Phase 1 tolerates being carried by hand for one
builder; Phase 2 does not.

## What's deliberately future, not current

From the brochure draft's own future-vision section, marked there as roadmap, not
present-day claims — repeated here for the same reason: **don't let a current-operations
decision get made as if these already exist.**

- Insurance solutions (subject to authorization)
- Investment and wealth advisory (subject to regulatory readiness)
- Business advisory and SME support
- A broader real estate advisory ecosystem
- A partner portal and CRM for connectors and future DSAs
- The finance Academy itself
- AI-assisted recommendations

## What "long-term" concretely means

- Own DSA codes directly from SBI, ICICI, and other major banks, not routed through an
  aggregator, once volume justifies the relationship.
- 50 builder/project-site partnerships within the year, up from the first at ~400 flats.
- A recognised financial distribution network across Maharashtra, positioned to expand
  pan-India once the Maharashtra model is provably repeatable — repeatable meaning: a new
  builder goes live in a day, not a bespoke engagement each time.
- An Academy-trained DSA workforce operating under Perfect Solutions' own SOPs, CRM, and
  marketing support, rather than a headcount of one.

None of the four business lines is optional long-term, but they are strictly sequenced:
the platform and the builder channel come first because they're the most concrete,
recurring, and already proven (Shilpkaar); the connector network layers on once the
builder channel has repeatable onboarding; the Academy comes last because it depends on
having an established brand, SOPs, and enough deal flow to make training worthwhile for
the people going through it.
