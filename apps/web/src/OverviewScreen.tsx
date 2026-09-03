import type { DashboardKpis } from "./types";
import { formatCompactInr, formatPct } from "./format";
import PageHeader from "./PageHeader";

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
// loaded workbook. The chart cards from that tool (disbursement split, loan
// by bank, outstanding by customer, daily collection) aren't built yet;
// this screen proves the real figures render correctly before charts are
// added on top of them.
export default function OverviewScreen({ kpis }: { kpis: DashboardKpis }) {
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
          background: "white",
          border: "1px dashed #e2e8f0",
          borderRadius: 12,
          padding: "3rem 1rem",
          textAlign: "center",
          color: "#94a3b8",
          fontSize: "0.85rem",
        }}
      >
        Disbursement split, loan by bank, outstanding by customer and daily collection charts are next.
      </div>
    </div>
  );
}
