import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import type { Builder, Identity } from "./types";
import { STAGE_OPTIONS, Section, backLinkStyle } from "./CustomerDetailScreen";
import { fieldLabelStyle, primaryBtnStyle, secondaryBtnStyle } from "./DataTable";

const API_URL = import.meta.env.VITE_API_URL as string;

// A full page, not a popup modal — same "screen the content area swaps
// to" pattern CustomerDetailScreen already uses (← Back link, Section
// cards), rather than a centered overlay dialog. This used to be
// NewCustomerModal.tsx; renamed along with the redesign since it's no
// longer a modal in any sense.
//
// Deliberately NOT the full generic tabbed record view (that's a
// separate, larger increment) — just the handful of fields you actually
// need to start a customer record with. Everything else is filled in
// afterwards via CustomerDetailScreen's edit mode, same as it already
// works for every other field.
export default function NewCustomerScreen({
  identity, onBack, onCreated,
}: {
  identity: Identity | null;
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const { getToken } = useAuth();
  const isStaff = identity?.kind === "staff";

  const [builders, setBuilders] = useState<Builder[]>([]);
  const [form, setForm] = useState({ full_name: "", agreement_no: "", contact_number: "", email: "", stage: "", builder_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only staff need this — a builder_user's own builder_id is implicit
    // and this list would just be every OTHER builder's name, which a
    // builder_user has no legitimate reason to see.
    if (!isStaff) return;
    (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/builders`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setBuilders(body.builders ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  async function save() {
    if (!form.full_name.trim()) {
      setError("Name is required.");
      return;
    }
    if (isStaff && !form.builder_id) {
      setError("Choose which builder this customer belongs to.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/customers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Server said: ${res.status}`);
        return;
      }
      onCreated(body.id);
    } catch {
      setError("Couldn't reach the API.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} disabled={saving} style={backLinkStyle}>← Back to customers</button>

      <div style={{ marginTop: "1rem", marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>New customer</h1>
        <p style={{ color: "#64748b", fontSize: "0.82rem", margin: "0.3rem 0 0" }}>
          Fields marked <span style={{ color: "#dc2626", fontWeight: 700 }}>*</span> are required. Everything else can
          be filled in later — from this customer's own record, the same way any existing customer is edited.
        </p>
      </div>

      {error && (
        <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "0.65rem 1rem", borderRadius: 8, marginBottom: "1rem", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      <Section title="Identity">
        {isStaff && (
          <div>
            <div style={fieldLabelStyle}>
              Builder <span style={{ color: "#dc2626" }}>*</span>
            </div>
            <select value={form.builder_id} onChange={(e) => setForm((f) => ({ ...f, builder_id: e.target.value }))} style={inputStyle}>
              <option value="">Select builder…</option>
              {builders.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <div style={fieldLabelStyle}>
            Full name <span style={{ color: "#dc2626" }}>*</span>
          </div>
          <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} style={inputStyle} autoFocus />
        </div>
        <div>
          <div style={fieldLabelStyle}>Agreement no.</div>
          <input value={form.agreement_no} onChange={(e) => setForm((f) => ({ ...f, agreement_no: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={fieldLabelStyle}>Phone</div>
          <input value={form.contact_number} onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={fieldLabelStyle}>Email</div>
          <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={fieldLabelStyle}>Stage</div>
          <select value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))} style={inputStyle}>
            <option value="">—</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </Section>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" onClick={onBack} disabled={saving} style={secondaryBtnStyle}>Cancel</button>
        <button type="button" onClick={save} disabled={saving} style={primaryBtnStyle}>
          {saving ? "Creating…" : "Create customer"}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  fontSize: "0.85rem",
  padding: "0.4rem 0.55rem",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  background: "white",
  color: "#0f172a",
  fontFamily: "inherit",
};
