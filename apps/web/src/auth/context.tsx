// Frontend auth abstraction — the single seam between the UI and whatever
// auth provider is active.
//
// Two implementations exist:
//   - clerk.tsx — Clerk's hosted auth (cloud)
//   - local.tsx — self-hosted username/password auth
//
// The active provider is chosen by VITE_AUTH_PROVIDER:
//   "clerk" (default) — uses Clerk's <SignIn/> and <UserButton/>
//   "local"           — uses our own login form and token storage
//
// Components use useAuth() to get:
//   - getToken(): Promise<string | null> — a Bearer token for API calls
//   - isSignedIn: boolean
//   - signOut(): void
//   - user: { fullName: string | null } | null

import { createContext, useContext } from "react";

export interface AuthUser {
  fullName: string | null;
}

export interface AuthContextValue {
  /** True when the user has a valid session. */
  isSignedIn: boolean;
  /** Get a Bearer token for API calls. Returns null when signed out. */
  getToken: () => Promise<string | null>;
  /** Sign the user out. */
  signOut: () => void;
  /** The signed-in user's display name, if known. */
  user: AuthUser | null;
}

export const AuthContext = createContext<AuthContextValue>({
  isSignedIn: false,
  getToken: async () => null,
  signOut: () => {},
  user: null,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/** The auth provider type, read from VITE_AUTH_PROVIDER at build time. */
export const AUTH_PROVIDER = (import.meta.env.VITE_AUTH_PROVIDER ?? "clerk") as "clerk" | "local";