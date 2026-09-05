// Local frontend auth provider — self-hosted username/password auth.
// Used when VITE_AUTH_PROVIDER=local.
//
// Stores the JWT in localStorage, calls POST /auth/login on the API, and
// provides a simple login form. No external auth service involved.

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AuthContext, type AuthContextValue, useAuth as useLocalAuth } from "./context";

const API_URL = import.meta.env.VITE_API_URL as string;
const TOKEN_KEY = "ps_auth_token";

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Wraps the app in the local auth provider. */
export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [fullName, setFullName] = useState<string | null>(null);

  const getToken = useCallback(async () => token, [token]);

  const signOut = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setFullName(null);
  }, []);

  // When a token exists, fetch /me to get the user's display name.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = await res.json();
          setFullName(body.identity?.fullName ?? null);
        } else {
          // Token is invalid/expired — clear it.
          signOut();
        }
      } catch {
        // API unreachable — keep the token, show the app anyway.
      }
    })();
  }, [token, signOut]);

  const value: AuthContextValue = {
    isSignedIn: !!token,
    getToken,
    signOut,
    user: fullName ? { fullName } : null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Local username/password login form. */
export function LocalSignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Login failed (${res.status}).`);
        return;
      }
      setStoredToken(body.token);
      window.location.reload();
    } catch {
      setError("Couldn't reach the API. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "3rem" }}>
      <img src="/logo-stacked.png" alt="Perfect Solutions" style={{ width: 160, marginBottom: "1.5rem" }} />
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          width: 280,
          padding: "1.5rem",
          background: "white",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Sign in</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            padding: "0.6rem 0.75rem",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            fontSize: "0.9rem",
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            padding: "0.6rem 0.75rem",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            fontSize: "0.9rem",
          }}
        />
        {error && <div style={{ color: "#b91c1c", fontSize: "0.8rem" }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: 8,
            border: "none",
            background: "#1e293b",
            color: "white",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/** Local user button for the sidebar — shows name + sign-out. */
export function LocalUserButton({ fullName }: { fullName: string | null }) {
  const { signOut } = useLocalAuth();
  return (
    <button
      onClick={signOut}
      title="Sign out"
      style={{
        background: "transparent",
        border: "none",
        color: "#cbd5e1",
        fontSize: "0.8rem",
        cursor: "pointer",
        padding: "0.25rem 0.5rem",
        borderRadius: 6,
      }}
    >
      {fullName ?? "Sign out"} →
    </button>
  );
}

/** Local signed-in/signed-out gate. */
export function LocalGate({ children }: { children: ReactNode }) {
  const { isSignedIn } = useLocalAuth();
  return isSignedIn ? <>{children}</> : <LocalSignInScreen />;
}