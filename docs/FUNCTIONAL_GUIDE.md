# Functional Guide — How the Platform Works

**Audience:** anyone using or explaining this platform who doesn't need
the code — Azhar, a new staff member, a builder's admin, a support
conversation. No technical jargon. For "which file does this" or "how is
this built," see `docs/TECHNICAL_DOCUMENTATION.md` instead.

**Keep this updated.** Every new screen, every new setting, every changed
button gets a line here in the same commit that ships it — this is the
document that answers "how do I..." and "what does that do," and it goes
stale the moment a screen changes without it.

---

## 1. What this platform is

A shared, private dashboard where:
- **Perfect Solutions staff** log in and see every builder's customers,
  collections, and loan pipeline in one place.
- **A builder's own team** (their admins/CRM staff) log in and see only
  their own project's customers and numbers — never another builder's.

It's meant to replace the old Excel-based MIS workbook, with the same
numbers, live and always up to date, instead of a file someone has to
update and re-share by hand.

## 2. Logging in

Sign-in is handled by Clerk (email/password or "Continue with Google") —
Perfect Solutions never sees or stores a password. Once signed in, the
platform automatically knows whether you're staff or a specific builder's
team member, and shows the right data — there's no separate step to pick
which builder you're viewing.

## 3. The Overview screen

The first thing you see after signing in — six number tiles and four
charts, all live from the database (nothing here is a fixed report that
needs regenerating).

**The six tiles:**
| Tile | What it means |
|---|---|
| Total agreement value | The sum of every customer's agreement value |
| Total received | Every rupee actually collected so far, across every customer |
| Balance outstanding | What's still owed on amounts that have actually come due (not the full eventual agreement value — see below) |
| Loan amount sanctioned | Total loan amount sanctioned across every customer with a loan case |
| Collection efficiency | Received vs. amount due, as a percentage |
| Units tracked | How many customers/units are in view |

**"Amount due" vs. "agreement value":** balance outstanding and
collection efficiency are measured against milestones that have actually
come due (a payment stage that's been reached), not the full eventual
agreement value — so this can be a smaller number than "total agreement
value minus total received," on purpose.

**The four charts**, all with a "View as table" option and hover for
exact figures:
- **Disbursement split** (donut) — how many loan cases are in each
  status. Hover a slice to see it expand and show its exact count/percent.
- **Loan by bank** (bar) — sanctioned loan amount, ranked by financing
  bank.
- **Outstanding balance by customer** (bar) — searchable picker over
  every customer with an outstanding balance, not just a top handful.
- **Daily collection** (line) — collections over time, with a range
  picker (last 4/12/26/52 weeks).

## 4. The Customers screen

A live, searchable, sortable table of every customer you have access to.

- **Sort** — click any column header to sort by it; click again to
  reverse the order.
- **Search within a column** — click the ⋮ next to a column header for a
  focused search on just that column (Contains, or Starts with).
- **Search everywhere** — the search box above the table searches name,
  phone, email, and stage all at once.
- **Choose which columns show** — the gear icon opens a two-list picker:
  move columns between "Hidden" and "Visible," then Save. **This choice
  is remembered on this browser/device only** — it doesn't follow you to
  a different computer, and it isn't shared with anyone else who logs in.
- **Advanced filters** — the funnel icon beside the gear opens a filter
  builder. Choose a field, an operation (contains, starts with, ends with,
  is, is not, is one of, is empty, or is not empty), and a value. Add
  multiple AND conditions inside a group, add additional OR groups, group
  the results by a field, and choose a sort direction. Nothing changes until
  you press **Run**; **Cancel** leaves the current list unchanged.
- **New customer** — opens a full page (not a popup) with a short form:
  name, agreement no., phone, email, stage — plus, for staff only, which
  builder. Required fields are marked with a red `*`. Everything else on
  the record gets filled in afterwards by opening the new customer and
  editing it, same as any existing customer.

Clicking any row opens that customer's full record **in its own tab**,
above the table — a "Customers" tab is always there and never closes;
each record you open gets its own tab next to it, with an ✕ to close it.
Open more than one at once and switch between them freely; opening
"New customer" works the same way, as one more tab. Switching away to
another screen in the sidebar and back to Customers brings your open
tabs back too — closing a tab is the only thing that actually loses it.

## 5. A customer's record

Opens when you click a row in the Customers table. The name, client no.,
stage, and the **Edit** / **Save** / **Cancel** buttons sit in a header
that stays the same no matter which of the 3 tabs below is open —
clicking Edit always takes you to the Details tab, since that's the only
one with anything editable on it.

**Overview** — a dashboard for this one customer:
- **Summary tiles** — agreement value, received, amount due, balance —
  same definitions as the Overview screen's tiles, for this customer only.
- **Milestone progress** — a bar showing how many of this customer's
  payment milestones are paid, partially paid, due, or not yet due.
- **Recent payments** — the last 3 payments received, newest first.

**Details** — the full record, in five sections (Identity & contact,
Dates, Pricing & costs, Funding & loan, Status). **Edit** switches all
five into edit mode at once; **Save** commits every changed field
together, **Cancel** discards.

**Related records** — everything tied to this customer:
- **Co-applicants** — shown, but not yet editable from this screen.
- **Record a payment** — logs a new payment against this customer
  (date, flat cost received, GST received, source, remark). This only
  ever *adds* a new entry — a payment already recorded can't be edited or
  deleted from here (see §7, "Why payments can only be added, not
  changed").
- **Payment history** and **Payment milestones** — two tables: every
  payment ever recorded, and the tower's payment schedule for this
  customer (what's due, when, and its status).

## 6. Branding

The logo and colors are Perfect Solutions' real brand assets (not a
placeholder) — the icon mark is the browser tab icon and the small mark
in the sidebar; the full logo-with-wordmark appears on the sign-in
screen. All on-screen text uses IBM Plex Sans, the same typeface family
the printed brochure uses for its titles and labels.

## 7. Things that are deliberate, not bugs

- **A payment can't be edited or deleted, only added.** This matches how
  a financial ledger should work — if a payment was recorded wrong, the
  fix is a new correcting entry, not silently rewriting history. (A proper
  "reversal entry" button isn't built yet — for now, correcting a mistake
  needs a manual follow-up entry.)
- **Recording a payment doesn't automatically update which payment
  milestone it counts against.** The payment shows up immediately in the
  history and in "total received," but the milestone schedule's own
  due/paid status needs to be updated separately for now.
- **PAN and Aadhaar numbers show in full, to everyone who can open the
  record.** Whether some roles should see a masked version instead is a
  real open decision, not yet made — see `docs/LAUNCH_GUARDRAILS.md`.
- **Column visibility (the gear icon) is per-browser, not per-account.**
  It doesn't follow you between devices, and one person's layout doesn't
  affect anyone else's.
- **Sidebar items and icon buttons shown but greyed out** (Customer 360,
  Reliability, Forecast, Collections, Documents, the email/export icons)
  are real, planned screens that simply aren't built yet — they're shown
  disabled on purpose, so the eventual shape of the app is visible without
  pretending something works that doesn't.

## 8. What's not built yet

- Screens for anything other than Customers — Projects, Towers,
  Inventory, Banks, Bank Accounts all exist in the database but have no
  screen of their own yet.
- Editing co-applicants from the customer record.
- A reversal/correction flow for a wrongly-recorded payment.
- Any admin screen for adding new staff or builder logins — that's still
  done by hand, by whoever has direct database access.
- Real pagination on the Customers list (it currently shows up to 1,000
  customers at once, which is fine today and won't be forever).

---

*For the technical side of any of this — which file, which database
table, which API call — see `docs/TECHNICAL_DOCUMENTATION.md`.*
