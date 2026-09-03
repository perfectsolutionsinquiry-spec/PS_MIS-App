import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

// A generic, config-driven list view — sortable columns, a per-column
// "contains / starts with" search menu, a gear-icon column-visibility
// slushbucket, and an optional "New" button. Built once here so every
// future table screen (Projects, Towers, Banks, ...) reuses this instead
// of CustomersScreen.tsx growing its own bespoke table again.
//
// Everything here operates on data the caller has already fetched — this
// component sorts/filters/hides columns client-side over an in-memory
// array. It does not fetch, does not decide what a user is allowed to see
// (that's still the API/RLS's job), and does not persist anything to the
// server: column visibility is saved to this browser's localStorage only,
// keyed by `tableKey`, so it's a per-device preference for now rather than
// a per-account one. Upgrading that to a real server-side preference later
// (so it follows a user across devices) is a contained change — swap out
// useColumnVisibility's storage, nothing else here needs to know.

export type ColumnType = "text" | "number" | "date" | "badge";

export type ColumnDef<T> = {
  /** Stable id — used as the sort/filter/visibility key. Never shown to the user. */
  key: string;
  label: string;
  /** Default "text". Drives the sort comparator; "badge" just means "don't bother sorting/filtering it well". */
  type?: ColumnType;
  /** Default true. */
  sortable?: boolean;
  /** Default true — included in the global search box and gets its own 3-dot filter menu. */
  searchable?: boolean;
  /** Default true — whether this column shows up in the table before the user customizes it. */
  defaultVisible?: boolean;
  /** The raw value this column represents, for sorting/searching. */
  accessor: (row: T) => string | number | null;
  /** Optional custom cell content. Falls back to formatting accessor's value as text. */
  render?: (row: T) => ReactNode;
};

type SortState = { key: string; dir: "asc" | "desc" };
type ColumnFilter = { operator: "contains" | "startsWith"; value: string };

// Takes just the two fields it needs, not ColumnDef<T> itself — a
// ColumnDef<T>[] is assignable here regardless of what T is (accessor's
// parameter type never enters into it), so callers never need an unsafe
// cast to call this with their own typed column list.
function useColumnVisibility(tableKey: string, columns: { key: string; defaultVisible?: boolean }[]) {
  const storageKey = `mis:columns:${tableKey}`;
  const defaults = columns.filter((c) => c.defaultVisible !== false).map((c) => c.key);

  const [visible, setVisibleState] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as string[];
      // Only keep keys that are still real columns — a column can be
      // renamed or removed between deploys, and a stale saved value should
      // never be able to produce a table with nothing visible in it.
      const stillValid = parsed.filter((k) => columns.some((c) => c.key === k));
      return stillValid.length > 0 ? stillValid : defaults;
    } catch {
      // Private-browsing / storage-disabled — fall back to showing
      // everything rather than an empty table.
      return defaults;
    }
  });

  function setVisible(keys: string[]) {
    setVisibleState(keys);
    try {
      localStorage.setItem(storageKey, JSON.stringify(keys));
    } catch {
      // Preference just won't survive a reload — not worth surfacing an error for.
    }
  }

  return [visible, setVisible] as const;
}

function compare<T>(a: T, b: T, col: ColumnDef<T>): number {
  const av = col.accessor(a);
  const bv = col.accessor(b);
  if (col.type === "number") return (Number(av) || 0) - (Number(bv) || 0);
  if (col.type === "date") return new Date(String(av ?? 0)).getTime() - new Date(String(bv ?? 0)).getTime();
  return String(av ?? "").localeCompare(String(bv ?? ""));
}

export default function DataTable<T>({
  tableKey,
  columns,
  rows,
  getRowId,
  onRowClick,
  searchPlaceholder = "Search…",
  onNew,
  newLabel = "New",
  emptyLabel = "No records yet.",
}: {
  tableKey: string;
  columns: ColumnDef<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  onNew?: () => void;
  newLabel?: string;
  emptyLabel?: string;
}) {
  const [globalQuery, setGlobalQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useColumnVisibility(tableKey, columns);

  const visibleColumns = columns.filter((c) => visibleKeys.includes(c.key));

  const filtered = useMemo(() => {
    let result = rows;

    const q = globalQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((row) =>
        columns.some((c) => c.searchable !== false && String(c.accessor(row) ?? "").toLowerCase().includes(q))
      );
    }

    for (const [key, filter] of Object.entries(columnFilters)) {
      if (!filter.value.trim()) continue;
      const col = columns.find((c) => c.key === key);
      if (!col) continue;
      const needle = filter.value.trim().toLowerCase();
      result = result.filter((row) => {
        const hay = String(col.accessor(row) ?? "").toLowerCase();
        return filter.operator === "startsWith" ? hay.startsWith(needle) : hay.includes(needle);
      });
    }

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        result = [...result].sort((a, b) => (sort.dir === "asc" ? compare(a, b, col) : -compare(a, b, col)));
      }
    }

    return result;
  }, [rows, globalQuery, columnFilters, sort, columns]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  const activeFilterCount = Object.values(columnFilters).filter((f) => f.value.trim()).length;

  return (
    <div>
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
          {rows.length === 0
            ? emptyLabel
            : `Showing ${filtered.length} of ${rows.length} record${rows.length === 1 ? "" : "s"}`}
          {activeFilterCount > 0 && ` · ${activeFilterCount} column filter${activeFilterCount === 1 ? "" : "s"} active`}
        </p>

        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          {rows.length > 0 && (
            <input
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                padding: "0.5rem 0.85rem",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: "0.85rem",
                width: 260,
                outline: "none",
                background: "white",
              }}
            />
          )}
          <button
            type="button"
            title="Configure columns"
            onClick={() => setConfigOpen(true)}
            style={iconButtonStyle}
          >
            <GearIcon />
          </button>
          {onNew && (
            <button type="button" onClick={onNew} style={primaryBtnStyle}>
              + {newLabel}
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
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
          {emptyLabel}
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {visibleColumns.map((col) => {
                  const isSorted = sort?.key === col.key;
                  const hasFilter = !!columnFilters[col.key]?.value.trim();
                  return (
                    <th
                      key={col.key}
                      style={{
                        position: "relative",
                        textAlign: "left",
                        padding: "0.65rem 1rem",
                        color: "#64748b",
                        fontWeight: 600,
                        fontSize: "0.72rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        <span
                          onClick={col.sortable === false ? undefined : () => toggleSort(col.key)}
                          style={{ cursor: col.sortable === false ? "default" : "pointer", userSelect: "none" }}
                        >
                          {col.label}
                          {isSorted && <span style={{ marginLeft: "0.3rem" }}>{sort!.dir === "asc" ? "▲" : "▼"}</span>}
                        </span>
                        {col.searchable !== false && (
                          <button
                            type="button"
                            onClick={() => setOpenFilterMenu(openFilterMenu === col.key ? null : col.key)}
                            title={`Search within ${col.label}`}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              color: hasFilter ? "#2563eb" : "#94a3b8",
                              fontWeight: 700,
                              padding: "0 0.15rem",
                              fontSize: "0.9rem",
                              lineHeight: 1,
                            }}
                          >
                            ⋮
                          </button>
                        )}
                      </span>

                      {openFilterMenu === col.key && (
                        <ColumnFilterMenu
                          filter={columnFilters[col.key]}
                          onApply={(f) => {
                            setColumnFilters((cur) => ({ ...cur, [col.key]: f }));
                            setOpenFilterMenu(null);
                          }}
                          onClear={() => {
                            setColumnFilters((cur) => {
                              const next = { ...cur };
                              delete next[col.key];
                              return next;
                            });
                            setOpenFilterMenu(null);
                          }}
                          onClose={() => setOpenFilterMenu(null)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} style={{ padding: "2rem 1rem", textAlign: "center", color: "#94a3b8" }}>
                    No records match the current search/filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={getRowId(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={{ borderBottom: "1px solid #f1f5f9", cursor: onRowClick ? "pointer" : "default" }}
                    onMouseEnter={(e) => onRowClick && (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => onRowClick && (e.currentTarget.style.background = "transparent")}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.key} style={{ padding: "0.65rem 1rem", color: "#475569" }}>
                        {col.render ? col.render(row) : formatCell(col.accessor(row))}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {configOpen && (
        <ColumnConfigModal
          columns={columns}
          visibleKeys={visibleKeys}
          onSave={(keys) => {
            setVisibleKeys(keys);
            setConfigOpen(false);
          }}
          onCancel={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

function formatCell(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function ColumnFilterMenu({
  filter, onApply, onClear, onClose,
}: {
  filter: ColumnFilter | undefined;
  onApply: (f: ColumnFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [operator, setOperator] = useState<ColumnFilter["operator"]>(filter?.operator ?? "contains");
  const [value, setValue] = useState(filter?.value ?? "");

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 4,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
        padding: "0.75rem",
        width: 220,
        zIndex: 20,
        textTransform: "none",
        letterSpacing: "normal",
        fontWeight: 400,
        color: "#0f172a",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Filter</span>
        <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8" }}>✕</button>
      </div>
      <select
        value={operator}
        onChange={(e) => setOperator(e.target.value as ColumnFilter["operator"])}
        style={{ width: "100%", fontSize: "0.8rem", padding: "0.35rem 0.5rem", borderRadius: 6, border: "1px solid #e2e8f0", marginBottom: "0.5rem" }}
      >
        <option value="contains">Contains</option>
        <option value="startsWith">Starts with</option>
      </select>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onApply({ operator, value })}
        placeholder="Value…"
        style={{ width: "100%", fontSize: "0.8rem", padding: "0.35rem 0.5rem", borderRadius: 6, border: "1px solid #e2e8f0", marginBottom: "0.6rem" }}
      />
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button type="button" onClick={() => onApply({ operator, value })} style={{ ...primaryBtnStyle, flex: 1, fontSize: "0.75rem", padding: "0.35rem 0" }}>
          Apply
        </button>
        <button type="button" onClick={onClear} style={{ ...secondaryBtnStyle, flex: 1, fontSize: "0.75rem", padding: "0.35rem 0" }}>
          Clear
        </button>
      </div>
    </div>
  );
}

// The gear icon's "adjust visible columns" slushbucket: every column
// starts in one of the two lists, multi-select, and four buttons move
// selections (or everything) across. Nothing is saved until "Save".
function ColumnConfigModal<T>({
  columns, visibleKeys, onSave, onCancel,
}: {
  columns: ColumnDef<T>[];
  visibleKeys: string[];
  onSave: (keys: string[]) => void;
  onCancel: () => void;
}) {
  const [visible, setVisible] = useState<string[]>(visibleKeys);
  const [hiddenSelection, setHiddenSelection] = useState<string[]>([]);
  const [visibleSelection, setVisibleSelection] = useState<string[]>([]);

  const hidden = columns.filter((c) => !visible.includes(c.key)).map((c) => c.key);
  const labelFor = (key: string) => columns.find((c) => c.key === key)?.label ?? key;

  function moveToVisible(keys: string[]) {
    setVisible((cur) => [...cur, ...keys.filter((k) => !cur.includes(k))]);
    setHiddenSelection([]);
  }
  function moveToHidden(keys: string[]) {
    setVisible((cur) => cur.filter((k) => !keys.includes(k)));
    setVisibleSelection([]);
  }

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={{ ...modalStyle, width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", marginBottom: "0.25rem" }}>Configure columns</div>
        <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "1rem" }}>
          Choose which columns show in this table. Saved to this browser only.
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "stretch" }}>
          <div style={{ flex: 1 }}>
            <div style={fieldLabelStyle}>Hidden</div>
            <select
              multiple
              value={hiddenSelection}
              onChange={(e) => setHiddenSelection(Array.from(e.target.selectedOptions, (o) => o.value))}
              style={slushListStyle}
            >
              {hidden.map((key) => (
                <option key={key} value={key}>{labelFor(key)}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.4rem" }}>
            <button type="button" title="Show selected" onClick={() => moveToVisible(hiddenSelection)} style={slushBtnStyle}>&gt;</button>
            <button type="button" title="Show all" onClick={() => moveToVisible(hidden)} style={slushBtnStyle}>&gt;&gt;</button>
            <button type="button" title="Hide selected" onClick={() => moveToHidden(visibleSelection)} style={slushBtnStyle}>&lt;</button>
            <button type="button" title="Hide all" onClick={() => moveToHidden(visible)} style={slushBtnStyle}>&lt;&lt;</button>
          </div>

          <div style={{ flex: 1 }}>
            <div style={fieldLabelStyle}>Visible</div>
            <select
              multiple
              value={visibleSelection}
              onChange={(e) => setVisibleSelection(Array.from(e.target.selectedOptions, (o) => o.value))}
              style={slushListStyle}
            >
              {visible.map((key) => (
                <option key={key} value={key}>{labelFor(key)}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button type="button" onClick={onCancel} style={secondaryBtnStyle}>Cancel</button>
          <button
            type="button"
            // Falls back to whatever was visible before if the user moved
            // every column to "Hidden" and hit Save — an empty table with
            // no columns at all isn't a real state worth letting them save
            // into.
            onClick={() => onSave(visible.length > 0 ? visible : visibleKeys)}
            style={primaryBtnStyle}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Explicitly typed as CSSProperties, not inferred — a plain object literal
// used via `style={someConst}` (rather than written inline in JSX) loses
// the contextual typing that would otherwise narrow e.g. "fixed"/"pointer"
// to their real CSS literal-union types, and widens them to `string`
// instead. Bit this app twice already on React.CSSProperties/ReactNode
// (see CustomerDetailScreen.tsx) — same root cause, so every reusable
// style object below gets the same explicit treatment now rather than
// relying on which specific properties happen to need it.
export const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

export const modalStyle: CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: "1.5rem",
  boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
};

export const fieldLabelStyle: CSSProperties = { fontSize: "0.72rem", color: "#64748b", marginBottom: "0.25rem" };

export const primaryBtnStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "white",
  background: "#2563eb",
  border: "1px solid #2563eb",
  borderRadius: 6,
  padding: "0.45rem 0.9rem",
  cursor: "pointer",
};

export const secondaryBtnStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "#475569",
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: "0.45rem 0.9rem",
  cursor: "pointer",
};

const iconButtonStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "white",
  color: "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const slushListStyle: CSSProperties = {
  width: "100%",
  height: 180,
  fontSize: "0.82rem",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  padding: "0.25rem",
};

const slushBtnStyle: CSSProperties = {
  width: 36,
  height: 28,
  borderRadius: 6,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#475569",
  cursor: "pointer",
  fontSize: "0.8rem",
};
