import pg from "pg";

const { Pool } = pg;

// A single shared connection pool. If DATABASE_URL isn't set yet (e.g. the very
// first deploy, before a real Postgres instance is wired up), `pool` stays null
// and callers must handle that — the API should still boot and answer /health.
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;

export async function dbPing(): Promise<{ ok: boolean; detail: string }> {
  if (!pool) {
    return { ok: false, detail: "DATABASE_URL is not set — running without a database." };
  }
  try {
    const result = await pool.query("select now() as now");
    return { ok: true, detail: `connected, server time ${result.rows[0].now}` };
  } catch (err) {
    return { ok: false, detail: `connection failed: ${(err as Error).message}` };
  }
}
