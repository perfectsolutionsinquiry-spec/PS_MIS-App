import { useEffect, useState } from "react";
import { Button } from "react-aria-components";
import { AriaSelect, AriaTextField } from "./AriaControls";
import { PS_COLORS } from "./theme";
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
      <Button type="button" onClick={onBack} isDisabled={saving} style={backLinkStyle}>← Back to customers</Button>

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
            <AriaSelect value={form.builder_id} onChange={(value) => setForm((f) => ({ ...f, builder_id: value }))} ariaLabel="Builder" placeholder="Select builder…" style={inputStyle} options={builders.map((b) => ({ value: b.id, label: b.name }))} />
          </div>
        )}
        <div>
          <div style={fieldLabelStyle}>
            Full name <span style={{ color: "#dc2626" }}>*</span>
          </div>
          <AriaTextField value={form.full_name} onChange={(value) => setForm((f) => ({ ...f, full_name: value }))} style={inputStyle} autoFocus aria-label="Full name" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Agreement no.</div>
          <AriaTextField value={form.agreement_no} onChange={(value) => setForm((f) => ({ ...f, agreement_no: value }))} style={inputStyle} aria-label="Agreement number" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Phone</div>
          <AriaTextField value={form.contact_number} onChange={(value) => setForm((f) => ({ ...f, contact_number: value }))} style={inputStyle} aria-label="Phone" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Email</div>
          <AriaTextField value={form.email} onChange={(value) => setForm((f) => ({ ...f, email: value }))} style={inputStyle} aria-label="Email" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Stage</div>
          <AriaSelect value={form.stage} onChange={(value) => setForm((f) => ({ ...f, stage: value }))} ariaLabel="Stage" placeholder="—" style={inputStyle} options={STAGE_OPTIONS.map((s) => ({ value: s, label: s }))} />
        </div>
      </Section>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button type="button" onClick={onBack} isDisabled={saving} style={secondaryBtnStyle}>Cancel</Button>
        <Button type="button" onClick={save} isDisabled={saving} style={primaryBtnStyle}>
          {saving ? "Creating…" : "Create customer"}
        </Button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  fontSize: "0.85rem",
  padding: "0.4rem 0.55rem",
  borderRadius: 6,
  border: `1px solid ${PS_COLORS.ruleBorder}`,
  background: PS_COLORS.offWhite,
  color: PS_COLORS.nearBlackNavy,
  fontFamily: "inherit",
};
