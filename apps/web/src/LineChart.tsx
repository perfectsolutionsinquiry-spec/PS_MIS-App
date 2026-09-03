import { useState } from "react";

export type LinePoint = { label: string; value: number };

// Rounds an axis max up to a "clean" number (1/2/5 × a power of ten) so
// gridlines read as 0 / 50K / 100K rather than an arbitrary max value —
// marks-and-anatomy.md: "Y-axis ticks: round to clean numbers."
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const frac = value / base;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * base;
}

// Trend over time, single series — a line, not a bar (the dataviz skill's
// own form guidance). Hand-rolled SVG, same reasoning as DonutChart/BarChart:
// no charting library to install blind with no local Node to verify it.
//
// Unlike the donut/bar (few enough marks to direct-label every one), a
// weekly series has too many points to label without becoming clutter —
// marks-and-anatomy.md is explicit that a value on every point "is chaos and
// goes unread." So this follows the line-chart-specific spec instead: only
// the endpoint is direct-labelled, gridlines and axis ticks carry the rest,
// and a hover crosshair (interaction.md: "a vertical hairline tracks the
// pointer and snaps to nearest data position") is what surfaces any other
// point's exact value on demand.
export default function LineChart({
  points, formatValue, color = "#2563eb",
}: {
  points: LinePoint[]; formatValue: (v: number) => string; color?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", padding: "2.5rem 0" }}>No data yet.</div>;
  }

  const width = 560;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 28, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const max = niceMax(Math.max(...points.map((p) => p.value), 1) * 1.15);
  const x = (i: number) => padding.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => padding.top + plotH - (v / max) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(padding.top + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(padding.top + plotH).toFixed(1)} Z`;

  // 3 gridlines: 0, half, max — enough to read the scale without crowding.
  const ticks = [0, max / 2, max];

  // X labels: showing all of them on a 560px chart with up to 12 points
  // crowds badly, so only every 3rd date is labelled — direct labels before
  // gridlines, gridlines before a second axis (marks-and-anatomy.md).
  const xLabelEvery = Math.max(1, Math.ceil(points.length / 4));

  const activePoint = active !== null ? points[active] : null;

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: `${width} / ${height}` }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setActive(null)}
        onMouseMove={(e) => {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const rel = (px - padding.left) / plotW;
          const idx = Math.round(rel * (points.length - 1));
          setActive(Math.max(0, Math.min(points.length - 1, idx)));
        }}
      >
        {/* Gridlines: hairline, solid, recessive — one step off the surface. */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={y(t)} y2={y(t)} stroke="#f1f5f9" strokeWidth="1" />
            <text x={padding.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10.5" fill="#94a3b8">
              {formatValue(t)}
            </text>
          </g>
        ))}

        {/* X-axis date labels, sparse. */}
        {points.map((p, i) =>
          i % xLabelEvery === 0 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="#94a3b8">
              {p.label}
            </text>
          ) : null
        )}

        {/* Area wash: the series hue at ~10% opacity, never a saturated block. */}
        <path d={areaPath} fill={color} fillOpacity="0.1" stroke="none" />

        {/* The line itself: 2px, round join/cap. */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Direct label at the endpoint only — "Lines -> value at the end." */}
        <text
          x={x(points.length - 1)}
          y={y(points[points.length - 1].value) - 10}
          textAnchor="end"
          fontSize="11.5"
          fontWeight="700"
          fill="#0f172a"
        >
          {formatValue(points[points.length - 1].value)}
        </text>

        {/* Crosshair: a vertical hairline snapped to the nearest point,
            plus an end-marker with a surface-color ring so it stays legible
            crossing the line. */}
        {activePoint && (
          <g>
            <line x1={x(active!)} x2={x(active!)} y1={padding.top} y2={padding.top + plotH} stroke="#cbd5e1" strokeWidth="1" />
            <circle cx={x(active!)} cy={y(activePoint.value)} r="5" fill={color} stroke="white" strokeWidth="2" />
          </g>
        )}

        {/* Hit target wider than the visible line, per interaction.md — the
            mousemove handler above already covers the full plot width, this
            is just the visible/invisible split; no extra element needed
            since the <svg> itself is the hit target for a line chart. */}
      </svg>

      {/* Tooltip: value leads (bold), label follows — the legend/label
          hierarchy inverted, because here the reader already has the
          series and wants the number. */}
      {activePoint && (
        <div
          style={{
            position: "absolute",
            left: `${(x(active!) / width) * 100}%`,
            top: 4,
            transform: "translateX(-50%)",
            background: "#0f172a",
            color: "white",
            borderRadius: 6,
            padding: "0.3rem 0.55rem",
            fontSize: "0.72rem",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          <strong>{formatValue(activePoint.value)}</strong>
          <span style={{ color: "#94a3b8", marginLeft: "0.4rem" }}>{activePoint.label}</span>
        </div>
      )}
    </div>
  );
}
