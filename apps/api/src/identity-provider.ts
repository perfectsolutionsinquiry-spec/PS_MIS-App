import { verifyToken } from "@clerk/backend";

export type VerifiedIdentity = {
  userId: string;
};

export interface IdentityProvider {
  verifySession(token: string): Promise<VerifiedIdentity>;
}

// Clerk is the current adapter. The rest of the API consumes only the
// provider-neutral verification result above.
export function createClerkIdentityProvider(secretKey: string): IdentityProvider {
  return {
    async verifySession(token) {
      const verified = await verifyToken(token, { secretKey });
      return { userId: verified.sub };
    },
  };
}
