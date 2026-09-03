import { useState } from "react";

export type DonutSegment = { label: string; count: number; pct: number; color: string };

// Hand-rolled SVG, not a charting library — no new dependency to install
// blind with no local Node to verify it (see CLAUDE.md). Same technique the
// old single-file MIS tool used (archive/html-tool, src/charts.js).
//
// Colors: the dataviz skill's validated categorical palette, slots 1–3
// (blue/orange/aqua) plus a neutral gray "Other" bucket — run through
// scripts/validate_palette.js against this app's actual white card surface
// (not the skill's default off-white) with --pairs all, since every donut
// segment is a mutual neighbor including the wrap-around pair. Result: all
// checks pass; the aqua slot and the gray bucket both sit below 3:1
// contrast on white, which the skill's "relief" rule requires be covered by
// visible direct labels — the legend below is exactly that, always
// rendered, never hover-only.
export default function DonutChart({
  segments, centerValue, centerLabel,
}: {
  segments: DonutSegment[]; centerValue: string; centerLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (segments.length === 0) {
    return <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", padding: "2.5rem 0" }}>No data yet.</div>;
  }

  const size = 176;
  const strokeWidth = 26;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gapDeg = 3; // surface-color gap between segments, incl. the wrap-around pair

  let cursor = 0; // degrees; the wrapping <g> rotate(-90) makes 0 = 12 o'clock

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          {segments.map((seg, i) => {
            const frac = Math.max(0, seg.pct) / 100;
            const arcDeg = Math.max(0, frac * 360 - gapDeg);
            const dash = (arcDeg / 360) * circumference;
            const rotation = cursor;
            cursor += frac * 360;
            const isActive = active === i;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={isActive ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                transform={`rotate(${rotation} ${cx} ${cy})`}
                style={{ transition: "stroke-width 0.1s ease", cursor: "pointer" }}
                tabIndex={0}
                role="img"
                aria-label={`${seg.label}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            );
          })}
        </g>
        {/* Labels use text tokens, never a segment's own color — see
            marks-and-anatomy.md's "text never wears the data color". */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="19" fontWeight="700" fill="#0f172a">
          {centerValue}
        </text>
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize="10.5" fill="#94a3b8">
          {centerLabel}
        </text>
      </svg>

      {/* Always-visible legend — the relief this palette's WARN-band
          contrast checks require, and identity is never color-alone. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 1rem", justifyContent: "center" }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.78rem",
              color: active === i ? "#0f172a" : "#475569",
              fontWeight: active === i ? 600 : 400,
              cursor: "default",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 999, background: seg.color, flexShrink: 0 }} />
            {seg.label} · {seg.count} · {seg.pct.toFixed(1)}%
          </div>
        ))}
      </div>
    </div>
  );
}
