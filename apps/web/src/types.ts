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

// The "Collection & loan pipeline" chart cards. Every array is already
// capped/bucketed/date-filled server-side (top N + "Other", or a complete
// week-by-week calendar with zeros for empty weeks) — the frontend renders
// exactly what arrives, it doesn't decide how many categories or which
// dates to show.
export type DisbursementSplitRow = { status: string; count: number; pct: number };
export type LoanByBankRow = { bank: string; amount: number };
export type OutstandingByCustomerRow = { customer: string; balance: number };
export type DailyCollectionRow = { weekStart: string; amount: number };
export type PipelineData = {
  disbursementSplit: DisbursementSplitRow[];
  loanByBank: LoanByBankRow[];
  outstandingByCustomer: OutstandingByCustomerRow[];
  dailyCollection: DailyCollectionRow[];
};

// GET /customers/:id — the full record (db/migrations/0001_init.sql's
// customers table, ~35 columns), not the handful CustomersScreen's list
// view shows. Every numeric/date column is already parsed server-side —
// see apps/api/src/index.ts's num()/dateOrNull() helpers — the frontend
// only ever formats what arrives, same rule as everywhere else in this app.
//
// PII note: pan_number and aadhar_number come through unmasked here,
// same as every other field. docs/LAUNCH_GUARDRAILS.md flags this
// explicitly as an open decision ("decide today which roles see the full
// number... build new screens against that decision") — this is the first
// screen that decision actually applies to, and it hasn't been made yet.
export type CustomerDetail = {
  id: string;
  psClientNo: string | null;
  agreementNo: string | null;
  fullName: string;
  contactNumber: string | null;
  email: string | null;
  panNumber: string | null;
  aadharNumber: string | null;
  profession: string | null;
  address: string | null;
  bookingDate: string | null;
  agreementDate: string | null;
  possessionDate: string | null;
  ratePerSqft: number | null;
  basicValue: number | null;
  parkingAmt: number | null;
  infraLegalSocCharges: number | null;
  agreementValue: number | null;
  gstPct: number | null;
  stampDutyPct: number | null;
  stampDutyAmount: number | null;
  registrationCharges: number | null;
  tdsPct: number | null;
  otherCharges: number | null;
  totalCostOfFlat: number | null;
  fundingSource: string | null;
  loanExpected: number | null;
  bankId: string | null;
  bankName: string | null;
  bankersContactNumber: string | null;
  loanFileNo: string | null;
  loanAmount: number | null;
  ownContributionRequired: number | null;
  ownContributionReceived: number | null;
  stage: string | null;
  dlStatus: string | null;
  dlDate: string | null;
  remark: string | null;
  createdAt: string;
};

export type CoApplicant = {
  id: string;
  fullName: string;
  relation: string | null;
  panNumber: string | null;
  aadharNumber: string | null;
  contactNumber: string | null;
  email: string | null;
  profession: string | null;
  annualIncome: number | null;
  address: string | null;
};

// A recovery_transactions row — the actual payment ledger. Create-only from
// this app: docs/LAUNCH_GUARDRAILS.md's standard is that a financial record
// is never edited or deleted, only reversed with a reason, and reversal
// entries aren't built yet — so a payment recorded here cannot currently be
// corrected except by recording an offsetting entry by hand.
export type Payment = {
  id: string;
  receivedOn: string;
  flatCostReceived: number;
  gstReceived: number;
  remark: string | null;
  source: string | null;
};

export type Milestone = {
  id: string;
  milestoneName: string;
  amountDue: number;
  dueDate: string | null;
  status: string;
};

export type Bank = { id: string; name: string };

// GET /builders — staff-only (see apps/api/src/index.ts): the builder
// picker on NewCustomerModal.tsx for a staff user creating a customer, who
// (unlike a builder_user) isn't implicitly scoped to just one builder.
export type Builder = { id: string; name: string };

export type CustomerDetailResponse = {
  customer: CustomerDetail;
  coApplicants: CoApplicant[];
  payments: Payment[];
  milestones: Milestone[];
  // Computed the same way as the Overview KPI tiles: amountDue is the sum
  // of milestones that have actually come due (status due/partial/paid),
  // not the eventual agreement value — see apps/api/src/index.ts. Recording
  // a payment here updates `payments`/`totalReceived` immediately; it does
  // NOT recompute which milestone that payment applies to or flip its
  // status — that reconciliation is a real feature, not built yet, so
  // `amountDue` can lag a fresh payment until a milestone is updated
  // separately.
  totals: { totalReceived: number; amountDue: number; balance: number };
};
