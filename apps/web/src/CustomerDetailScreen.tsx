import { useEffect, useState } from "react";
import { Button } from "react-aria-components";
import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import type { Bank, CustomerDetailResponse, Milestone, Payment } from "./types";
import { formatCompactInr } from "./format";

const API_URL = import.meta.env.VITE_API_URL as string;

type FieldType = "text" | "textarea" | "number" | "date" | "select";

// Every field this screen shows, in the order it's grouped and rendered.
// `key` is the GET response's camelCase field (apps/api/src/index.ts);
// `dbKey` is the exact column name PATCH /customers/:id expects — the API
// deliberately uses snake_case for writes (matching its EDITABLE_CUSTOMER_
// FIELDS allowlist 1:1) and camelCase for reads, so this table is where
// that mapping actually lives, once, rather than re-derived per field.
// `readOnly` fields (ps_client_no) render but never appear in the edit
// form's PATCH body at all.
type FieldDef = {
  key: keyof CustomerDetailResponse["customer"];
  dbKey?: string;
  label: string;
  type: FieldType;
  readOnly?: boolean;
};

const IDENTITY_FIELDS: FieldDef[] = [
  { key: "psClientNo", label: "PS client no.", type: "text", readOnly: true },
  { key: "agreementNo", dbKey: "agreement_no", label: "Agreement no.", type: "text" },
  { key: "fullName", dbKey: "full_name", label: "Full name", type: "text" },
  { key: "contactNumber", dbKey: "contact_number", label: "Phone", type: "text" },
  { key: "email", dbKey: "email", label: "Email", type: "text" },
  { key: "panNumber", dbKey: "pan_number", label: "PAN", type: "text" },
  { key: "aadharNumber", dbKey: "aadhar_number", label: "Aadhaar", type: "text" },
  { key: "profession", dbKey: "profession", label: "Profession", type: "text" },
  { key: "address", dbKey: "address", label: "Address", type: "textarea" },
];

const DATE_FIELDS: FieldDef[] = [
  { key: "bookingDate", dbKey: "booking_date", label: "Booking date", type: "date" },
  { key: "agreementDate", dbKey: "agreement_date", label: "Agreement date", type: "date" },
  { key: "possessionDate", dbKey: "possession_date", label: "Possession date", type: "date" },
];

const COST_FIELDS: FieldDef[] = [
  { key: "ratePerSqft", dbKey: "rate_per_sqft", label: "Rate per sqft", type: "number" },
  { key: "basicValue", dbKey: "basic_value", label: "Basic value", type: "number" },
  { key: "parkingAmt", dbKey: "parking_amt", label: "Parking amount", type: "number" },
  { key: "infraLegalSocCharges", dbKey: "infra_legal_soc_charges", label: "Infra / legal / society charges", type: "number" },
  { key: "agreementValue", dbKey: "agreement_value", label: "Agreement value", type: "number" },
  { key: "gstPct", dbKey: "gst_pct", label: "GST %", type: "number" },
  { key: "stampDutyPct", dbKey: "stamp_duty_pct", label: "Stamp duty %", type: "number" },
  { key: "stampDutyAmount", dbKey: "stamp_duty_amount", label: "Stamp duty amount", type: "number" },
  { key: "registrationCharges", dbKey: "registration_charges", label: "Registration charges", type: "number" },
  { key: "tdsPct", dbKey: "tds_pct", label: "TDS %", type: "number" },
  { key: "otherCharges", dbKey: "other_charges", label: "Other charges", type: "number" },
  { key: "totalCostOfFlat", dbKey: "total_cost_of_flat", label: "Total cost of flat", type: "number" },
];

const FUNDING_FIELDS: FieldDef[] = [
  { key: "fundingSource", dbKey: "funding_source", label: "Funding source", type: "select" },
  { key: "loanExpected", dbKey: "loan_expected", label: "Loan expected", type: "number" },
  { key: "bankId", dbKey: "bank_id", label: "Financing bank", type: "select" },
  { key: "bankersContactNumber", dbKey: "bankers_contact_number", label: "Banker's contact", type: "text" },
  { key: "loanFileNo", dbKey: "loan_file_no", label: "Loan file no.", type: "text" },
  { key: "loanAmount", dbKey: "loan_amount", label: "Loan amount sanctioned", type: "number" },
  { key: "ownContributionRequired", dbKey: "own_contribution_required", label: "Own contribution required", type: "number" },
  { key: "ownContributionReceived", dbKey: "own_contribution_received", label: "Own contribution received", type: "number" },
];

// Exported so NewCustomerScreen.tsx's create form can offer the same
// choices as this screen's edit form, rather than a second hardcoded copy
// silently drifting out of sync with this one.
export const STAGE_OPTIONS = [
  "Held", "Booked", "Funding decided", "Agreement executed", "Registered", "Under collection", "Possession", "Cancelled",
];
const FUNDING_SOURCE_OPTIONS = ["BANK", "OWN FUNDS"];

const STATUS_FIELDS: FieldDef[] = [
  { key: "stage", dbKey: "stage", label: "Stage", type: "select" },
  { key: "dlStatus", dbKey: "dl_status", label: "Disbursement status", type: "text" },
  { key: "dlDate", dbKey: "dl_date", label: "Disbursement date", type: "date" },
  { key: "remark", dbKey: "remark", label: "Remark", type: "textarea" },
];

const inputStyle: CSSProperties = {
  width: "100%",
  fontSize: "0.85rem",
  padding: "0.4rem 0.55rem",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  background: "white",
  color: "#0f172a",
  fontFamily: "inherit",
};

function formatFieldValue(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

// One label + either plain text (view mode) or the right input (edit mode).
// `banks` is only used for the bankId field's <select> options.
function FieldRow({
  def, value, editing, onChange, banks,
}: {
  def: FieldDef;
  value: string | number | null;
  editing: boolean;
  onChange: (dbKey: string, value: string) => void;
  banks: Bank[];
}) {
  const showInput = editing && !def.readOnly && def.dbKey;

  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "0.25rem" }}>{def.label}</div>
      {!showInput ? (
        <div style={{ fontSize: "0.85rem", color: "#0f172a", minHeight: "1.5rem", paddingTop: "0.15rem" }}>
          {def.key === "bankId" ? "—" /* bankName is shown instead, see caller */ : formatFieldValue(value)}
        </div>
      ) : def.type === "textarea" ? (
        <textarea
          value={value === null ? "" : String(value)}
          onChange={(e) => onChange(def.dbKey!, e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      ) : def.type === "select" && def.key === "stage" ? (
        <select value={value === null ? "" : String(value)} onChange={(e) => onChange(def.dbKey!, e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      ) : def.type === "select" && def.key === "fundingSource" ? (
        <select value={value === null ? "" : String(value)} onChange={(e) => onChange(def.dbKey!, e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {FUNDING_SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      ) : def.type === "select" && def.key === "bankId" ? (
        <select value={value === null ? "" : String(value)} onChange={(e) => onChange(def.dbKey!, e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      ) : (
        <input
          type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
          value={value === null ? "" : String(value)}
          onChange={(e) => onChange(def.dbKey!, e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  );
}

// Exported (like STAGE_OPTIONS above) so other full-page screens — e.g.
// NewCustomerScreen.tsx — share the same "titled card of fields" look
// instead of a second copy of this styling drifting out of sync.
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a", marginBottom: "1rem" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>{children}</div>
    </div>
  );
}

// The record's own 3 tabs — Overview (a dashboard of this one customer),
// Details (the full editable record, what this screen used to show as
// one long page), Related records (everything joined to this customer:
// co-applicants, the payment ledger, the milestone schedule). Local to
// this screen for now — the first table with a record detail view at
// all, so there's nothing yet to generalize this against; if a second
// table's record view needs the same 3-tab shape, pull this out the same
// way DataTable.tsx got pulled out of CustomersScreen.tsx.
type TabKey = "overview" | "details" | "related";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "details", label: "Details" },
  { key: "related", label: "Related records" },
];

function TabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <div style={{ display: "flex", gap: "1.5rem", borderBottom: "1px solid #e2e8f0", marginBottom: "1.25rem" }}>
      {TABS.map((t) => (
        <Button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          style={{
            background: "none",
            border: "none",
            borderBottom: active === t.key ? "2px solid #2563eb" : "2px solid transparent",
            marginBottom: "-1px",
            padding: "0 0 0.65rem",
            fontSize: "0.85rem",
            fontWeight: active === t.key ? 600 : 500,
            color: active === t.key ? "#2563eb" : "#64748b",
            cursor: "pointer",
          }}
        >
          {t.label}
        </Button>
      ))}
    </div>
  );
}

export default function CustomerDetailScreen({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [paymentForm, setPaymentForm] = useState({ received_on: "", flat_cost_received: "", gst_received: "", remark: "", source: "" });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [detailRes, banksRes] = await Promise.all([
        fetch(`${API_URL}/customers/${customerId}`, { headers }),
        fetch(`${API_URL}/banks`, { headers }),
      ]);
      const detailBody = await detailRes.json().catch(() => ({}));
      if (!detailRes.ok) {
        setError(detailBody.error ?? `Server said: ${detailRes.status}`);
        return;
      }
      setDetail(detailBody);
      const banksBody = await banksRes.json().catch(() => ({}));
      if (banksRes.ok) setBanks(banksBody.banks ?? []);
    } catch {
      setError("Couldn't reach the API.");
    }
  }

  useEffect(() => {
    load();
    setTab("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  function startEdit() {
    if (!detail) return;
    const next: Record<string, string> = {};
    for (const def of [...IDENTITY_FIELDS, ...DATE_FIELDS, ...COST_FIELDS, ...FUNDING_FIELDS, ...STATUS_FIELDS]) {
      if (!def.dbKey) continue;
      const v = detail.customer[def.key];
      next[def.dbKey] = v === null || v === undefined ? "" : String(v);
    }
    setForm(next);
    setSaveError(null);
    setEditing(true);
    // Edit only ever touches Details-tab fields, but the button lives in
    // the shared header (see the render below) — jump there so turning
    // edit mode on always actually shows something editable, regardless
    // of which tab was open when Edit was clicked.
    setTab("details");
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/customers/${customerId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(body.error ?? `Server said: ${res.status}`);
        return;
      }
      setEditing(false);
      await load();
    } catch {
      setSaveError("Couldn't reach the API.");
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment() {
    setPaymentSaving(true);
    setPaymentError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/customers/${customerId}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaymentError(body.error ?? `Server said: ${res.status}`);
        return;
      }
      setPaymentForm({ received_on: "", flat_cost_received: "", gst_received: "", remark: "", source: "" });
      await load();
    } catch {
      setPaymentError("Couldn't reach the API.");
    } finally {
      setPaymentSaving(false);
    }
  }

  if (error) {
    return (
      <div>
        <Button type="button" onClick={onBack} style={{ ...backLinkStyle }}>← Back to customers</Button>
        <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "0.75rem 1rem", borderRadius: 8, marginTop: "1rem" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div>
        <Button type="button" onClick={onBack} style={{ ...backLinkStyle }}>← Back to customers</Button>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: "1rem" }}>Loading…</p>
      </div>
    );
  }

  const c = detail.customer;

  return (
    <div>
      <Button type="button" onClick={onBack} style={backLinkStyle}>← Back to customers</Button>

      {/* Name, client no., stage, and the Edit/Save/Cancel controls are
          global to the record — same header regardless of which of the
          3 tabs below is open, not something each tab repeats. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "1rem", marginBottom: "1.25rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>{c.fullName}</h1>
          <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0.2rem 0 0" }}>
            {c.psClientNo ?? "No client no."} {c.stage ? `· ${c.stage}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {editing ? (
            <>
              <Button type="button" onClick={() => setEditing(false)} isDisabled={saving} style={secondaryBtnStyle}>Cancel</Button>
              <Button type="button" onClick={save} isDisabled={saving} style={primaryBtnStyle}>{saving ? "Saving…" : "Save changes"}</Button>
            </>
          ) : (
            <Button type="button" onClick={startEdit} style={primaryBtnStyle}>Edit</Button>
          )}
        </div>
      </div>

      {saveError && (
        <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "0.65rem 1rem", borderRadius: 8, marginBottom: "1rem", fontSize: "0.85rem" }}>
          {saveError}
        </div>
      )}

      <TabBar active={tab} onChange={setTab} />

      {tab === "overview" && (
        <>
          {/* Same "amount due" definition as the Overview screen's KPI
              tiles (due/partial/paid milestones only), computed once
              server-side in GET /customers/:id's `totals`, not re-derived
              here. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
            <SummaryTile label="Agreement value" value={formatCompactInr(c.agreementValue ?? 0)} />
            <SummaryTile label="Received to date" value={formatCompactInr(detail.totals.totalReceived)} good />
            <SummaryTile label="Amount due" value={formatCompactInr(detail.totals.amountDue)} />
            <SummaryTile label="Balance" value={formatCompactInr(detail.totals.balance)} />
          </div>

          <MilestoneProgress milestones={detail.milestones} />
          <RecentPayments payments={detail.payments} />
        </>
      )}

      {tab === "details" && (
        <>
          <Section title="Identity & contact">
            {IDENTITY_FIELDS.map((def) => (
              <FieldRow
                key={def.key}
                def={def}
                value={editing && def.dbKey ? form[def.dbKey] ?? "" : (c[def.key] as string | number | null)}
                editing={editing}
                onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                banks={banks}
              />
            ))}
          </Section>

          <Section title="Dates">
            {DATE_FIELDS.map((def) => (
              <FieldRow
                key={def.key}
                def={def}
                value={editing && def.dbKey ? form[def.dbKey] ?? "" : (c[def.key] as string | number | null)}
                editing={editing}
                onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                banks={banks}
              />
            ))}
          </Section>

          <Section title="Pricing & costs">
            {COST_FIELDS.map((def) => (
              <FieldRow
                key={def.key}
                def={def}
                value={editing && def.dbKey ? form[def.dbKey] ?? "" : (c[def.key] as string | number | null)}
                editing={editing}
                onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                banks={banks}
              />
            ))}
          </Section>

          <Section title="Funding & loan">
            {FUNDING_FIELDS.map((def) =>
              def.key === "bankId" ? (
                <div key={def.key}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "0.25rem" }}>{def.label}</div>
                  {editing ? (
                    <select
                      value={form.bank_id ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, bank_id: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">—</option>
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontSize: "0.85rem", color: "#0f172a", minHeight: "1.5rem", paddingTop: "0.15rem" }}>
                      {c.bankName ?? "—"}
                    </div>
                  )}
                </div>
              ) : (
                <FieldRow
                  key={def.key}
                  def={def}
                  value={editing && def.dbKey ? form[def.dbKey] ?? "" : (c[def.key] as string | number | null)}
                  editing={editing}
                  onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                  banks={banks}
                />
              )
            )}
          </Section>

          <Section title="Status">
            {STATUS_FIELDS.map((def) => (
              <FieldRow
                key={def.key}
                def={def}
                value={editing && def.dbKey ? form[def.dbKey] ?? "" : (c[def.key] as string | number | null)}
                editing={editing}
                onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                banks={banks}
              />
            ))}
          </Section>
        </>
      )}

      {tab === "related" && (
        <>
          {detail.coApplicants.length > 0 && (
            <Section title="Co-applicants">
              <div style={{ gridColumn: "1 / -1" }}>
                {detail.coApplicants.map((ca) => (
                  <div key={ca.id} style={{ fontSize: "0.85rem", color: "#0f172a", padding: "0.4rem 0", borderBottom: "1px solid #f1f5f9" }}>
                    <strong>{ca.fullName}</strong>{ca.relation ? ` · ${ca.relation}` : ""}
                    {ca.contactNumber ? ` · ${ca.contactNumber}` : ""}
                  </div>
                ))}
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.5rem" }}>
                  Read-only for now — editing co-applicants isn't built yet.
                </div>
              </div>
            </Section>
          )}

          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a", marginBottom: "0.25rem" }}>Record a payment</div>
            <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginBottom: "1rem" }}>
              Adds to the ledger below. This never edits or removes an existing entry — see docs/LAUNCH_GUARDRAILS.md.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div>
                <div style={fieldLabelStyle}>Date received</div>
                <input type="date" value={paymentForm.received_on} onChange={(e) => setPaymentForm((f) => ({ ...f, received_on: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={fieldLabelStyle}>Flat cost received</div>
                <input type="number" value={paymentForm.flat_cost_received} onChange={(e) => setPaymentForm((f) => ({ ...f, flat_cost_received: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={fieldLabelStyle}>GST received</div>
                <input type="number" value={paymentForm.gst_received} onChange={(e) => setPaymentForm((f) => ({ ...f, gst_received: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <div style={fieldLabelStyle}>Source</div>
                <input type="text" placeholder="e.g. Own funds, LIC Housing" value={paymentForm.source} onChange={(e) => setPaymentForm((f) => ({ ...f, source: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={fieldLabelStyle}>Remark</div>
                <input type="text" value={paymentForm.remark} onChange={(e) => setPaymentForm((f) => ({ ...f, remark: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            {paymentError && (
              <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "0.5rem 0.75rem", borderRadius: 6, marginBottom: "0.75rem", fontSize: "0.8rem" }}>
                {paymentError}
              </div>
            )}
            <Button type="button" onClick={recordPayment} isDisabled={paymentSaving} style={primaryBtnStyle}>
              {paymentSaving ? "Recording…" : "Record payment"}
            </Button>
          </div>

          <Section title={`Payment history (${detail.payments.length})`}>
            <div style={{ gridColumn: "1 / -1" }}>
              {detail.payments.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>No payments recorded yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      {["Date", "Flat cost", "GST", "Source", "Remark"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.4rem 0.5rem", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.4rem 0.5rem" }}>{p.receivedOn}</td>
                        <td style={{ padding: "0.4rem 0.5rem" }}>{formatCompactInr(p.flatCostReceived)}</td>
                        <td style={{ padding: "0.4rem 0.5rem" }}>{formatCompactInr(p.gstReceived)}</td>
                        <td style={{ padding: "0.4rem 0.5rem", color: "#475569" }}>{p.source ?? "—"}</td>
                        <td style={{ padding: "0.4rem 0.5rem", color: "#475569" }}>{p.remark ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Section>

          {detail.milestones.length > 0 && (
            <Section title="Payment milestones">
              <div style={{ gridColumn: "1 / -1" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      {["Milestone", "Amount due", "Due date", "Status"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.4rem 0.5rem", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.milestones.map((m) => (
                      <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.4rem 0.5rem" }}>{m.milestoneName}</td>
                        <td style={{ padding: "0.4rem 0.5rem" }}>{formatCompactInr(m.amountDue)}</td>
                        <td style={{ padding: "0.4rem 0.5rem" }}>{m.dueDate ?? "—"}</td>
                        <td style={{ padding: "0.4rem 0.5rem" }}>{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "0.9rem 1.1rem" }}>
      <div style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 500 }}>{label}</div>
      <div
        style={{
          // Sans, not serif — see OverviewScreen.tsx's KpiTile for why.
          fontSize: "1.3rem",
          fontWeight: 700,
          color: good ? "#15803d" : "#0f172a",
          marginTop: "0.25rem",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const MILESTONE_STATUS_COLOR: Record<string, string> = {
  paid: "#15803d",
  partial: "#b45309",
  due: "#dc2626",
  "not due": "#94a3b8",
};

// Overview tab's "dashboard elements" — a stacked completion bar plus the
// counts it's built from. Tallying already-final status strings the API
// already computed (GET /customers/:id) into 4 buckets is presentation,
// not a new business figure — the same distinction CustomersScreen's
// stage-color grouping already relies on. No new API call: this is
// exactly the `milestones` array CustomerDetailScreen already has.
function MilestoneProgress({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;
  const counts = { paid: 0, partial: 0, due: 0, "not due": 0 } as Record<string, number>;
  for (const m of milestones) counts[m.status] = (counts[m.status] ?? 0) + 1;
  const total = milestones.length;

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.1rem 1.25rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a", marginBottom: "0.75rem" }}>
        Milestone progress ({counts.paid} of {total} paid)
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "#f1f5f9", marginBottom: "0.75rem" }}>
        {(["paid", "partial", "due", "not due"] as const).map((status) =>
          counts[status] > 0 ? (
            <div key={status} style={{ width: `${(counts[status] / total) * 100}%`, background: MILESTONE_STATUS_COLOR[status] }} />
          ) : null
        )}
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {(["paid", "partial", "due", "not due"] as const).map((status) => (
          <div key={status} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", color: "#64748b" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: MILESTONE_STATUS_COLOR[status], flexShrink: 0 }} />
            {counts[status]} {status}
          </div>
        ))}
      </div>
    </div>
  );
}

// Overview tab's other "dashboard element" — the last 3 payments, newest
// first (GET /customers/:id already orders `payments` that way). A
// glance at recent activity without needing the full ledger the Related
// records tab shows.
function RecentPayments({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) return null;
  const recent = payments.slice(0, 3);
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.1rem 1.25rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a", marginBottom: "0.75rem" }}>Recent payments</div>
      {recent.map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
          <span style={{ color: "#64748b" }}>{p.receivedOn} {p.source ? `· ${p.source}` : ""}</span>
          <span style={{ color: "#0f172a", fontWeight: 600 }}>{formatCompactInr(p.flatCostReceived + p.gstReceived)}</span>
        </div>
      ))}
    </div>
  );
}

const fieldLabelStyle: CSSProperties = { fontSize: "0.72rem", color: "#64748b", marginBottom: "0.25rem" };

export const backLinkStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#2563eb",
  fontSize: "0.85rem",
  cursor: "pointer",
  font: "inherit",
};

const primaryBtnStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "white",
  background: "#2563eb",
  border: "1px solid #2563eb",
  borderRadius: 6,
  padding: "0.45rem 0.9rem",
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "#475569",
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "0.45rem 0.9rem",
  cursor: "pointer",
};
