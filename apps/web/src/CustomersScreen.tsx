import { useMemo, useState } from "react";
import type { Customer } from "./types";
import PageHeader from "./PageHeader";

// Purely presentational — colors a stage badge based on the exact text the
// API sends back. Falls back to a neutral badge for any stage value not
// listed here, so a new/unexpected stage never breaks rendering.
const STAGE_STYLES: Record<string, { bg: string; fg: string }> = {
  REGISTERED: { bg: "#dcfce7", fg: "#166534" },
  BOOKED: { bg: "#dbeafe", fg: "#1e40af" },
  "AGREEMENT DONE": { bg: "#ede9fe", fg: "#5b21b6" },
  UNSOLD: { bg: "#f1f5f9", fg: "#475569" },
  HOLD: { bg: "#fef3c7", fg: "#92400e" },
  CANCELLED: { bg: "#fee2e2", fg: "#991b1b" },
};

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span style={{ color: "#94a3b8" }}>—</span>;
  const style = STAGE_STYLES[stage] ?? { bg: "#f1f5f9", fg: "#475569" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.6rem",
        borderRadius: 999,
        fontSize: "0.72rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        background: style.bg,
        color: style.fg,
      }}
    >
      {stage}
    </span>
  );
}

export default function CustomersScreen({ customers, onSelect }: { customers: Customer[]; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");

  // Client-side filter over what's already been fetched — no extra API
  // call, no server-side logic added just to support a search box.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.stage ?? "").toLowerCase().includes(q)
    );
  }, [customers, query]);

  return (
    <div>
      <PageHeader title="Customers" />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
          {customers.length === 0
            ? "No customers yet."
            : `Showing ${filtered.length} of ${customers.length} customer${customers.length === 1 ? "" : "s"}`}
        </p>

        {customers.length > 0 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, email, stage…"
            style={{
              padding: "0.5rem 0.85rem",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: "0.85rem",
              width: 280,
              outline: "none",
              background: "white",
            }}
          />
        )}
      </div>

      {customers.length === 0 ? (
        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "3rem 1rem",
            textAlign: "center",
            color: "#94a3b8",
            fontSize: "0.9rem",
          }}
        >
          No customers yet.
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Name", "Phone", "Email", "Stage"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "0.65rem 1rem",
                      color: "#64748b",
                      fontWeight: 600,
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "2rem 1rem", textAlign: "center", color: "#94a3b8" }}>
                    No customers match "{query}".
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "0.65rem 1rem", color: "#0f172a", fontWeight: 500 }}>{c.full_name}</td>
                    <td style={{ padding: "0.65rem 1rem", color: "#475569" }}>{c.phone ?? "—"}</td>
                    <td style={{ padding: "0.65rem 1rem", color: "#475569" }}>{c.email ?? "—"}</td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <StageBadge stage={c.stage} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
