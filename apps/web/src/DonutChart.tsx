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

  // r was previously derived as (size - strokeWidth) / 2, which put the
  // ring's outer edge at EXACTLY size/2 — zero margin against the SVG's own
  // boundary. An SVG root clips to its viewBox by default, so anything at
  // that edge (ordinary anti-aliasing, and definitely the hover state below)
  // got flattened off — the "cut" visible at the ring's left/right tangent
  // points. r is now independent of strokeWidth, sized with real clearance
  // for the widest state (hover + explode offset) plus headroom.
  const size = 180;
  const strokeWidth = 22;
  const hoverStrokeWidth = 26;
  const r = 64;
  const explodeDist = 7; // px the hovered segment's whole arc shifts outward
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gapDeg = 3; // surface-color gap between segments, incl. the wrap-around pair

  let cursor = 0; // degrees; the wrapping <g> rotate(-90) makes 0 = 12 o'clock

  // Precompute each arc's geometry up front — the tooltip needs the same
  // midpoint-angle math the segment circles use, so it's done once here
  // rather than re-derived twice.
  const arcs = segments.map((seg, i) => {
    const frac = Math.max(0, seg.pct) / 100;
    const startDeg = cursor;
    const arcDeg = Math.max(0, frac * 360 - gapDeg);
    cursor += frac * 360;

    // A plain (un-rotated) SVG circle's path starts at its local 3-o'clock
    // point (angle 0) and sweeps clockwise — so this arc's own midpoint,
    // *before* the rotate(startDeg) transform below is applied, sits at
    // local angle (arcDeg / 2). Displacing the circle's center along that
    // local direction, then letting the same rotate() transform carry the
    // whole displaced circle to its real position, is what makes the
    // "explode" offset land in the correct final outward direction without
    // hand-computing the post-rotation angle separately.
    const localMidRad = ((arcDeg / 2) * Math.PI) / 180;
    const dx = Math.cos(localMidRad);
    const dy = Math.sin(localMidRad);

    // For the tooltip's on-screen position: same midpoint, but in the
    // *final* frame — this segment's own rotate(startDeg) composed with the
    // wrapping <g>'s rotate(-90), both around the same center, sum to a
    // single rotation of (startDeg - 90).
    const finalMidRad = ((startDeg + arcDeg / 2 - 90) * Math.PI) / 180;

    return { seg, i, startDeg, arcDeg, dx, dy, finalMidRad };
  });

  const activeArc = active !== null ? arcs[active] : null;

  // Tooltip position: just outside the ring at the hovered segment's real
  // midpoint angle, as a percentage of the SVG's own box so it tracks
  // correctly regardless of the card's actual rendered width.
  const tooltipRadius = r + hoverStrokeWidth / 2 + explodeDist + 10;
  const tooltipPos = activeArc
    ? {
        leftPct: ((cx + tooltipRadius * Math.cos(activeArc.finalMidRad)) / size) * 100,
        topPct: ((cy + tooltipRadius * Math.sin(activeArc.finalMidRad)) / size) * 100,
      }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <div style={{ position: "relative", width: size, maxWidth: "100%" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible", display: "block", margin: "0 auto" }}>
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
            {arcs.map(({ seg, i, startDeg, arcDeg, dx, dy }) => {
              const dash = (arcDeg / 360) * circumference;
              const isActive = active === i;
              const segCx = isActive ? cx + dx * explodeDist : cx;
              const segCy = isActive ? cy + dy * explodeDist : cy;
              return (
                <circle
                  key={i}
                  cx={segCx}
                  cy={segCy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={isActive ? hoverStrokeWidth : strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  transform={`rotate(${startDeg} ${cx} ${cy})`}
                  style={{ transition: "cx 0.12s ease, cy 0.12s ease, stroke-width 0.12s ease", cursor: "pointer" }}
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

        {/* Tooltip: value leads, label follows — same hierarchy as the
            other charts' hover reads. Anchored to the hovered segment's
            own position, not just left to the always-visible legend below,
            per direct feedback that a legend alone isn't the same as
            seeing the number where you're actually pointing. */}
        {activeArc && tooltipPos && (
          <div
            style={{
              position: "absolute",
              left: `${tooltipPos.leftPct}%`,
              top: `${tooltipPos.topPct}%`,
              transform: "translate(-50%, -50%)",
              background: "#0f172a",
              color: "white",
              borderRadius: 6,
              padding: "0.35rem 0.6rem",
              fontSize: "0.72rem",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              zIndex: 1,
            }}
          >
            <strong>{activeArc.seg.label}</strong>
            <span style={{ color: "#94a3b8", marginLeft: "0.4rem" }}>
              {activeArc.seg.count} · {activeArc.seg.pct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

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
