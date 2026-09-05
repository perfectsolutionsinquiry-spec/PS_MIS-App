// Clerk frontend auth provider — wraps Clerk's React SDK in our AuthContext.
// Used when VITE_AUTH_PROVIDER=clerk (the default).

import type { ReactNode } from "react";
import {
  ClerkProvider as ClerkProviderBase,
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
  useAuth as useClerkAuth,
} from "@clerk/clerk-react";
import { AuthContext, type AuthContextValue } from "./context";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

/** Wraps the app in Clerk's provider and bridges it to our AuthContext. */
export function ClerkAuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        Missing VITE_CLERK_PUBLISHABLE_KEY — set it in the environment and rebuild.
      </div>
    );
  }

  return (
    <ClerkProviderBase
      publishableKey={publishableKey}
      // Clerk's prebuilt <SignIn/> and the account/UserButton portal
      // default to Clerk's own generic serif/sans pair — not this app's
      // brand fonts. This is the one place that applies to every
      // Clerk-rendered surface at once.
      appearance={{ variables: { fontFamily: "var(--font-sans)" } }}
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProviderBase>
  );
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken, signOut, user } = useClerkAuth();

  const value: AuthContextValue = {
    isSignedIn: !!isSignedIn,
    getToken: async () => (await getToken()) ?? null,
    signOut: () => void signOut(),
    user: user ? { fullName: user.fullName ?? null } : null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Clerk's prebuilt sign-in screen. */
export function ClerkSignInScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "3rem" }}>
      <img src="/logo-stacked.png" alt="Perfect Solutions" style={{ width: 160, marginBottom: "1.5rem" }} />
      <SignIn />
    </div>
  );
}

/** Clerk's user button for the sidebar. */
export function ClerkUserButton() {
  return <UserButton />;
}

/** Clerk's signed-in/signed-out gate. */
export function ClerkGate({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedOut>
        <ClerkSignInScreen />
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </>
  );
}