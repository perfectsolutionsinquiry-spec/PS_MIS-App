import { createPostgresDatabaseProvider, type DatabaseProvider } from "./database-provider.js";

// A single shared database provider. If DATABASE_URL isn't set yet (e.g. the
// very first deploy, before a real Postgres instance is wired up), `database`
// stays null
// and callers must handle that — the API should still boot and answer /health.
export const database: DatabaseProvider | null = process.env.DATABASE_URL
  ? createPostgresDatabaseProvider(process.env.DATABASE_URL)
  : null;

export async function dbPing(): Promise<{ ok: boolean; detail: string }> {
  if (!database) {
    return { ok: false, detail: "DATABASE_URL is not set — running without a database." };
  }
  try {
    const result = await database.query("select now() as now");
    return { ok: true, detail: `connected, server time ${result.rows[0].now}` };
  } catch (err) {
    return { ok: false, detail: `connection failed: ${(err as Error).message}` };
  }
}
