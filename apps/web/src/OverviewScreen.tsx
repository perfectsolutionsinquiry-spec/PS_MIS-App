import type { ReactNode } from "react";
import type { DashboardKpis, PipelineData } from "./types";
import { formatCompactInr, formatPct, formatShortDate } from "./format";
import PageHeader from "./PageHeader";
import DonutChart, { type DonutSegment } from "./DonutChart";
import BarChart from "./BarChart";
import LineChart from "./LineChart";

// Categorical slots 1–3 of the dataviz skill's validated default palette,
// plus a neutral gray for the server-computed "Other" bucket — see
// DonutChart.tsx for how this was actually validated (not eyeballed)
// against this app's real white card surface.
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a"];
const OTHER_COLOR = "#94a3b8";

function ChartCard({
  title, subtitle, children,
}: {
  title: string; subtitle: string; children: ReactNode;
}) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1.1rem" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>{title}</div>
          <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "0.15rem" }}>{subtitle}</div>
        </div>
        {/* Same "soon" treatment as an unbuilt nav item or PageHeader's
            icons — visibly present, disabled, not a fake action. */}
        <button
          type="button"
          disabled
          title="View as table — coming soon"
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "#94a3b8",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: "0.3rem 0.6rem",
            cursor: "default",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          View as table
        </button>
      </div>
      {children}
    </div>
  );
}

function KpiTile({
  label, value, sub, good,
}: {
  label: string; value: string; sub?: string; good?: boolean;
}) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.1rem 1.25rem" }}>
      <div style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 500 }}>{label}</div>
      <div
        style={{
          fontSize: "1.6rem",
          fontWeight: 700,
          color: good ? "#15803d" : "#0f172a",
          margin: "0.35rem 0 0.15rem",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ color: good ? "#15803d" : "#94a3b8", fontSize: "0.75rem" }}>{sub}</div>}
    </div>
  );
}

// The six tiles here, in this order, are the real numbers behind what the
// old single-file MIS tool's Portfolio Overview showed (archive/html-tool,
// src/charts.js renderKpis) — same shape, now computed by
// GET /dashboard/overview against the live Postgres schema instead of a
// loaded workbook. All four chart cards from that tool are now built below:
// disbursement split and loan by bank first, then outstanding by customer
// and daily collection.
export default function OverviewScreen({ kpis, pipeline }: { kpis: DashboardKpis; pipeline: PipelineData }) {
  // The API orders disbursementSplit as: up to 3 real statuses by count
  // desc, then "Other" last if present (see apps/api/src/index.ts). Slot
  // assignment follows that same order — only non-"Other" rows consume a
  // categorical color, so "Other" always gets the gray regardless of where
  // it lands.
  let nextSlot = 0;
  const donutSegments: DonutSegment[] = pipeline.disbursementSplit.map((row) => ({
    label: row.status,
    count: row.count,
    pct: row.pct,
    color: row.status === "Other" ? OTHER_COLOR : (CATEGORICAL[nextSlot++] ?? OTHER_COLOR),
  }));

  const bankBars = pipeline.loanByBank.map((row) => ({ label: row.bank, value: row.amount }));
  const outstandingBars = pipeline.outstandingByCustomer.map((row) => ({ label: row.customer, value: row.balance }));
  const dailyPoints = pipeline.dailyCollection.map((row) => ({ label: formatShortDate(row.weekStart), value: row.amount }));

  return (
    <div>
      <PageHeader title="Portfolio overview" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "1rem",
          marginBottom: "2.25rem",
        }}
      >
        <KpiTile
          label="Total agreement value"
          value={formatCompactInr(kpis.totalAgreementValue)}
          sub={`${kpis.unitsTracked} unit${kpis.unitsTracked === 1 ? "" : "s"}`}
        />
        <KpiTile
          label="Total received"
          value={formatCompactInr(kpis.totalReceived)}
          sub={`${formatPct(kpis.receivedPctOfAgreement)} of agreement value`}
        />
        <KpiTile
          label="Balance outstanding"
          value={formatCompactInr(kpis.balanceOutstanding)}
          sub={`${formatPct(kpis.balancePctOfDue)} of amount due`}
        />
        <KpiTile
          label="Loan amount sanctioned"
          value={formatCompactInr(kpis.loanAmountSanctioned)}
          sub={`across ${kpis.loanCases} loan case${kpis.loanCases === 1 ? "" : "s"}`}
        />
        <KpiTile
          label="Collection efficiency"
          value={formatPct(kpis.collectionEfficiencyPct)}
          sub="received vs. amount due"
          good
        />
        <KpiTile label="Units tracked" value={String(kpis.unitsTracked)} sub="in the current view" />
      </div>

      <h2
        style={{
          fontSize: "0.78rem",
          fontWeight: 700,
          color: "#64748b",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          margin: "0 0 0.9rem",
        }}
      >
        Collection &amp; loan pipeline
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <ChartCard title="Disbursement status split" subtitle="Customers by loan disbursement status">
          <DonutChart segments={donutSegments} centerValue={String(kpis.unitsTracked)} centerLabel="customers" />
        </ChartCard>
        <ChartCard title="Loan amount by bank" subtitle="Total sanctioned loan value per financing bank">
          <BarChart bars={bankBars} formatValue={formatCompactInr} />
        </ChartCard>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
        }}
      >
        <ChartCard title="Outstanding balance by customer" subtitle="Top 10 customers by balance currently outstanding">
          <BarChart bars={outstandingBars} formatValue={formatCompactInr} />
        </ChartCard>
        <ChartCard title="Daily collection" subtitle="Money received, grouped by week (last 12 weeks)">
          <LineChart points={dailyPoints} formatValue={formatCompactInr} />
        </ChartCard>
      </div>
    </div>
  );
}
