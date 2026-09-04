import pg from "pg";

const { Pool } = pg;

export type DatabaseProvider = Pick<pg.Pool, "query" | "connect">;

// PostgreSQL is the current adapter. Application code depends on the small
// query/connect surface instead of constructing a vendor pool itself.
export function createPostgresDatabaseProvider(connectionString: string): DatabaseProvider {
  return new Pool({ connectionString, max: 5 });
}
