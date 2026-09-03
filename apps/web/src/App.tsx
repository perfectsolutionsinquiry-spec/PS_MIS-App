import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignIn, useAuth, UserButton } from "@clerk/clerk-react";

// This app only ever displays what the API sends back. It never decides who
// can see what, and never computes a number itself — see
// claude/Platform Plan - Architecture Options and Costs.md and the "keep
// business logic on the server" rule from conversation. The API
// (apps/api/src/index.ts) is the only place that check happens.

const API_URL = import.meta.env.VITE_API_URL as string;

type Identity =
  | { kind: "staff"; staffId: string; fullName: string | null; role: string }
  | { kind: "builder"; builderUserId: string; builderId: string; fullName: string | null; role: string };

type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  stage: string | null;
  created_at: string;
};

function Dashboard() {
  const { getToken } = useAuth();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };

        const meRes = await fetch(`${API_URL}/me`, { headers });
        if (!meRes.ok) {
          const body = await meRes.json().catch(() => ({}));
          setError(body.error ?? `Server said: ${meRes.status}`);
          return;
        }
        const me = await meRes.json();
        setIdentity(me.identity);

        const customersRes = await fetch(`${API_URL}/customers`, { headers });
        const customersBody = await customersRes.json();
        setCustomers(customersBody.customers ?? []);
      } catch {
        setError("Couldn't reach the API. Is it deployed and is VITE_API_URL set correctly?");
      }
    })();
  }, [getToken]);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "1.25rem" }}>Perfect Solutions</h1>
        <UserButton />
      </div>

      {error && (
        <p style={{ color: "#b91c1c", background: "#fef2f2", padding: "0.75rem", borderRadius: 6 }}>{error}</p>
      )}

      {identity && (
        <p style={{ color: "#555" }}>
          Signed in as <strong>{identity.fullName ?? "(no name set)"}</strong> —{" "}
          {identity.kind === "staff" ? "Perfect Solutions staff (sees every builder)" : `builder account, role: ${identity.role}`}
        </p>
      )}

      <h2 style={{ fontSize: "1rem", marginTop: "2rem" }}>Customers</h2>
      {customers === null && !error && <p>Loading…</p>}
      {customers?.length === 0 && <p style={{ color: "#777" }}>No customers yet.</p>}
      {customers && customers.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Name</th>
              <th>Phone</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{c.full_name}</td>
                <td>{c.phone ?? "—"}</td>
                <td>{c.stage ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function App() {
  return (
    <>
      <SignedOut>
        <div style={{ display: "flex", justifyContent: "center", marginTop: "4rem" }}>
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}
