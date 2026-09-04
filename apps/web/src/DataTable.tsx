import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
type AdvancedOperator = "contains" | "startsWith" | "endsWith" | "equals" | "notEquals" | "oneOf" | "isEmpty" | "isNotEmpty";
type AdvancedCondition = { id: string; field: string; operator: AdvancedOperator; value: string };
type AdvancedGroup = { id: string; conditions: AdvancedCondition[] };
type AdvancedFilterState = { groups: AdvancedGroup[]; groupBy: string; sort: SortState | null };

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
  // Which column's filter menu is open, plus the ⋮ button's own full
  // screen rect at the moment it was clicked — the menu portals to
  // document.body and uses this to place itself (see ColumnFilterMenu),
  // rather than being a CSS-absolute child of the <th>. A table wrapper
  // can scroll (overflow: auto, for a wide table) and a <th> is an
  // unreliable positioning context across browsers besides — nesting the
  // menu inside either one was clipping and misplacing it. The full rect
  // (not just top/left) is kept so the menu can flip above the button, or
  // clamp its left edge inward, when the button is near the bottom or
  // right edge of the screen — see ColumnFilterMenu's own positioning
  // effect, which is where that math actually happens.
  const [openFilter, setOpenFilter] = useState<{ key: string; anchor: { top: number; bottom: number; left: number } } | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilterState>({ groups: [], groupBy: "", sort: null });
  const [visibleKeys, setVisibleKeys] = useColumnVisibility(tableKey, columns);

  // Column order in the table follows visibleKeys' own order, not
  // `columns`' original declaration order — that's what lets the
  // slushbucket's up/down reordering (ColumnConfigModal below) actually
  // change what order columns appear in, not just which ones are shown.
  const visibleColumns = visibleKeys
    .map((key) => columns.find((c) => c.key === key))
    .filter((c): c is ColumnDef<T> => c !== undefined);

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

    if (advancedFilter.groups.length > 0) {
      result = result.filter((row) =>
        advancedFilter.groups.some((group) =>
          group.conditions.every((condition) => {
            const col = columns.find((c) => c.key === condition.field);
            if (!col) return true;
            const raw = String(col.accessor(row) ?? "");
            const hay = raw.toLowerCase();
            const needle = condition.value.trim().toLowerCase();
            switch (condition.operator) {
              case "contains": return hay.includes(needle);
              case "startsWith": return hay.startsWith(needle);
              case "endsWith": return hay.endsWith(needle);
              case "equals": return hay === needle;
              case "notEquals": return hay !== needle;
              case "oneOf": return condition.value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean).includes(hay);
              case "isEmpty": return raw.trim() === "";
              case "isNotEmpty": return raw.trim() !== "";
              default: return false;
            }
          })
        )
      );
    }

    const activeSort = advancedFilter.sort ?? sort;
    if (activeSort) {
      const col = columns.find((c) => c.key === activeSort.key);
      if (col) {
        result = [...result].sort((a, b) => (activeSort.dir === "asc" ? compare(a, b, col) : -compare(a, b, col)));
      }
    }

    return result;
  }, [rows, globalQuery, columnFilters, sort, advancedFilter, columns]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  const activeFilterCount = Object.values(columnFilters).filter((f) => f.value.trim()).length
    + advancedFilter.groups.reduce((count, group) => count + group.conditions.length, 0);
  const groupedRows = advancedFilter.groupBy
    ? filtered.reduce<Record<string, T[]>>((groups, row) => {
        const col = columns.find((c) => c.key === advancedFilter.groupBy);
        const label = String(col?.accessor(row) ?? "Empty");
        (groups[label] ??= []).push(row);
        return groups;
      }, {})
    : null;
  const renderDataRow = (row: T) => (
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
  );

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
          {activeFilterCount > 0 && ` · ${activeFilterCount} filter rule${activeFilterCount === 1 ? "" : "s"} active`}
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
            title="Build filters"
            onClick={() => setAdvancedOpen(true)}
            style={{ ...iconButtonStyle, color: advancedFilter.groups.length ? "#2563eb" : "#64748b" }}
          >
            <FilterIcon />
            {advancedFilter.groups.length > 0 && <span style={{ fontSize: "0.7rem", marginLeft: "-0.25rem" }}>{advancedFilter.groups.length}</span>}
          </button>
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
                  const activeSort = advancedFilter.sort ?? sort;
                  const isSorted = activeSort?.key === col.key;
                  const hasFilter = !!columnFilters[col.key]?.value.trim();
                  return (
                    <th
                      key={col.key}
                      style={{
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
                          {isSorted && <span style={{ marginLeft: "0.3rem" }}>{activeSort!.dir === "asc" ? "▲" : "▼"}</span>}
                        </span>
                        {col.searchable !== false && (
                          <button
                            type="button"
                            // The portal's own outside-click listener
                            // (ColumnFilterMenu) would otherwise see THIS
                            // button's mousedown as "outside the menu" and
                            // close it a moment before this onClick reopens
                            // it — stopping propagation here keeps that
                            // listener from ever seeing this click, so
                            // clicking the same ⋮ twice reliably opens then
                            // closes instead of flickering.
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              if (openFilter?.key === col.key) {
                                setOpenFilter(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setOpenFilter({ key: col.key, anchor: { top: rect.top, bottom: rect.bottom, left: rect.left } });
                            }}
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
                groupedRows
                  ? Object.entries(groupedRows).flatMap(([groupLabel, groupRows]) => [
                      <tr key={`group-${groupLabel}`} style={{ background: "#eff6ff" }}>
                        <td colSpan={visibleColumns.length} style={{ padding: "0.55rem 1rem", color: "#1d4ed8", fontWeight: 700, fontSize: "0.78rem" }}>
                          {columns.find((c) => c.key === advancedFilter.groupBy)?.label}: {groupLabel} <span style={{ fontWeight: 500 }}>({groupRows.length})</span>
                        </td>
                      </tr>,
                      ...groupRows.map(renderDataRow),
                    ])
                  : filtered.map(renderDataRow)
              )}
            </tbody>
          </table>
        </div>
      )}

      {openFilter && (
        <ColumnFilterMenu
          anchor={openFilter.anchor}
          filter={columnFilters[openFilter.key]}
          onApply={(f) => {
            setColumnFilters((cur) => ({ ...cur, [openFilter.key]: f }));
            setOpenFilter(null);
          }}
          onClear={() => {
            setColumnFilters((cur) => {
              const next = { ...cur };
              delete next[openFilter.key];
              return next;
            });
            setOpenFilter(null);
          }}
          onClose={() => setOpenFilter(null)}
        />
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
      {advancedOpen && (
        <AdvancedFilterModal
          columns={columns}
          initial={advancedFilter}
          onRun={(next) => {
            setAdvancedFilter(next);
            setAdvancedOpen(false);
          }}
          onCancel={() => setAdvancedOpen(false)}
        />
      )}
    </div>
  );
}

function formatCell(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function FilterIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 5h16M7 12h10M10 19h4" /></svg>;
}

function AdvancedFilterModal<T>({
  columns, initial, onRun, onCancel,
}: {
  columns: ColumnDef<T>[];
  initial: AdvancedFilterState;
  onRun: (state: AdvancedFilterState) => void;
  onCancel: () => void;
}) {
  const [groups, setGroups] = useState<AdvancedGroup[]>(
    initial.groups.length ? initial.groups : [{ id: "group-1", conditions: [{ id: "condition-1", field: columns[0]?.key ?? "", operator: "contains", value: "" }] }]
  );
  const [groupBy, setGroupBy] = useState(initial.groupBy);
  const [sort, setSort] = useState<SortState | null>(initial.sort);
  const updateCondition = (groupId: string, conditionId: string, patch: Partial<AdvancedCondition>) =>
    setGroups((current) => current.map((group) => group.id !== groupId ? group : {
      ...group,
      conditions: group.conditions.map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition),
    }));
  const addCondition = (groupId: string) => setGroups((current) => current.map((group) => group.id !== groupId ? group : {
    ...group,
    conditions: [...group.conditions, { id: `condition-${Date.now()}`, field: columns[0]?.key ?? "", operator: "contains", value: "" }],
  }));
  const removeCondition = (groupId: string, conditionId: string) => setGroups((current) => current.map((group) => group.id !== groupId ? group : {
    ...group,
    conditions: group.conditions.filter((condition) => condition.id !== conditionId),
  }).filter((group) => group.conditions.length > 0));
  const addGroup = () => setGroups((current) => [...current, {
    id: `group-${Date.now()}`,
    conditions: [{ id: `condition-${Date.now()}`, field: columns[0]?.key ?? "", operator: "contains", value: "" }],
  }]);
  const selectStyle: CSSProperties = { padding: "0.45rem 0.5rem", border: "1px solid #cbd5e1", borderRadius: 6, background: "white", color: "#0f172a", fontSize: "0.82rem" };
  return createPortal(
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, width: "min(760px, calc(100vw - 2rem))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#0f172a" }}>Filter customers</h2>
            <p style={{ margin: "0.2rem 0 0", color: "#64748b", fontSize: "0.78rem" }}>Conditions within a group use AND. Groups use OR.</p>
          </div>
          <button type="button" onClick={onCancel} style={closeButtonStyle}>×</button>
        </div>
        {groups.map((group, groupIndex) => (
          <div key={group.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem", marginBottom: "0.65rem" }}>
            {group.conditions.map((condition, index) => (
              <div key={condition.id} style={{ display: "grid", gridTemplateColumns: "1.1fr 1.1fr 1.5fr auto", gap: "0.45rem", alignItems: "center", marginBottom: index === group.conditions.length - 1 ? 0 : "0.45rem" }}>
                <select value={condition.field} onChange={(e) => updateCondition(group.id, condition.id, { field: e.target.value })} style={selectStyle}>
                  {columns.filter((column) => column.searchable !== false).map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
                </select>
                <select value={condition.operator} onChange={(e) => updateCondition(group.id, condition.id, { operator: e.target.value as AdvancedOperator })} style={selectStyle}>
                  <option value="contains">contains</option><option value="startsWith">starts with</option><option value="endsWith">ends with</option>
                  <option value="equals">is</option><option value="notEquals">is not</option><option value="oneOf">is one of</option>
                  <option value="isEmpty">is empty</option><option value="isNotEmpty">is not empty</option>
                </select>
                {condition.operator === "isEmpty" || condition.operator === "isNotEmpty" ? <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>No value required</div> : <input value={condition.value} onChange={(e) => updateCondition(group.id, condition.id, { value: e.target.value })} placeholder={condition.operator === "oneOf" ? "Value 1, Value 2" : "Value"} style={{ ...selectStyle, width: "100%" }} />}
                <button type="button" onClick={() => removeCondition(group.id, condition.id)} title="Remove condition" style={smallButtonStyle}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => addCondition(group.id)} style={textButtonStyle}>+ AND condition</button>
            {groupIndex > 0 && <span style={{ color: "#94a3b8", fontSize: "0.75rem", marginLeft: "0.7rem" }}>OR group</span>}
          </div>
        ))}
        <button type="button" onClick={addGroup} style={textButtonStyle}>+ OR group</button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
          <label style={labelStyle}>Group rows by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ ...selectStyle, width: "100%", marginTop: "0.3rem" }}>
              <option value="">No grouping</option>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Sort rows by
            <select value={sort?.key ?? ""} onChange={(e) => setSort(e.target.value ? { key: e.target.value, dir: sort?.dir ?? "asc" } : null)} style={{ ...selectStyle, width: "100%", marginTop: "0.3rem" }}>
              <option value="">Keep current sort</option>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
            </select>
          </label>
        </div>
        {sort && <button type="button" onClick={() => setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })} style={{ ...textButtonStyle, marginTop: "0.45rem" }}>Sort direction: {sort.dir === "asc" ? "Ascending" : "Descending"}</button>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem", marginTop: "1.25rem" }}>
          <button type="button" onClick={onCancel} style={secondaryBtnStyle}>Cancel</button>
          <button type="button" onClick={() => onRun({ groups: groups.filter((group) => group.conditions.some((condition) => condition.operator === "isEmpty" || condition.operator === "isNotEmpty" || condition.value.trim())), groupBy, sort })} style={primaryBtnStyle}>Run</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Portals into document.body and positions itself with `position: fixed`
// at the ⋮ button's own on-screen coordinates (captured on click — see
// DataTable's openFilter state) instead of being a CSS-absolute child of
// the <th> it belongs to. A <th> is an unreliable positioning context for
// an absolutely-positioned child across browsers, and the table's own
// wrapper scrolls (overflow: auto, for a wide table) — both were clipping
// and misplacing this menu when it lived inline in the table.
function ColumnFilterMenu({
  anchor, filter, onApply, onClear, onClose,
}: {
  anchor: { top: number; bottom: number; left: number };
  filter: ColumnFilter | undefined;
  onApply: (f: ColumnFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [operator, setOperator] = useState<ColumnFilter["operator"]>(filter?.operator ?? "contains");
  const [value, setValue] = useState(filter?.value ?? "");
  const menuRef = useRef<HTMLDivElement>(null);

  // Naively placing this at { top: anchor.bottom + 4, left: anchor.left }
  // (the previous version) put it off the right edge of the screen for
  // any column near the right side of the table — confirmed against a
  // real reproduction, not just reasoned about: the STAGE column (last
  // one) put a 220px-wide menu at rect.left=332 on a 432px-wide screen,
  // 120px past the edge. Fixed the honest way — render once to measure
  // this menu's own actual size (which its content, not a guess, decides),
  // then clamp left inward from the right edge and flip above the button
  // if there's more room there than below. Starts invisible so the
  // one-frame "wrong then corrected" position never flashes on screen.
  const [style, setStyle] = useState<{ top: number; left: number; visible: boolean }>({
    top: anchor.bottom + 4,
    left: anchor.left,
    visible: false,
  });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    let left = anchor.left;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - rect.width);
    }
    let top = anchor.bottom + 4;
    if (top + rect.height > window.innerHeight - margin) {
      const above = anchor.top - rect.height - 4;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - rect.height);
    }
    setStyle({ top, left, visible: true });
    // Deliberately runs once, on mount, against this render's actual
    // content — the menu's own size never changes after that (its inputs
    // don't grow/shrink the box), so there's nothing to re-measure later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // `position: fixed` tracks the viewport, not the button underneath it
    // — if the page scrolls while this is open, the menu would otherwise
    // visually detach from the ⋮ it came from. Closing on scroll is
    // simpler and more predictable than re-measuring the button's
    // position on every scroll event.
    function handleScroll() {
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: style.top,
        left: style.left,
        visibility: style.visible ? "visible" : "hidden",
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(15,23,42,0.16)",
        padding: "0.75rem",
        width: 220,
        zIndex: 1000,
        color: "#0f172a",
      }}
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
    </div>,
    document.body
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

  // The "Visible" list's own order becomes the table's actual column
  // order (see DataTable's visibleColumns above) — these move the
  // currently-selected item(s) one slot up/down within it. Selected
  // indices are resolved fresh each call (not memoized) since `visible`
  // changes on every move; moving up walks lowest-index-first and moving
  // down walks highest-index-first so a multi-selected block shifts as a
  // group instead of its members leapfrogging each other.
  function moveSelected(direction: -1 | 1) {
    if (visibleSelection.length === 0) return;
    setVisible((cur) => {
      const next = [...cur];
      const indices = visibleSelection
        .map((k) => next.indexOf(k))
        .filter((i) => i !== -1)
        .sort((a, b) => (direction === -1 ? a - b : b - a));
      for (const i of indices) {
        const swapWith = i + direction;
        if (swapWith < 0 || swapWith >= next.length) continue;
        [next[i], next[swapWith]] = [next[swapWith], next[i]];
      }
      return next;
    });
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={fieldLabelStyle}>Visible</div>
              <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.25rem" }}>
                <button type="button" title="Move up" onClick={() => moveSelected(-1)} style={{ ...slushBtnStyle, width: 24, height: 22, fontSize: "0.7rem" }}>↑</button>
                <button type="button" title="Move down" onClick={() => moveSelected(1)} style={{ ...slushBtnStyle, width: 24, height: 22, fontSize: "0.7rem" }}>↓</button>
              </div>
            </div>
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
            <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.25rem" }}>
              This order becomes the table's column order.
            </div>
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
const labelStyle: CSSProperties = { display: "block", color: "#475569", fontSize: "0.78rem", fontWeight: 600 };
const closeButtonStyle: CSSProperties = { border: "none", background: "transparent", color: "#64748b", fontSize: "1.5rem", cursor: "pointer", lineHeight: 1 };
const smallButtonStyle: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 6, background: "white", color: "#64748b", width: 28, height: 28, cursor: "pointer", fontSize: "1rem" };
const textButtonStyle: CSSProperties = { border: "none", background: "transparent", color: "#2563eb", padding: "0.2rem 0", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 };

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
