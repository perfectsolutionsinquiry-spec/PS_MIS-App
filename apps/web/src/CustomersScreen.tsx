import { useState } from "react";
import type { Customer } from "./types";
import PageHeader from "./PageHeader";
import DataTable from "./DataTable";
import type { ColumnDef } from "./DataTable";

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

// Column config for DataTable.tsx (apps/web/src/DataTable.tsx) — the
// generic sortable/searchable/column-configurable table every future list
// screen (Projects, Towers, Banks, ...) is meant to reuse. This is the
// first table wired up to it.
const CUSTOMER_COLUMNS: ColumnDef<Customer>[] = [
  { key: "full_name", label: "Name", type: "text", accessor: (c) => c.full_name },
  { key: "phone", label: "Phone", type: "text", accessor: (c) => c.phone },
  { key: "email", label: "Email", type: "text", accessor: (c) => c.email },
  {
    key: "stage",
    label: "Stage",
    type: "text",
    accessor: (c) => c.stage,
    render: (c) => <StageBadge stage={c.stage} />,
  },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500];

// Purely a list view now — "New customer" used to open its own modal
// state here, but that form is a full screen (NewCustomerScreen.tsx),
// same "the content area swaps to it" pattern as opening a customer's
// record, not a popup on top of this list. App.tsx owns which screen is
// showing, so onNew is just handed straight through to it.
export default function CustomersScreen({
  customers, onSelect, onNew, onRefresh, pagination, onPageChange, onPageSizeChange,
}: {
  customers: Customer[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onRefresh: () => void | Promise<void>;
  pagination: { total: number; page: number; limit: number; totalPages: number };
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());

  async function refreshCustomers() {
    setRefreshing(true);
    try {
      await onRefresh();
      setLastRefreshed(new Date());
    } finally {
      setRefreshing(false);
    }
  }

  // Calculate the range of items being shown
  const startItem = (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div>
      <PageHeader title="Customer - All" count={pagination.total} onRefresh={refreshCustomers} refreshing={refreshing} lastRefreshed={lastRefreshed} />
      <DataTable
        tableKey="customers"
        columns={CUSTOMER_COLUMNS}
        rows={customers}
        getRowId={(c) => c.id}
        onRowClick={(c) => onSelect(c.id)}
        searchPlaceholder="Search name, phone, email, stage…"
        onNew={onNew}
        newLabel="New"
        emptyLabel="No customers yet."
      />

      {/* Pagination controls */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1rem 0",
        borderTop: "1px solid #e2e8f0",
        marginTop: "1rem",
        flexWrap: "wrap",
        gap: "1rem",
      }}>
        {/* Page size selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Rows per page:</span>
          <select
            value={pagination.limit}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{
              padding: "0.35rem 0.6rem",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              fontSize: "0.85rem",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        {/* Page info and navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            {pagination.total === 0 ? "0" : `${startItem}–${endItem}`} of {pagination.total}
          </span>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button
              onClick={() => onPageChange(1)}
              disabled={pagination.page <= 1}
              style={{
                padding: "0.35rem 0.6rem",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: pagination.page <= 1 ? "#f1f5f9" : "#fff",
                color: pagination.page <= 1 ? "#94a3b8" : "#334155",
                cursor: pagination.page <= 1 ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
              }}
            >
              {"<<"}
            </button>
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              style={{
                padding: "0.35rem 0.6rem",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: pagination.page <= 1 ? "#f1f5f9" : "#fff",
                color: pagination.page <= 1 ? "#94a3b8" : "#334155",
                cursor: pagination.page <= 1 ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
              }}
            >
              {"<"}
            </button>
            <span style={{
              padding: "0.35rem 0.75rem",
              borderRadius: 6,
              background: "#eff6ff",
              color: "#1e40af",
              fontSize: "0.85rem",
              fontWeight: 600,
              minWidth: "2.5rem",
              textAlign: "center",
            }}>
              {pagination.page}
            </span>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              style={{
                padding: "0.35rem 0.6rem",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: pagination.page >= pagination.totalPages ? "#f1f5f9" : "#fff",
                color: pagination.page >= pagination.totalPages ? "#94a3b8" : "#334155",
                cursor: pagination.page >= pagination.totalPages ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
              }}
            >
              {">"}
            </button>
            <button
              onClick={() => onPageChange(pagination.totalPages)}
              disabled={pagination.page >= pagination.totalPages}
              style={{
                padding: "0.35rem 0.6rem",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: pagination.page >= pagination.totalPages ? "#f1f5f9" : "#fff",
                color: pagination.page >= pagination.totalPages ? "#94a3b8" : "#334155",
                cursor: pagination.page >= pagination.totalPages ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
              }}
            >
              {">>"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
