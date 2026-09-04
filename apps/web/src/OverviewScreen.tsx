import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "react-aria-components";
import { AriaSelect } from "./AriaControls";
import { AriaDataTable } from "./AriaControls";
import { PS_COLORS } from "./theme";
import type { DashboardKpis, DailyCollectionRow, PipelineData } from "./types";
import { formatCompactInr, formatPct, formatShortDate } from "./format";
import PageHeader from "./PageHeader";
import DonutChart, { type DonutSegment } from "./DonutChart";
import BarChart from "./BarChart";
import LineChart from "./LineChart";

const API_URL = import.meta.env.VITE_API_URL as string;

// Categorical slots 1–3 of the dataviz skill's validated default palette
// (blue, orange, aqua), plus violet in place of the documented 4th slot
// (yellow, which fails the validator's normal-vision floor against orange
// under a donut's all-mutual-neighbors condition — violet passes every
// check instead, confirmed by actually running the validator, not
// assumed), plus a neutral gray for the server-computed "Other" bucket —
// see DonutChart.tsx for the real numbers behind this choice.
const CATEGORICAL = [PS_COLORS.primaryBlue, PS_COLORS.nearBlackNavy, "#4b79b8", PS_COLORS.grey];
const OTHER_COLOR = PS_COLORS.grey;

const controlStyle: CSSProperties = {
  fontSize: "0.78rem",
  padding: "0.35rem 0.6rem",
  borderRadius: 6,
  border: `1px solid ${PS_COLORS.ruleBorder}`,
  background: PS_COLORS.offWhite,
  color: PS_COLORS.nearBlackNavy,
};

// Shared card chrome for every "Collection & loan pipeline" tile. `table`
// makes "View as table" a real toggle instead of the disabled placeholder
// every other chart still uses — passing it opts a card into the feature;
// omitting it keeps the old "soon" button, same treatment as an unbuilt
// nav item. `extra` renders always, above whichever of children/table is
// showing (a picker or range-select that should stay visible in both
// modes, matching archive/html-tool's own layout — its picker sits above
// the chart/table pair, not inside either).
function ChartCard({
  title, subtitle, children, table, extra,
}: {
  title: string; subtitle: string; children: ReactNode;
  table?: { headers: string[]; rows: (string | number)[][] };
  extra?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.9rem" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>{title}</div>
          <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "0.15rem" }}>{subtitle}</div>
        </div>
        {table ? (
          <Button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: showTable ? "white" : "#475569",
              background: showTable ? "#2563eb" : "white",
              border: `1px solid ${showTable ? "#2563eb" : "#e2e8f0"}`,
              borderRadius: 6,
              padding: "0.3rem 0.6rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {showTable ? "View as chart" : "View as table"}
          </Button>
        ) : (
          // Same "soon" treatment as an unbuilt nav item or PageHeader's
          // icons — visibly present, disabled, not a fake action.
          <Button
            type="button"
            isDisabled
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
          </Button>
        )}
      </div>

      {extra && <div style={{ marginBottom: "0.9rem" }}>{extra}</div>}

      {table && showTable ? (
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          <AriaDataTable headers={table.headers} rows={table.rows} />
        </div>
      ) : (
        children
      )}
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
          // Sans, not serif — the brand pairing's "fact-table values" role
          // was tried here first and the user preferred numbers in Plex
          // Sans, so this just inherits the body default (index.css)
          // rather than opting into var(--font-serif).
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

const DAILY_RANGE_OPTIONS = [
  { weeks: 4, label: "Last 4 weeks" },
  { weeks: 12, label: "Last 12 weeks" },
  { weeks: 26, label: "Last 6 months" },
  { weeks: 52, label: "Last year" },
];

// The six tiles here, in this order, are the real numbers behind what the
// old single-file MIS tool's Portfolio Overview showed (archive/html-tool,
// src/charts.js renderKpis) — same shape, now computed by
// GET /dashboard/overview against the live Postgres schema instead of a
// loaded workbook. All four chart cards from that tool are now built below:
// disbursement split and loan by bank first, then outstanding by customer
// and daily collection.
export default function OverviewScreen({ kpis, pipeline }: { kpis: DashboardKpis; pipeline: PipelineData }) {
  const { getToken } = useAuth();

  // Outstanding by customer: archive/html-tool's renderBalanceChart is a
  // searchable picker over every outstanding customer, kept in
  // biggest-first order — not a top-N chart. "" means no filter (show
  // everyone); a specific name filters both the chart and the table to
  // just that one customer's bar/row.
  const [balancePick, setBalancePick] = useState("");

  // Daily collection: a range selector that refetches just this one
  // chart's data (GET /dashboard/daily-collection) rather than re-running
  // the KPI/donut/bank-bar queries every time someone changes the window.
  // null = still on the 12-week window /dashboard/overview already
  // returned for the initial page load; set once the user actually picks
  // a different range.
  const [dailyWeeks, setDailyWeeks] = useState(12);
  const [dailyOverride, setDailyOverride] = useState<DailyCollectionRow[] | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  useEffect(() => {
    if (dailyWeeks === 12) {
      // Back to the window the initial load already has — no need to
      // refetch what's already sitting in `pipeline`.
      setDailyOverride(null);
      return;
    }
    let cancelled = false;
    setDailyLoading(true);
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/dashboard/daily-collection?weeks=${dailyWeeks}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setDailyOverride(body.dailyCollection ?? []);
      } finally {
        if (!cancelled) setDailyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dailyWeeks, getToken]);

  // The API orders disbursementSplit as: up to 4 real statuses by count
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
  const bankTable = {
    headers: ["Bank", "Amount"],
    rows: pipeline.loanByBank.map((row) => [row.bank, formatCompactInr(row.amount)]),
  };

  const outstandingAll = pipeline.outstandingByCustomer;
  const outstandingFiltered = balancePick ? outstandingAll.filter((row) => row.customer === balancePick) : outstandingAll;
  const outstandingBars = outstandingFiltered.map((row) => ({ label: row.customer, value: row.balance }));
  const outstandingTable = {
    headers: ["Customer", "Balance"],
    rows: outstandingFiltered.map((row) => [row.customer, formatCompactInr(row.balance)]),
  };
  const outstandingTotal = outstandingFiltered.reduce((sum, row) => sum + row.balance, 0);

  const dailyRows = dailyOverride ?? pipeline.dailyCollection;
  const dailyPoints = dailyRows.map((row) => ({ label: formatShortDate(row.weekStart), value: row.amount }));
  const dailyTable = {
    headers: ["Week starting", "Amount"],
    rows: dailyRows.map((row) => [formatShortDate(row.weekStart), formatCompactInr(row.amount)]),
  };

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
        <ChartCard title="Loan amount by bank" subtitle="Total sanctioned loan value per financing bank" table={bankTable}>
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
        <ChartCard
          title="Outstanding balance by customer"
          subtitle="Amount due (milestones reached) minus amount received"
          table={outstandingTable}
          extra={
            <div>
              <AriaSelect
                value={balancePick}
                onChange={setBalancePick}
                ariaLabel="Outstanding customer"
                placeholder={`All customers (${outstandingAll.length})`}
                style={{ ...controlStyle, width: "100%" }}
                options={outstandingAll.map((row) => ({ value: row.customer, label: `${row.customer} · ${formatCompactInr(row.balance)}` }))}
              />
              <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "0.5rem" }}>
                {balancePick ? (
                  <>
                    <strong style={{ color: "#0f172a" }}>{balancePick}</strong>: {formatCompactInr(outstandingTotal)} outstanding ·{" "}
                    <Button
                      type="button"
                      onClick={() => setBalancePick("")}
                      style={{ background: "none", border: "none", padding: 0, color: "#2563eb", cursor: "pointer", font: "inherit" }}
                    >
                      show everyone
                    </Button>
                  </>
                ) : (
                  <>
                    {outstandingFiltered.length} customer{outstandingFiltered.length === 1 ? "" : "s"} ·{" "}
                    {formatCompactInr(outstandingTotal)} outstanding, biggest first
                  </>
                )}
              </div>
            </div>
          }
        >
          <BarChart bars={outstandingBars} formatValue={formatCompactInr} maxHeight={340} />
        </ChartCard>

        <ChartCard
          title="Daily collection"
          subtitle="Money received, day by day · grouped by week (week starting)"
          table={dailyTable}
          extra={
            <AriaSelect
              value={String(dailyWeeks)}
              onChange={(value) => setDailyWeeks(Number(value))}
              ariaLabel="Collection range"
              style={controlStyle}
              options={DAILY_RANGE_OPTIONS.map((opt) => ({ value: String(opt.weeks), label: opt.label }))}
            />
          }
        >
          {dailyLoading ? (
            <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", padding: "2.5rem 0" }}>Loading…</div>
          ) : (
            <LineChart points={dailyPoints} formatValue={formatCompactInr} />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
