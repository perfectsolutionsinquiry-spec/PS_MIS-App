// Centralized configuration — every vendor-specific setting lives here so
// switching providers is a config change, not a code change.
//
// Supported providers:
//   AUTH_PROVIDER = "clerk" | "local"
//     clerk — verify JWTs issued by Clerk (cloud auth)
//     local — verify JWTs issued by this API itself (self-hosted auth)
//
// The database is always Postgres via DATABASE_URL — Neon, Supabase, Render,
// Railway, or a local/self-hosted Postgres all work with zero code changes.

export const config = {
  // --- Database ---
  // Any Postgres connection string. Neon, Supabase, Render, Railway, or a
  // local Postgres (Docker, system install) all work.
  databaseUrl: process.env.DATABASE_URL ?? null,

  // --- Auth ---
  // Which auth provider to use. "clerk" is the default (cloud), "local"
  // enables self-hosted username/password auth.
  authProvider: (process.env.AUTH_PROVIDER ?? "clerk") as "clerk" | "local",

  // Clerk-specific (only used when AUTH_PROVIDER=clerk)
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? null,

  // Local-auth-specific (only used when AUTH_PROVIDER=local)
  // A secret used to sign/verify our own JWTs. MUST be set when using
  // AUTH_PROVIDER=local. Generate with: openssl rand -base64 32
  localAuthSecret: process.env.LOCAL_AUTH_SECRET ?? null,
  // How long a local-auth session token stays valid (default 24h)
  localAuthTokenTtlSeconds: Number(process.env.LOCAL_AUTH_TOKEN_TTL_SECONDS ?? 86400),

  // --- Server ---
  port: Number(process.env.PORT ?? 3000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? true,
} as const;

export function requireConfig(keys: (keyof typeof config)[]): void {
  for (const key of keys) {
    const value = config[key];
    if (value === null || value === undefined || value === "") {
      throw new Error(`Missing required environment variable for ${String(key)}.`);
    }
  }
}