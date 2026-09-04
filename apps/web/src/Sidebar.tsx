import { useState } from "react";
import { UserButton } from "@clerk/clerk-react";
import { Button } from "react-aria-components";
import type { Identity } from "./types";
import { PS_COLORS } from "./theme";

// Small inline icons — no icon library dependency for a sidebar this size,
// and no emoji per house style. Each is a plain stroke icon; several paths
// joined with separate "M" commands inside one <path d> is valid SVG and
// keeps this file free of any new dependency.
function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  actions:     "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  overview:    "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z",
  customer360: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20a7.5 7.5 0 0 1 15 0",
  reliability: "M3 12h4l2 7 4-14 2 7h6",
  forecast:    "M3 17l6-6 4 4 8-8 M15 7h6v6",
  customers:   "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  collections: "M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2h-4a3 3 0 0 0 0 6h4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z",
  documents:   "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6M9 17h4",
  settings:    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  menu:        "M3 6h18 M3 12h18 M3 18h18",
};

type NavEntry =
  | { kind: "group"; label: string }
  | { kind: "item"; key: string; label: string; icon: keyof typeof ICONS; enabled: boolean };

// This shape (Action Items above two named groups, Settings pinned below
// them) matches the nav rail of the existing single-file MIS tool this
// platform is replacing — see archive/html-tool. Only Overview and
// Customers are wired to a real screen so far; the rest render, disabled,
// so the intended shape is visible without pretending they exist yet. This
// deliberately replaces the earlier Builders/Projects/Recovery/Staff draft
// nav (still visible in git history) now that a concrete look-and-feel
// target exists to build toward instead.
const NAV_ITEMS: NavEntry[] = [
  { kind: "item", key: "actions", label: "Action Items", icon: "actions", enabled: false },
  { kind: "group", label: "Dashboard" },
  { kind: "item", key: "overview", label: "Overview", icon: "overview", enabled: true },
  { kind: "item", key: "customer360", label: "Customer 360", icon: "customer360", enabled: false },
  { kind: "item", key: "reliability", label: "Reliability", icon: "reliability", enabled: false },
  { kind: "item", key: "forecast", label: "Forecast", icon: "forecast", enabled: false },
  { kind: "group", label: "Records" },
  { kind: "item", key: "customers", label: "Customers", icon: "customers", enabled: true },
  { kind: "item", key: "collections", label: "Collections", icon: "collections", enabled: false },
  { kind: "item", key: "documents", label: "Documents", icon: "documents", enabled: false },
];

function NavButton({
  label, icon, enabled, isActive, collapsed, onClick,
}: {
  label: string; icon: keyof typeof ICONS; enabled: boolean; isActive: boolean; collapsed: boolean; onClick: () => void;
}) {
  return (
    <Button
      onClick={() => enabled && onClick()}
      isDisabled={!enabled}
      aria-label={collapsed ? label : enabled ? label : `${label} — coming soon`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: "0.65rem",
        width: "100%",
        padding: collapsed ? "0.55rem" : "0.55rem 0.75rem",
        borderRadius: 8,
        border: "none",
        background: isActive ? "#1e293b" : "transparent",
        color: enabled ? (isActive ? "white" : "#cbd5e1") : "#475569",
        fontSize: "0.875rem",
        fontWeight: isActive ? 600 : 500,
        textAlign: "left",
        cursor: enabled ? "pointer" : "default",
      }}
    >
      <Icon path={ICONS[icon]} />
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && !enabled && (
        <span
          style={{
            fontSize: "0.6rem",
            color: "#475569",
            border: "1px solid #334155",
            borderRadius: 999,
            padding: "0.1rem 0.4rem",
          }}
        >
          soon
        </span>
      )}
    </Button>
  );
}

export default function Sidebar({
  active,
  onNavigate,
  identity,
}: {
  active: string;
  onNavigate: (key: string) => void;
  identity: Identity | null;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        width: collapsed ? 68 : 232,
        flexShrink: 0,
        background: PS_COLORS.nearBlackNavy,
        color: PS_COLORS.reversedText,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        transition: "width 0.15s ease",
      }}
    >
      <div style={{ padding: collapsed ? "1.1rem 0" : "1.25rem 1.25rem 1rem", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: "0.6rem" }}>
          {/* Real brand mark (apps/web/public/favicon.png) — replaces the
              placeholder "PS" initials box this used to be. */}
          <img
            src="/favicon.png"
            alt="Perfect Solutions"
            style={{ width: 32, height: 32, flexShrink: 0, objectFit: "contain" }}
          />
          {!collapsed && (
            <div>
              <div style={{ color: "white", fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.2 }}>
                Perfect Solutions
              </div>
              <div style={{ color: "#64748b", fontSize: "0.7rem" }}>Financial Distribution Platform</div>
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand" : "Collapse"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: "0.6rem",
          margin: "0.6rem 0.75rem 0",
          padding: "0.4rem 0.6rem",
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: "#64748b",
          fontSize: "0.68rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        <Icon path={ICONS.menu} size={16} />
        {!collapsed && "Collapse"}
      </Button>

      <nav style={{ flex: 1, overflowY: "auto", padding: "0.6rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        {NAV_ITEMS.map((entry, i) =>
          entry.kind === "group" ? (
            collapsed ? (
              <div key={i} style={{ height: 1, background: "#1e293b", margin: "0.5rem 0.2rem" }} />
            ) : (
              <div
                key={i}
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#475569",
                  padding: "0.9rem 0.75rem 0.3rem",
                }}
              >
                {entry.label}
              </div>
            )
          ) : (
            <NavButton
              key={entry.key}
              label={entry.label}
              icon={entry.icon}
              enabled={entry.enabled}
              isActive={entry.key === active}
              collapsed={collapsed}
              onClick={() => onNavigate(entry.key)}
            />
          )
        )}
      </nav>

      <div style={{ padding: "0.6rem 0.75rem", borderTop: "1px solid #1e293b" }}>
        <NavButton label="Settings" icon="settings" enabled={false} isActive={false} collapsed={collapsed} onClick={() => {}} />
      </div>

      <div
        style={{
          padding: collapsed ? "0.9rem 0" : "0.9rem 1.1rem",
          borderTop: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: "0.65rem",
        }}
      >
        <UserButton />
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "white",
                fontSize: "0.8rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {identity?.fullName ?? "…"}
            </div>
            <div style={{ color: "#64748b", fontSize: "0.7rem" }}>
              {identity?.kind === "staff" ? `Staff · ${identity.role}` : identity?.kind === "builder" ? `Builder · ${identity.role}` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
