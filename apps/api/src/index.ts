import Fastify from "fastify";
import cors from "@fastify/cors";
import { dbPing, pool } from "./db.js";
import { requireAuth, requireCapability, withTenantClient } from "./auth.js";

// RULE FOR THIS WHOLE APP: every route here is the only place that decides
// anything that matters — access checks, calculations, who owns which row.
// The frontend (apps/web) only ever displays what this API hands it and
// never enforces authorization or computes a figure on its own. See
// docs/DEPLOY_PLAN.md and claude/Platform Plan - Architecture Options and
// Costs.md in the project for why.

const app = Fastify({ logger: true });

// The frontend runs on a different URL than this API, so the browser needs
// explicit permission (CORS) to call it. Set FRONTEND_ORIGIN once the
// frontend has a real deployed URL; until then this allows any origin,
// which is fine because every route below still requires a valid Clerk
// session — an open CORS policy alone can't read anyone's data.
await app.register(cors, {
  origin: process.env.FRONTEND_ORIGIN ?? true,
});

// Increment 1: prove the pipeline (code -> git -> host -> live URL) works at
// all, before any real feature exists. This must return 200 even if no
// database is connected yet.
app.get("/health", async () => {
  return { status: "ok", service: "perfect-solutions-api", time: new Date().toISOString() };
});

// Once a real Postgres is connected (DATABASE_URL set on the host), this
// confirms the API can actually reach it.
app.get("/db-check", async () => {
  const result = await dbPing();
  return result;
});

// Increment 3: who am I? Confirms a logged-in session resolves to a real
// builder (or staff) identity in our database, not just a valid Clerk login.
app.get("/me", { preHandler: requireAuth }, async (request) => {
  return { identity: request.identity };
});

// Increment 4, first slice: a logged-in builder sees only their own
// customers. Row-level security (db/migrations/0001_init.sql) enforces this
// at the database level even if this handler had a bug — but the handler
// still never accepts a builder_id from the client, only from the verified
// session, as a second layer.
app.get("/customers", { preHandler: [requireAuth, requireCapability("customers.read")] }, async (request) => {
  if (!pool) return { customers: [], note: "No database connected." };
  return withTenantClient(request.context!, async (client) => {
    // Note: the customers table's column is contact_number, not phone (see
    // db/migrations/0001_init.sql) — aliased below so the API's response
    // shape (and the frontend's Customer type) can stay as `phone` without
    // the frontend needing to know the underlying column name. Caught by
    // actually running this query against the real seeded schema locally —
    // it had been referencing a column that never existed, unnoticed
    // because the frontend didn't check /customers' response status (fixed
    // in apps/web/src/App.tsx) and silently rendered "No customers yet."
    // for what was actually a 500 error every time.
    // limit 1000 is a stopgap, not real pagination — fine while the
    // biggest builder has ~300 customers, but this needs proper
    // page/cursor params before that stops being true. Was capped at 200,
    // which silently hid 88 of Shilpkaar's 288 real customers once seed
    // data was loaded — caught by comparing the on-screen count to the row
    // count confirmed in Neon.
    const result = await client.query(
      "select id, full_name, contact_number as phone, email, stage, created_at from customers order by created_at desc limit 1000"
    );
    return { customers: result.rows };
  });
});

// Reference data for the customer edit form's funding-bank dropdown. banks
// has no RLS (db/migrations/0001_init.sql: "shared reference data") — every
// builder picks from the same bank list, so this reads straight off the
// pool, the same exemption /dashboard/overview's loan-by-bank query relies
// on via its join.
app.get("/banks", { preHandler: [requireAuth, requireCapability("customers.read")] }, async () => {
  if (!pool) return { banks: [] };
  const result = await pool.query("select id, name from banks order by name");
  return { banks: result.rows };
});

// The "New customer" builder picker (apps/web/src/NewCustomerModal.tsx).
// Staff-only: a builder_user is already implicitly scoped to their own one
// builder (POST /customers below always uses identity.builderId for them,
// never anything the client sends) and has no legitimate reason to see
// every other builder's name — this would be a real cross-tenant leak for
// them, unlike /banks above, which is genuinely shared reference data.
app.get("/builders", { preHandler: [requireAuth, requireCapability("users.manage")] }, async (request, reply) => {
  if (!pool) return { builders: [] };
  if (request.identity!.kind !== "staff") {
    return reply.code(403).send({ error: "Only staff can list builders." });
  }
  const result = await pool.query("select id, name from builders order by name");
  return { builders: result.rows };
});

// The customer detail screen (apps/web/src/CustomerDetailScreen.tsx) — the
// full record CustomersScreen's list view only shows a handful of columns
// from, plus co-applicants, the payment ledger, and this customer's
// milestone schedule. Every numeric/date column is parsed here, once, same
// reasoning as /dashboard/overview's num()/pctOrNull() — pg returns
// `numeric` as a string and `date` as a JS Date, and the frontend should
// never have to remember that per field.
app.get("/customers/:id", { preHandler: [requireAuth, requireCapability("customers.read")] }, async (request, reply) => {
  if (!pool) return reply.code(503).send({ error: "No database connected." });
  const { id } = request.params as { id: string };

  return withTenantClient(request.context!, async (client) => {
    const custResult = await client.query(
      `select c.*, b.name as bank_name
       from customers c
       left join banks b on b.id = c.bank_id
       where c.id = $1`,
      [id]
    );
    // Zero rows here means either the id doesn't exist, or it belongs to a
    // different builder and RLS correctly hid it — the response is the
    // same 404 either way, deliberately: confirming *which* is true would
    // leak whether a given id exists on another tenant's data.
    if (custResult.rowCount === 0) return reply.code(404).send({ error: "Customer not found." });
    const row = custResult.rows[0];

    const [coApplicantsResult, paymentsResult, milestonesResult] = await Promise.all([
      client.query(
        `select id, full_name, relation, pan_number, aadhar_number, contact_number, email, profession, annual_income, address
         from co_applicants where customer_id = $1 order by created_at`,
        [id]
      ),
      client.query(
        `select id, received_on, flat_cost_received, gst_received, remark, source
         from recovery_transactions where customer_id = $1 order by received_on desc, created_at desc`,
        [id]
      ),
      client.query(
        `select cm.id, pm.milestone_name, cm.amount_due, cm.due_date, cm.status
         from customer_milestones cm
         join payment_milestones pm on pm.id = cm.payment_milestone_id
         where cm.customer_id = $1
         order by pm.sort_order`,
        [id]
      ),
    ]);

    const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
    const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const dateOrNull = (v: unknown) => (v === null || v === undefined ? null : (v as Date).toISOString().slice(0, 10));

    // Same "amount due" definition as the Overview KPI tiles: milestones
    // that have actually come due (due/partial/paid), not the eventual
    // agreement value.
    const totalReceived = paymentsResult.rows.reduce(
      (sum, p) => sum + num(p.flat_cost_received) + num(p.gst_received),
      0
    );
    const amountDue = milestonesResult.rows
      .filter((m) => ["due", "partial", "paid"].includes(m.status))
      .reduce((sum, m) => sum + num(m.amount_due), 0);

    return {
      customer: {
        id: row.id,
        psClientNo: row.ps_client_no,
        agreementNo: row.agreement_no,
        fullName: row.full_name,
        contactNumber: row.contact_number,
        email: row.email,
        panNumber: row.pan_number,
        aadharNumber: row.aadhar_number,
        profession: row.profession,
        address: row.address,
        bookingDate: dateOrNull(row.booking_date),
        agreementDate: dateOrNull(row.agreement_date),
        possessionDate: dateOrNull(row.possession_date),
        ratePerSqft: numOrNull(row.rate_per_sqft),
        basicValue: numOrNull(row.basic_value),
        parkingAmt: numOrNull(row.parking_amt),
        infraLegalSocCharges: numOrNull(row.infra_legal_soc_charges),
        agreementValue: numOrNull(row.agreement_value),
        gstPct: numOrNull(row.gst_pct),
        stampDutyPct: numOrNull(row.stamp_duty_pct),
        stampDutyAmount: numOrNull(row.stamp_duty_amount),
        registrationCharges: numOrNull(row.registration_charges),
        tdsPct: numOrNull(row.tds_pct),
        otherCharges: numOrNull(row.other_charges),
        totalCostOfFlat: numOrNull(row.total_cost_of_flat),
        fundingSource: row.funding_source,
        loanExpected: numOrNull(row.loan_expected),
        bankId: row.bank_id,
        bankName: row.bank_name,
        bankersContactNumber: row.bankers_contact_number,
        loanFileNo: row.loan_file_no,
        loanAmount: numOrNull(row.loan_amount),
        ownContributionRequired: numOrNull(row.own_contribution_required),
        ownContributionReceived: numOrNull(row.own_contribution_received),
        stage: row.stage,
        dlStatus: row.dl_status,
        dlDate: dateOrNull(row.dl_date),
        remark: row.remark,
        createdAt: row.created_at,
      },
      coApplicants: coApplicantsResult.rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        relation: r.relation,
        panNumber: r.pan_number,
        aadharNumber: r.aadhar_number,
        contactNumber: r.contact_number,
        email: r.email,
        profession: r.profession,
        annualIncome: numOrNull(r.annual_income),
        address: r.address,
      })),
      payments: paymentsResult.rows.map((r) => ({
        id: r.id,
        receivedOn: dateOrNull(r.received_on),
        flatCostReceived: num(r.flat_cost_received),
        gstReceived: num(r.gst_received),
        remark: r.remark,
        source: r.source,
      })),
      milestones: milestonesResult.rows.map((r) => ({
        id: r.id,
        milestoneName: r.milestone_name,
        amountDue: num(r.amount_due),
        dueDate: dateOrNull(r.due_date),
        status: r.status,
      })),
      totals: { totalReceived, amountDue, balance: amountDue - totalReceived },
    };
  });
});

// Every column a customer's edit form is allowed to change. Built from a
// fixed array, not the request body's own keys, so a client can never make
// this UPDATE touch a column that isn't on this list — id, builder_id,
// inventory_unit_id, assigned_staff_id, ps_client_no (unique workspace-wide,
// not something to edit casually), and created_at are deliberately absent.
const EDITABLE_CUSTOMER_FIELDS = [
  "agreement_no", "full_name", "contact_number", "email", "pan_number", "aadhar_number", "profession", "address",
  "booking_date", "agreement_date", "possession_date",
  "rate_per_sqft", "basic_value", "parking_amt", "infra_legal_soc_charges", "agreement_value",
  "gst_pct", "stamp_duty_pct", "stamp_duty_amount", "registration_charges", "tds_pct", "other_charges", "total_cost_of_flat",
  "funding_source", "loan_expected", "bank_id", "bankers_contact_number", "loan_file_no", "loan_amount",
  "own_contribution_required", "own_contribution_received",
  "stage", "dl_status", "dl_date", "remark",
];

app.patch("/customers/:id", { preHandler: [requireAuth, requireCapability("customers.edit")] }, async (request, reply) => {
  if (!pool) return reply.code(503).send({ error: "No database connected." });
  const { id } = request.params as { id: string };
  const body = (request.body ?? {}) as Record<string, unknown>;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_CUSTOMER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    let value = body[field];
    // full_name is not null in the schema — reject an empty name here
    // rather than let the database reject it as an opaque constraint
    // error the frontend would have to reverse-engineer.
    if (field === "full_name" && (typeof value !== "string" || value.trim() === "")) {
      return reply.code(400).send({ error: "Name cannot be empty." });
    }
    // A cleared text input arrives as "" — every other column here is
    // nullable, and "" is never the intended value for a date/number/text
    // field on this form, so treat it as "clear this field."
    if (value === "") value = null;
    values.push(value);
    setClauses.push(`${field} = $${values.length}`);
  }
  if (setClauses.length === 0) return reply.code(400).send({ error: "No editable fields in request body." });

  values.push(id);
  return withTenantClient(request.context!, async (client) => {
    const result = await client.query(
      `update customers set ${setClauses.join(", ")} where id = $${values.length} returning id`,
      values
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Customer not found." });
    return { ok: true };
  });
});

// The "New customer" form (apps/web/src/NewCustomerModal.tsx) — a
// deliberately small subset of what a customer record can eventually hold.
// Uses the exact same EDITABLE_CUSTOMER_FIELDS allowlist PATCH above does,
// so a new customer can never be created with a field this app doesn't
// already know how to display and edit.
app.post("/customers", { preHandler: [requireAuth, requireCapability("customers.create")] }, async (request, reply) => {
  if (!pool) return reply.code(503).send({ error: "No database connected." });
  const body = (request.body ?? {}) as Record<string, unknown>;

  if (typeof body.full_name !== "string" || body.full_name.trim() === "") {
    return reply.code(400).send({ error: "Name is required." });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_CUSTOMER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    let value = body[field];
    if (value === "") value = null;
    fields.push(field);
    values.push(value);
  }

  return withTenantClient(request.context!, async (client) => {
    // A builder_user is always scoped to their own builder — identity.
    // builderId, never anything the client sends, same reasoning as
    // POST /customers/:id/payments below. Staff aren't scoped to any one
    // builder at all, so they have to say which one explicitly (see
    // GET /builders and NewCustomerModal.tsx's builder picker, shown only
    // to staff); RLS's WITH CHECK still applies to this insert either way
    // — a staff-created row is allowed for any builder_id (is_staff short-
    // circuits the policy), a builder-created row only for their own.
    let builderId: string;
    if (request.identity!.kind === "builder") {
      builderId = request.identity!.builderId;
    } else {
      if (typeof body.builder_id !== "string" || body.builder_id === "") {
        return reply.code(400).send({ error: "builder_id is required for staff." });
      }
      builderId = body.builder_id;
    }

    const columns = ["builder_id", ...fields];
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const result = await client.query(
      `insert into customers (${columns.join(", ")}) values (${placeholders.join(", ")}) returning id`,
      [builderId, ...values]
    );
    return reply.code(201).send({ ok: true, id: result.rows[0].id });
  });
});

// Recording a payment is the one write this app makes that Launch
// Guardrails' "financial records are never deleted, only reversed" standard
// actually governs — so this route only ever inserts, on purpose. There is
// no PATCH/DELETE for a recovery_transactions row; correcting one means a
// separate offsetting entry, not editing history, and that reversal flow
// isn't built yet (recorded as an open gap, not implemented as a shortcut).
app.post("/customers/:id/payments", { preHandler: [requireAuth, requireCapability("payments.record")] }, async (request, reply) => {
  if (!pool) return reply.code(503).send({ error: "No database connected." });
  const { id } = request.params as { id: string };
  // Snake_case body keys, matching PATCH /customers/:id above rather than
  // the camelCase this route's own GET response uses — one convention for
  // "what a write body looks like" (the DB column names, directly) across
  // both write endpoints on this resource, kept distinct from "what a read
  // response looks like" (camelCase, matching the rest of this app).
  const body = (request.body ?? {}) as {
    received_on?: string; flat_cost_received?: number; gst_received?: number; remark?: string; source?: string;
  };

  if (!body.received_on) return reply.code(400).send({ error: "Date received is required." });
  const flatCost = Number(body.flat_cost_received ?? 0);
  const gst = Number(body.gst_received ?? 0);
  if (!(flatCost > 0) && !(gst > 0)) {
    return reply.code(400).send({ error: "Enter an amount received (flat cost and/or GST) greater than zero." });
  }

  return withTenantClient(request.context!, async (client) => {
    // builder_id comes from the customer row this INSERT...SELECT actually
    // finds, never from the client — and that SELECT is itself RLS-scoped,
    // so a customer id from another builder simply matches zero rows here
    // rather than needing a separate ownership check first.
    const result = await client.query(
      `insert into recovery_transactions (builder_id, customer_id, received_on, flat_cost_received, gst_received, remark, source)
       select c.builder_id, c.id, $2::date, $3::numeric, $4::numeric, $5, $6
       from customers c
       where c.id = $1
       returning id`,
      [id, body.received_on, flatCost, gst, body.remark ?? null, body.source ?? null]
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: "Customer not found." });
    return { ok: true, id: result.rows[0].id };
  });
});

// Overview screen's six KPI tiles (apps/web/src/OverviewScreen.tsx) — the
// same figures the old single-file MIS tool's Portfolio Overview showed
// (archive/html-tool, src/charts.js renderKpis), computed here against the
// live schema instead of a loaded workbook. Every percentage is computed in
// this query, not on the frontend: the hard rule at the top of this file is
// that the API is the only place a figure gets derived from another.
//
// "Amount due" is the sum of customer_milestones.amount_due for milestones
// that have actually come due (status due/partial/paid) — not the full
// agreement value, and not every milestone regardless of date. That's what
// "balance outstanding" and "collection efficiency" are measured against:
// what should have been paid by now, not the eventual total.
//
// A staff login has app.is_staff='true', which the RLS policy on every
// table here treats as "no builder_id filter at all" — so a staff user's
// Overview is a combined figure across every builder. That matches "sees
// everything across every builder" in CLAUDE.md; a per-builder filter for
// staff is a later addition, not this one.
app.get("/dashboard/overview", { preHandler: [requireAuth, requireCapability("reports.read")] }, async (request) => {
  if (!pool) return { kpis: null, pipeline: null, note: "No database connected." };
  return withTenantClient(request.context!, async (client) => {
    const result = await client.query(`
      with due_milestones as (
        select coalesce(sum(amount_due), 0)::numeric as amount_due
        from customer_milestones
        where status in ('due', 'partial', 'paid')
      ),
      received as (
        select coalesce(sum(flat_cost_received + gst_received), 0)::numeric as total_received
        from recovery_transactions
      ),
      cust as (
        select
          coalesce(sum(agreement_value), 0)::numeric as total_agreement_value,
          count(*) as units_tracked,
          coalesce(sum(loan_amount), 0)::numeric as loan_amount_sanctioned,
          count(*) filter (where loan_amount is not null and loan_amount > 0) as loan_cases
        from customers
      )
      select
        cust.total_agreement_value,
        cust.units_tracked,
        received.total_received,
        case when cust.total_agreement_value > 0
             then round(received.total_received / cust.total_agreement_value * 100, 1)
             else null end as received_pct_of_agreement,
        due_milestones.amount_due,
        (due_milestones.amount_due - received.total_received) as balance_outstanding,
        case when due_milestones.amount_due > 0
             then round((due_milestones.amount_due - received.total_received) / due_milestones.amount_due * 100, 1)
             else null end as balance_pct_of_due,
        cust.loan_amount_sanctioned,
        cust.loan_cases,
        case when due_milestones.amount_due > 0
             then round(received.total_received / due_milestones.amount_due * 100, 1)
             else null end as collection_efficiency_pct
      from cust, received, due_milestones
    `);

    // Disbursement status split (the donut). dl_status is free text a
    // builder's ops team enters, so its distinct values aren't a fixed enum
    // we control — capped at the top 4 by count, the rest folded into
    // "Other", computed here rather than trusting the client to cap a list
    // that could otherwise run long. See apps/web/src/DonutChart.tsx for why
    // 4 specifically: a donut's segments are all mutual neighbors (the
    // first also touches the last), which rules out the categorical
    // palette's documented default 4th slot (yellow) — it fails the
    // dataviz skill's validator hard against orange under that condition.
    // Violet is slot 4 here instead, confirmed by actually running the
    // validator (not assumed): blue/orange/aqua/violet passes every check
    // against this app's real white surface, all-pairs, both CVD and
    // normal-vision floors — see OverviewScreen.tsx's CATEGORICAL constant
    // and DonutChart.tsx's own comment for the full comparison against the
    // other candidate hues that were tried and failed.
    const splitResult = await client.query(`
      with status_counts as (
        select coalesce(nullif(trim(dl_status), ''), 'Not set') as status, count(*)::int as cnt
        from customers
        group by 1
      ),
      ranked as (
        select status, cnt, row_number() over (order by cnt desc, status) as rn
        from status_counts
      ),
      bucketed as (
        select (case when rn <= 4 then status else 'Other' end) as status, cnt
        from ranked
      ),
      grouped as (
        select status, sum(cnt)::int as count
        from bucketed
        group by status
      )
      select status, count,
        round(count::numeric / nullif(sum(count) over (), 0) * 100, 1) as pct
      from grouped
      order by (status = 'Other'), count desc
    `);

    // Loan amount by bank (the bar chart). Capped at the top 8 banks by
    // sanctioned amount, same reasoning as above — a real builder can have
    // more financing banks than fit legibly in one chart (Shilpkaar alone
    // has 12).
    const bankResult = await client.query(`
      with bank_totals as (
        select b.name as bank, sum(c.loan_amount)::numeric as amount
        from customers c
        join banks b on b.id = c.bank_id
        where c.loan_amount is not null and c.loan_amount > 0
        group by b.name
      ),
      ranked as (
        select bank, amount, row_number() over (order by amount desc) as rn
        from bank_totals
      ),
      bucketed as (
        select (case when rn <= 8 then bank else 'Other' end) as bank, amount
        from ranked
      )
      select bank, sum(amount)::numeric as amount
      from bucketed
      group by bank
      order by (bank = 'Other'), amount desc
    `);

    // Outstanding balance by customer (the second bar chart). Same "amount
    // due" definition as the KPI tiles above — due/partial/paid milestones
    // only — minus what's actually been received, per customer, filtered
    // to > 0: a customer who is paid up or ahead isn't "outstanding."
    //
    // No top-N cap here, unlike the donut/bank-bar above — the real old
    // tool (archive/html-tool, src/charts.js renderBalanceChart) shows
    // every outstanding customer in a scrolling list with a searchable
    // picker to jump to one, not a top-10 chart, and apps/web/src/
    // OverviewScreen.tsx reproduces that. limit 500 is the same kind of
    // stopgap as /customers' limit 1000 — a safety ceiling, not real
    // pagination, fine at current builder sizes.
    const outstandingResult = await client.query(`
      with due_per_customer as (
        select customer_id, coalesce(sum(amount_due), 0)::numeric as amount_due
        from customer_milestones
        where status in ('due', 'partial', 'paid')
        group by customer_id
      ),
      received_per_customer as (
        select customer_id, coalesce(sum(flat_cost_received + gst_received), 0)::numeric as received
        from recovery_transactions
        group by customer_id
      )
      select c.full_name,
             (coalesce(d.amount_due, 0) - coalesce(r.received, 0)) as balance
      from customers c
      left join due_per_customer d on d.customer_id = c.id
      left join received_per_customer r on r.customer_id = c.id
      where (coalesce(d.amount_due, 0) - coalesce(r.received, 0)) > 0
      order by balance desc
      limit 500
    `);

    // Daily collection, bucketed by week (the line chart). Built from a
    // generated calendar of the last 12 week-starts left-joined against
    // actual receipts, not just "group by week" on its own — a week with
    // zero collections would otherwise be missing from the result entirely
    // rather than showing as zero, which would silently misrepresent the
    // x-axis as evenly spaced when it wasn't.
    const dailyResult = await client.query(`
      with weeks as (
        select generate_series(
          date_trunc('week', current_date - interval '77 days')::date,
          date_trunc('week', current_date)::date,
          interval '7 days'
        )::date as week_start
      ),
      collected as (
        select date_trunc('week', received_on)::date as week_start,
               sum(flat_cost_received + gst_received)::numeric as amount
        from recovery_transactions
        group by 1
      )
      select w.week_start, coalesce(c.amount, 0) as amount
      from weeks w
      left join collected c on c.week_start = w.week_start
      order by w.week_start
    `);

    // pg returns `numeric` columns as strings, not JS numbers, so every
    // figure is parsed here — once, in the one place responsible for it —
    // rather than leaving each caller to remember to do it.
    const row = result.rows[0];
    const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
    const pctOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

    return {
      kpis: {
        totalAgreementValue: num(row.total_agreement_value),
        unitsTracked: num(row.units_tracked),
        totalReceived: num(row.total_received),
        receivedPctOfAgreement: pctOrNull(row.received_pct_of_agreement),
        amountDue: num(row.amount_due),
        balanceOutstanding: num(row.balance_outstanding),
        balancePctOfDue: pctOrNull(row.balance_pct_of_due),
        loanAmountSanctioned: num(row.loan_amount_sanctioned),
        loanCases: num(row.loan_cases),
        collectionEfficiencyPct: pctOrNull(row.collection_efficiency_pct),
      },
      pipeline: {
        disbursementSplit: splitResult.rows.map((r) => ({
          status: String(r.status),
          count: num(r.count),
          pct: num(r.pct),
        })),
        loanByBank: bankResult.rows.map((r) => ({
          bank: String(r.bank),
          amount: num(r.amount),
        })),
        outstandingByCustomer: outstandingResult.rows.map((r) => ({
          customer: String(r.full_name),
          balance: num(r.balance),
        })),
        dailyCollection: dailyResult.rows.map((r) => ({
          // date columns come back as JS Date objects from pg, already in
          // local time with no time component that matters here — format
          // as YYYY-MM-DD so the frontend gets a plain, unambiguous string.
          weekStart: (r.week_start as Date).toISOString().slice(0, 10),
          amount: num(r.amount),
        })),
      },
    };
  });
});

// Daily collection's range picker (apps/web/src/OverviewScreen.tsx). The
// main /dashboard/overview above always returns a fixed 12-week window —
// fast, one round trip, right for the initial page load. This is the
// separate call OverviewScreen makes only when the range selector actually
// changes, so switching ranges doesn't re-run the KPI/donut/bank-bar
// queries just to redraw one chart.
//
// Deliberately NOT porting archive/html-tool's day -> week -> month
// auto-widening bucket grain, or its "anchor to the latest receipt instead
// of today" fix. Both existed there because the old tool read a workbook
// that could be uploaded once and left stale for months; this app queries
// the live database on every request, so "today" is already the correct
// anchor, and a line chart (unlike that tool's per-day bars, which needed
// real pixel width per bar to stay legible/clickable) tolerates more points
// at a fixed width via sparser axis labels instead of needing a wider grain.
const ALLOWED_DAILY_WEEKS = [4, 12, 26, 52];

app.get("/dashboard/daily-collection", { preHandler: [requireAuth, requireCapability("reports.read")] }, async (request) => {
  if (!pool) return { dailyCollection: [] };
  const query = request.query as { weeks?: string };
  const weeks = ALLOWED_DAILY_WEEKS.includes(Number(query.weeks)) ? Number(query.weeks) : 12;
  // Never interpolates `weeks` into the SQL string — only ever one of the
  // four whitelisted values above reaches here, then goes in as a bound
  // parameter regardless.
  const daysBack = (weeks - 1) * 7;

  return withTenantClient(request.context!, async (client) => {
    const dailyResult = await client.query(
      `
      with weeks as (
        select generate_series(
          date_trunc('week', current_date - $1::int * interval '1 day')::date,
          date_trunc('week', current_date)::date,
          interval '7 days'
        )::date as week_start
      ),
      collected as (
        select date_trunc('week', received_on)::date as week_start,
               sum(flat_cost_received + gst_received)::numeric as amount
        from recovery_transactions
        group by 1
      )
      select w.week_start, coalesce(c.amount, 0) as amount
      from weeks w
      left join collected c on c.week_start = w.week_start
      order by w.week_start
      `,
      [daysBack]
    );

    const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
    return {
      dailyCollection: dailyResult.rows.map((r) => ({
        weekStart: (r.week_start as Date).toISOString().slice(0, 10),
        amount: num(r.amount),
      })),
    };
  });
});

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
