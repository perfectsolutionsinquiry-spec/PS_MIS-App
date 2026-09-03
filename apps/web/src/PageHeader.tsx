// All-caps title + top-right icon buttons, used at the top of every screen
// so they share one look. The icon buttons (email a report, export) are
// deliberately disabled rather than wired to a fake action — same "soon"
// treatment as an unbuilt nav item in Sidebar.tsx, so nothing here pretends
// to work that doesn't yet.

function ActionIcon({ path, title }: { path: string; title: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${title} — coming soon`}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8",
        cursor: "default",
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  );
}

const MAIL_PATH = "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3.5 6.5l8.5 6 8.5-6";
const EXPORT_PATH = "M12 3v13 M7.5 8.5L12 4l4.5 4.5 M4 21h16";

export default function PageHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", gap: "1rem" }}>
      <h1
        style={{
          fontSize: "0.95rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#0f172a",
          margin: 0,
        }}
      >
        {title}
      </h1>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <ActionIcon path={MAIL_PATH} title="Email report" />
        <ActionIcon path={EXPORT_PATH} title="Export" />
      </div>
    </div>
  );
}
