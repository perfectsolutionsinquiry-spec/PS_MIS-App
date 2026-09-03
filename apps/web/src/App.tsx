import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignIn, useAuth } from "@clerk/clerk-react";
import Sidebar from "./Sidebar";
import CustomersScreen from "./CustomersScreen";
import OverviewScreen from "./OverviewScreen";
import type { Customer, DashboardKpis, Identity } from "./types";

// This app only ever displays what the API sends back. It never decides who
// can see what, and never computes a number itself — see
// claude/Platform Plan - Architecture Options and Costs.md and the "keep
// business logic on the server" rule from conversation. The API
// (apps/api/src/index.ts) is the only place that check happens. Adding the
// sidebar/screens below is purely presentational — it doesn't change what
// data is fetched or how it's authorized.

const API_URL = import.meta.env.VITE_API_URL as string;

function Shell() {
  const { getToken } = useAuth();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeScreen, setActiveScreen] = useState("overview");

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

        // Both only need the token, not each other or /me's result, so they
        // run together rather than one after another.
        const [customersRes, overviewRes] = await Promise.all([
          fetch(`${API_URL}/customers`, { headers }),
          fetch(`${API_URL}/dashboard/overview`, { headers }),
        ]);

        const customersBody = await customersRes.json().catch(() => ({}));
        if (!customersRes.ok) {
          // A failed /customers call used to silently render as "No
          // customers yet." instead of surfacing the error — found by
          // running the real query against the seeded schema. Fixed by
          // checking .ok here instead of assuming success.
          setError(customersBody.error ?? customersBody.message ?? `Server said: ${customersRes.status}`);
          return;
        }
        setCustomers(customersBody.customers ?? []);

        const overviewBody = await overviewRes.json().catch(() => ({}));
        if (!overviewRes.ok) {
          setError(overviewBody.error ?? overviewBody.message ?? `Server said: ${overviewRes.status}`);
          return;
        }
        setKpis(overviewBody.kpis ?? null);
      } catch {
        setError("Couldn't reach the API. Is it deployed and is VITE_API_URL set correctly?");
      }
    })();
  }, [getToken]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <Sidebar active={activeScreen} onNavigate={setActiveScreen} identity={identity} />

      <main style={{ flex: 1, padding: "2rem 2.5rem", minWidth: 0 }}>
        {error && (
          <div
            style={{
              color: "#b91c1c",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: "0.75rem 1rem",
              borderRadius: 8,
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        {!error && (customers === null || kpis === null) && (
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Loading…</p>
        )}

        {!error && customers !== null && kpis !== null && activeScreen === "overview" && (
          <OverviewScreen kpis={kpis} />
        )}

        {!error && customers !== null && kpis !== null && activeScreen === "customers" && (
          <CustomersScreen customers={customers} />
        )}
      </main>
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
        <Shell />
      </SignedIn>
    </>
  );
}
