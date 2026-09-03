import { UserButton } from "@clerk/clerk-react";
import type { Identity } from "./types";

// Small inline icons — no icon library dependency for a sidebar this size,
// and no emoji per house style. Each is a plain 18x18 stroke icon.
function Icon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  customers: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  builders: "M3 21h18 M6 21V8l6-4 6 4v13 M10 21v-6h4v6",
  projects: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  recovery: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  staff: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8l2 2-2 2",
};

type NavItemDef = {
  key: string;
  label: string;
  icon: keyof typeof ICONS;
  enabled: boolean;
};

const NAV_ITEMS: NavItemDef[] = [
  { key: "customers", label: "Customers", icon: "customers", enabled: true },
  { key: "builders", label: "Builders", icon: "builders", enabled: false },
  { key: "projects", label: "Projects", icon: "projects", enabled: false },
  { key: "recovery", label: "Recovery", icon: "recovery", enabled: false },
  { key: "staff", label: "Staff", icon: "staff", enabled: false },
];

export default function Sidebar({
  active,
  onNavigate,
  identity,
}: {
  active: string;
  onNavigate: (key: string) => void;
  identity: Identity | null;
}) {
  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        background: "#0f172a",
        color: "#cbd5e1",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#2563eb",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "0.9rem",
              flexShrink: 0,
            }}
          >
            PS
          </div>
          <div>
            <div style={{ color: "white", fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.2 }}>
              Perfect Solutions
            </div>
            <div style={{ color: "#64748b", fontSize: "0.7rem" }}>Financial Distribution Platform</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              onClick={() => item.enabled && onNavigate(item.key)}
              disabled={!item.enabled}
              title={item.enabled ? undefined : "Coming soon"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: 8,
                border: "none",
                background: isActive ? "#1e293b" : "transparent",
                color: item.enabled ? (isActive ? "white" : "#cbd5e1") : "#475569",
                fontSize: "0.875rem",
                fontWeight: isActive ? 600 : 500,
                textAlign: "left",
                cursor: item.enabled ? "pointer" : "default",
              }}
            >
              <Icon path={ICONS[item.icon]} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {!item.enabled && (
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
            </button>
          );
        })}
      </nav>

      <div
        style={{
          padding: "0.9rem 1.1rem",
          borderTop: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          gap: "0.65rem",
        }}
      >
        <UserButton />
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
      </div>
    </div>
  );
}
