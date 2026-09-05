// Auth factory — picks the auth provider based on AUTH_PROVIDER env var.
// This is the only place that knows about provider implementations.

import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import type { AuthProvider } from "./provider.js";
import { makeRequireAuth } from "./provider.js";
import { ClerkAuthProvider } from "./clerk.js";
import { LocalAuthProvider, localLoginRoute, localSetPasswordRoute } from "./local.js";

let _provider: AuthProvider | null = null;

export function getProvider(): AuthProvider {
  if (!_provider) {
    switch (config.authProvider) {
      case "clerk":
        _provider = new ClerkAuthProvider();
        break;
      case "local":
        _provider = new LocalAuthProvider();
        break;
      default:
        throw new Error(`Unknown AUTH_PROVIDER: ${config.authProvider}`);
    }
  }
  return _provider;
}

/** The Fastify preHandler hook every protected route uses. */
export function requireAuth() {
  return makeRequireAuth(getProvider());
}

/**
 * Register auth-provider-specific routes (e.g. /auth/login for local auth).
 * Called once at server startup.
 */
export function registerAuthRoutes(app: FastifyInstance): void {
  if (config.authProvider === "local") {
    app.post("/auth/login", localLoginRoute);
    app.post("/auth/set-password", { preHandler: requireAuth() }, localSetPasswordRoute);
  }
}