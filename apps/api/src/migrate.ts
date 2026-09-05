// Migration runner — applies db/migrations/*.sql in order to any Postgres.
//
// This replaces the manual "run SQL in Neon's SQL Editor" workflow. With
// this, you can point DATABASE_URL at any Postgres (Neon, Supabase, Render,
// Railway, Docker, local install) and run:
//
//   npm run migrate --workspace=apps/api
//
// It tracks applied migrations in a `schema_migrations` table, so it's safe
// to run repeatedly.
//
// Existing database that was migrated by hand (e.g. the live Neon database,
// where 0001–0004 were run via the SQL Editor)? Baseline it once so the
// runner skips what's already applied instead of failing on re-run:
//
//   MIGRATE_BASELINE_UP_TO=0004_settings_and_soft_delete.sql npm run migrate --workspace=apps/api
//
// Every migration whose filename sorts at or before that value is marked
// applied without re-running it; the rest (e.g. 0005…) run normally.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// db/migrations lives at the repo root, two levels up from apps/api/src.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../db/migrations");

export async function runMigrations(databaseUrl: string, baselineUpTo?: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    // Ensure the tracking table exists.
    await pool.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    // Baseline: mark everything up to (and including) baselineUpTo as applied.
    if (baselineUpTo) {
      for (const file of files) {
        if (file.localeCompare(baselineUpTo) > 0) break;
        await pool.query(
          "insert into schema_migrations (filename) values ($1) on conflict (filename) do nothing",
          [file]
        );
        console.log(`  baseline ${file}`);
      }
    }

    for (const file of files) {
      const alreadyApplied = await pool.query(
        "select 1 from schema_migrations where filename = $1",
        [file]
      );
      if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
        console.log(`  skip ${file} (already applied)`);
        continue;
      }

      console.log(`  apply ${file} …`);
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [file]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }

    console.log("All migrations applied.");
  } finally {
    await pool.end();
  }
}

// Run directly: npm run migrate --workspace=apps/api
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  runMigrations(url, process.env.MIGRATE_BASELINE_UP_TO).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}