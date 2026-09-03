// Shared shapes for what the API sends back. The frontend never computes or
// decides anything from these — it only displays exactly what arrives. See
// the note at the top of App.tsx.

export type Identity =
  | { kind: "staff"; staffId: string; fullName: string | null; role: string }
  | { kind: "builder"; builderUserId: string; builderId: string; fullName: string | null; role: string };

export type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  stage: string | null;
  created_at: string;
};

// Matches GET /dashboard/overview's kpis object exactly. Every figure and
// every percentage here is computed server-side (apps/api/src/index.ts) —
// the frontend (OverviewScreen.tsx) only formats and colors these, it never
// derives one of these numbers from another.
export type DashboardKpis = {
  totalAgreementValue: number;
  unitsTracked: number;
  totalReceived: number;
  receivedPctOfAgreement: number | null;
  amountDue: number;
  balanceOutstanding: number;
  balancePctOfDue: number | null;
  loanAmountSanctioned: number;
  loanCases: number;
  collectionEfficiencyPct: number | null;
};

// The "Collection & loan pipeline" chart cards. Both arrays are already
// capped and bucketed server-side (top N + "Other") — the frontend renders
// exactly what arrives, it doesn't decide how many categories to show.
export type DisbursementSplitRow = { status: string; count: number; pct: number };
export type LoanByBankRow = { bank: string; amount: number };
export type PipelineData = {
  disbursementSplit: DisbursementSplitRow[];
  loanByBank: LoanByBankRow[];
};
