// Frontend auth factory — picks the auth provider based on VITE_AUTH_PROVIDER.
//
//   VITE_AUTH_PROVIDER=clerk (default) — Clerk's hosted auth
//   VITE_AUTH_PROVIDER=local        — self-hosted username/password auth
//
// Components import from "./auth" (this file) and never touch a provider's
// SDK directly, so swapping providers is a rebuild-time env change, not a
// code change across every screen.

import type { ReactNode } from "react";
import { AUTH_PROVIDER, useAuth } from "./context";
import { ClerkAuthProvider, ClerkGate, ClerkUserButton } from "./clerk";
import { LocalAuthProvider, LocalGate, LocalUserButton } from "./local";

/** Wraps the whole app in the active auth provider (used by main.tsx). */
export function AuthProvider({ children }: { children: ReactNode }) {
  return AUTH_PROVIDER === "local" ? (
    <LocalAuthProvider>{children}</LocalAuthProvider>
  ) : (
    <ClerkAuthProvider>{children}</ClerkAuthProvider>
  );
}

/** Shows the sign-in screen when signed out, the app when signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  return AUTH_PROVIDER === "local" ? <LocalGate>{children}</LocalGate> : <ClerkGate>{children}</ClerkGate>;
}

/** The signed-in user's account/sign-out control for the sidebar. */
export function AuthUserButton({ fullName }: { fullName: string | null }) {
  return AUTH_PROVIDER === "local" ? <LocalUserButton fullName={fullName} /> : <ClerkUserButton />;
}

export { useAuth } from "./context";
export type { AuthContextValue, AuthUser } from "./context";