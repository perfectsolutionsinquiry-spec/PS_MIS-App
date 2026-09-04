// The ServiceNow-style "list becomes a tab, a record opens in its own"
// browsing pattern — ADT/App.tsx's `Shell` owns which tabs exist and
// which is active (see its `customerTabs`/`activeView` state); this file
// is purely the strip itself, so it's reusable if a second table ever
// gets the same record-tabs treatment.
//
// Deliberately NOT full session-persisted multi-record state: switching
// tabs re-mounts whatever screen is active (CustomerDetailScreen already
// refetches on its own customerId change), so an in-progress edit on a
// tab you switch away from is lost, same as closing and reopening it.
// Keeping every open tab's component mounted (hidden, not unmounted) to
// avoid that is a real upgrade path if it's ever worth the complexity —
// not built now because nothing has asked for it yet.

import { Button } from "react-aria-components";

export type Tab = {
  key: string;
  label: string;
  /** The one tab that can't be closed — the list itself. */
  closable?: boolean;
};

export default function TabStrip({
  tabs, active, onSelect, onClose,
}: {
  tabs: Tab[];
  active: string;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "0.25rem",
        borderBottom: "1px solid #e2e8f0",
        marginBottom: "1.5rem",
        overflowX: "auto",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <div
            key={t.key}
            onClick={() => onSelect(t.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.55rem 0.9rem",
              borderRadius: "8px 8px 0 0",
              border: "1px solid",
              borderColor: isActive ? "#e2e8f0" : "transparent",
              borderBottom: isActive ? "1px solid white" : "1px solid transparent",
              marginBottom: "-1px",
              background: isActive ? "white" : "transparent",
              color: isActive ? "#0f172a" : "#64748b",
              fontSize: "0.84rem",
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              maxWidth: 200,
            }}
            title={t.label}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
            {t.closable && (
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.key);
                }}
                title={`Close ${t.label}`}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                  lineHeight: 1,
                  padding: "0.1rem 0.2rem",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                ✕
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
