import { useEffect, useState } from "react";
import { SignedIn, SignedOut, SignIn, useAuth } from "@clerk/clerk-react";
import Sidebar from "./Sidebar";
import CustomersScreen from "./CustomersScreen";
import CustomerDetailScreen from "./CustomerDetailScreen";
import NewCustomerScreen from "./NewCustomerScreen";
import OverviewScreen from "./OverviewScreen";
import type { Customer, DashboardKpis, Identity, PipelineData } from "./types";

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
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeScreen, setActiveScreen] = useState("overview");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Pulled out of the initial-load effect below so "New customer" can
  // re-run just this fetch afterwards, without re-fetching /me or
  // /dashboard/overview along with it.
  async function loadCustomers() {
    const token = await getToken();
    const res = await fetch(`${API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A failed /customers call used to silently render as "No customers
      // yet." instead of surfacing the error — found by running the real
      // query against the seeded schema. Fixed by checking .ok here
      // instead of assuming success.
      setError(body.error ?? body.message ?? `Server said: ${res.status}`);
      return;
    }
    setCustomers(body.customers ?? []);
  }

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
        const [, overviewRes] = await Promise.all([loadCustomers(), fetch(`${API_URL}/dashboard/overview`, { headers })]);

        const overviewBody = await overviewRes.json().catch(() => ({}));
        if (!overviewRes.ok) {
          setError(overviewBody.error ?? overviewBody.message ?? `Server said: ${overviewRes.status}`);
          return;
        }
        setKpis(overviewBody.kpis ?? null);
        setPipeline(overviewBody.pipeline ?? null);
      } catch {
        setError("Couldn't reach the API. Is it deployed and is VITE_API_URL set correctly?");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  return (
    // fontFamily inherits from body (apps/web/src/index.css) — IBM Plex
    // Sans, Perfect Solutions' real brand font, not the system-ui default
    // this used to hardcode here.
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <Sidebar
        active={activeScreen}
        onNavigate={(screen) => {
          // Switching screens from the sidebar always leaves customer-detail
          // or new-customer view — otherwise clicking "Customers" again
          // while one of those is open would just re-render it underneath.
          setSelectedCustomerId(null);
          setCreatingCustomer(false);
          setActiveScreen(screen);
        }}
        identity={identity}
      />

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

        {!error && (customers === null || kpis === null || pipeline === null) && (
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Loading…</p>
        )}

        {!error && customers !== null && kpis !== null && pipeline !== null && activeScreen === "overview" && (
          <OverviewScreen kpis={kpis} pipeline={pipeline} />
        )}

        {!error && customers !== null && kpis !== null && activeScreen === "customers" && selectedCustomerId === null && !creatingCustomer && (
          <CustomersScreen customers={customers} onSelect={setSelectedCustomerId} onNew={() => setCreatingCustomer(true)} />
        )}

        {!error && activeScreen === "customers" && creatingCustomer && (
          <NewCustomerScreen
            identity={identity}
            onBack={() => setCreatingCustomer(false)}
            onCreated={async (id) => {
              // Refresh the list (the new row belongs in it from now on)
              // and jump straight into the record that was just created —
              // there's nothing useful to look at on the list screen
              // immediately after creating one entry.
              setCreatingCustomer(false);
              await loadCustomers();
              setSelectedCustomerId(id);
            }}
          />
        )}

        {!error && activeScreen === "customers" && !creatingCustomer && selectedCustomerId !== null && (
          <CustomerDetailScreen customerId={selectedCustomerId} onBack={() => setSelectedCustomerId(null)} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <SignedOut>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "3rem" }}>
          {/* Real brand asset (apps/web/public/logo-stacked.png), not text —
              this is the one screen every user sees before they're signed
              in, so it's worth actual branding rather than a plain widget. */}
          <img src="/logo-stacked.png" alt="Perfect Solutions" style={{ width: 160, marginBottom: "1.5rem" }} />
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <Shell />
      </SignedIn>
    </>
  );
}
