// Clerk auth provider — verifies JWTs issued by Clerk's hosted auth.
// This is the default provider (AUTH_PROVIDER=clerk).
//
// The actual token verification lives in ../identity-provider.ts (the
// IdentityProvider seam); this adapter wraps it in the AuthProvider
// interface so the factory can switch providers by env var alone.

import type { AuthProvider } from "./provider.js";
import { config } from "../config.js";
import { createClerkIdentityProvider } from "../identity-provider.js";

export class ClerkAuthProvider implements AuthProvider {
  readonly name = "clerk";

  private identityProvider = config.clerkSecretKey
    ? createClerkIdentityProvider(config.clerkSecretKey)
    : null;

  async verifyToken(token: string): Promise<string | null> {
    if (!this.identityProvider) {
      throw new Error("Clerk is not configured (CLERK_SECRET_KEY missing).");
    }

    try {
      const verified = await this.identityProvider.verifySession(token);
      return verified.userId;
    } catch {
      // Invalid or expired token — an auth failure, not a server error.
      return null;
    }
  }
}