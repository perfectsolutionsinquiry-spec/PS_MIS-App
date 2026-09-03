import { useState } from "react";

export type BarRow = { label: string; value: number };

// Horizontal bar, ranking a single measure across categories — the
// dataviz skill's own form guidance for "compare magnitude" is a single
// hue, not one color per bar (that's an identity encoding this chart
// doesn't need: the axis label already names each bar). Mark spec: <=24px
// thick, rounded only at the data end, square at the baseline, value at
// the tip — see marks-and-anatomy.md.
export default function BarChart({
  bars, formatValue, color = "#2563eb", maxHeight,
}: {
  bars: BarRow[]; formatValue: (v: number) => string; color?: string;
  // Set for a list that can run long (outstanding-by-customer: every
  // outstanding customer, not a top-N — could be hundreds on a real
  // builder) so it scrolls inside the card instead of stretching it.
  // Unset for a short, fixed-length list (loan-by-bank) where every bar
  // should just be visible at once.
  maxHeight?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (bars.length === 0) {
    return <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", padding: "2.5rem 0" }}>No data yet.</div>;
  }

  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", maxHeight, overflowY: maxHeight ? "auto" : undefined, paddingRight: maxHeight ? "0.4rem" : undefined }}>
      {bars.map((b, i) => {
        const isActive = active === i;
        return (
          <div
            key={i}
            tabIndex={0}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            style={{ display: "grid", gridTemplateColumns: "108px 1fr auto", alignItems: "center", gap: "0.75rem", outline: "none" }}
          >
            <div
              title={b.label}
              style={{
                fontSize: "0.78rem",
                color: isActive ? "#0f172a" : "#475569",
                fontWeight: isActive ? 600 : 400,
                textAlign: "right",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {b.label}
            </div>
            {/* Track: fully rounded, a background pill. Fill: rounded only
                at its data end (right), square at the baseline (left). */}
            <div style={{ background: "#f1f5f9", borderRadius: 4, height: 16 }}>
              <div
                style={{
                  width: `${Math.max((b.value / max) * 100, 2)}%`,
                  height: "100%",
                  background: color,
                  borderRadius: "0 4px 4px 0",
                  opacity: isActive ? 1 : 0.85,
                  transition: "opacity 0.1s ease, width 0.15s ease",
                }}
              />
            </div>
            {/* Direct label at the tip — always visible, not a hover-only
                tooltip, per marks-and-anatomy.md ("Bars -> value at the
                tip"). tabular-nums since this column must align. */}
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#0f172a",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatValue(b.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
