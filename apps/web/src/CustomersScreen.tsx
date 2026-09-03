import { useState } from "react";
import type { Customer, Identity } from "./types";
import PageHeader from "./PageHeader";
import DataTable from "./DataTable";
import type { ColumnDef } from "./DataTable";
import NewCustomerModal from "./NewCustomerModal";

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

export default function CustomersScreen({
  customers, identity, onSelect, onCreated,
}: {
  customers: Customer[];
  identity: Identity | null;
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader title="Customers" />

      <DataTable
        tableKey="customers"
        columns={CUSTOMER_COLUMNS}
        rows={customers}
        getRowId={(c) => c.id}
        onRowClick={(c) => onSelect(c.id)}
        searchPlaceholder="Search name, phone, email, stage…"
        onNew={() => setCreating(true)}
        newLabel="New customer"
        emptyLabel="No customers yet."
      />

      {creating && (
        <NewCustomerModal
          identity={identity}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onCreated(id);
          }}
        />
      )}
    </div>
  );
}
