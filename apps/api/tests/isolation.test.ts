import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

// THE test that matters most in this whole codebase.
//
// From claude/Platform Plan - Architecture Options and Costs.md:
// "The bug that ends the company: Builder A seeing Builder B's data. Write
// an automated test that signs in as one builder and asserts it cannot read
// another's rows, run on every deploy."
//
// This test creates two builders, gives each one customer, then queries as
// builder A and asserts builder B's row never comes back — proving the
// row-level security policy in db/migrations/0001_init.sql actually works,
// not just that it was written.
//
// Requires a real Postgres reachable via DATABASE_URL with migrations
// 0001-0003 already applied. Skips (not fails) if DATABASE_URL isn't set
// locally; fails hard if that happens in CI (see the CI-only guard below).
//
// Every set_config call below uses is_local=true (the third argument) and
// runs inside an explicit begin/commit around the query that follows it —
// mirroring apps/api/src/auth/provider.ts's withTenantClient() exactly. That pairing
// matters: set_config(..., true) only lasts for the current transaction,
// and a bare client.query() call is its own auto-committed transaction, so
// without the explicit begin/commit the setting reverts before the next
// query ever sees it. First real run of this suite (see
// claude/Platform Repo - Git Setup and Deploy Plan.md) caught exactly that
// bug in withTenantClient — every request was silently querying with no
// tenant scope at all, for every identity, and it had gone unnoticed only
// because the database was still empty at the time.

const { Pool } = pg;
const hasDb = Boolean(process.env.DATABASE_URL);

// describe.skipIf below is deliberate for local dev without a Postgres
// running — but a *skipped* suite still exits 0, which is indistinguishable
// from a passing one on GitHub's checks page. That gap is exactly what
// Launch Guardrails - Builder Isolation and Pre-Launch Standards.md warns
// about wiring this into CI to close, so in CI specifically (GitHub Actions
// sets CI=true) a missing DATABASE_URL is a hard failure, not a silent skip:
// the workflow (.github/workflows/ci.yml) always provides one, so this can
// only fire if that workflow itself regresses.
if (!hasDb && process.env.CI) {
  throw new Error(
    "DATABASE_URL is not set in CI — the tenant-isolation suite would silently " +
      "skip instead of running, which is worse than not having this test at all. " +
      "Check .github/workflows/ci.yml's postgres service and migration step."
  );
}

async function inTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    try {
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    }
  } finally {
    client.release();
  }
}

describe.skipIf(!hasDb)("tenant isolation", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let builderAId: string;
  let builderBId: string;

  beforeAll(async () => {
    // Seeding test rows is itself a cross-tenant write, same as any staff
    // operation — it needs the staff bypass. Since 0003_force_rls.sql, this
    // is not optional: even the table-owning role (what DATABASE_URL
    // connects as) is subject to the policy once FORCE is on.
    await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.is_staff', 'true', true)");

      const a = await client.query("insert into builders (name) values ($1) returning id", [
        "Test Builder A",
      ]);
      const b = await client.query("insert into builders (name) values ($1) returning id", [
        "Test Builder B",
      ]);
      builderAId = a.rows[0].id;
      builderBId = b.rows[0].id;

      await client.query("insert into customers (builder_id, full_name) values ($1, $2)", [
        builderAId,
        "Customer belonging to A",
      ]);
      await client.query("insert into customers (builder_id, full_name) values ($1, $2)", [
        builderBId,
        "Customer belonging to B",
      ]);
    });
  });

  afterAll(async () => {
    // Deleting the builders cascades into customers (on delete cascade),
    // which is itself an RLS-checked write under FORCE — needs the same
    // staff bypass as the setup above.
    await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.is_staff', 'true', true)");
      await client.query("delete from builders where id in ($1, $2)", [builderAId, builderBId]);
    });
    await pool.end();
  });

  it("builder A cannot see builder B's customers", async () => {
    const rows = await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
      const result = await client.query("select full_name, builder_id from customers");
      return result.rows;
    });

    const names = rows.map((r) => r.full_name);
    expect(names).toContain("Customer belonging to A");
    expect(names).not.toContain("Customer belonging to B");
    expect(rows.every((r) => r.builder_id === builderAId)).toBe(true);
  });

  it("a query with no current_builder_id set sees nothing, not everything", async () => {
    const rows = await inTransaction(pool, async (client) => {
      const result = await client.query("select * from customers");
      return result.rows;
    });
    expect(rows.length).toBe(0);
  });

  it("a staff login sees every builder's customers", async () => {
    const rows = await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.is_staff', 'true', true)");
      const result = await client.query("select full_name from customers");
      return result.rows;
    });
    const names = rows.map((r) => r.full_name);
    expect(names).toContain("Customer belonging to A");
    expect(names).toContain("Customer belonging to B");
  });
});
