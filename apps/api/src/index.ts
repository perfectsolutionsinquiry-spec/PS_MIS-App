import Fastify from "fastify";
import cors from "@fastify/cors";
import { dbPing, pool } from "./db.js";
import { requireAuth, withTenantClient } from "./auth.js";

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
app.get("/customers", { preHandler: requireAuth }, async (request) => {
  if (!pool) return { customers: [], note: "No database connected." };
  return withTenantClient(request.identity!, async (client) => {
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
app.get("/dashboard/overview", { preHandler: requireAuth }, async (request) => {
  if (!pool) return { kpis: null, pipeline: null, note: "No database connected." };
  return withTenantClient(request.identity!, async (client) => {
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
    // we control — capped at the top 3 by count, the rest folded into
    // "Other", computed here rather than trusting the client to cap a list
    // that could otherwise run long. See apps/web/src/DonutChart.tsx for why
    // 3: a donut's segments are all mutual neighbors (the first also
    // touches the last), and 3 is the validated categorical palette's
    // documented safe count for that "all-pairs" case — see
    // references/palette.md in the dataviz skill.
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
        select (case when rn <= 3 then status else 'Other' end) as status, cnt
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
    // only — minus what's actually been received, per customer. Capped at
    // the top 10 by balance and filtered to > 0: a customer who is paid up
    // or ahead isn't "outstanding," and 288 bars would not be a chart.
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
      limit 10
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

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
