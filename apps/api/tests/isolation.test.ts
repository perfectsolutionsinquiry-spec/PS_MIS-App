import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

// THE test that matters most in this whole codebase.
//
// From claude/Platform Plan - Architecture Options and Costs.md:
// "The bug that ends the company: Builder A seeing Builder B's data. Write
// an automated test that signs in as one builder and asserts it cannot read
// another's rows, run on every deploy."
//
// This test creates two builders, gives each one customer, then, acting as
// builder A, asserts builder B's rows never come back — and can never be
// changed either. Read isolation is the first test; the rest exercise every
// write path the API can produce: update of another tenant's row, delete,
// re-parenting one of A's own rows to B, inserting a row wearing B's id,
// and the API's actual INSERT...SELECT payment pattern (which must find
// zero rows, not error). This proves the row-level security policies in
// db/migrations (0001 created them, 0003 rewrote and forced them) actually
// work, not just that they were written — it is the Future-Proofing Plan's
// Phase 2 "one tenant cannot read or mutate another tenant's data" checkbox.
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

  // ── Write isolation ───────────────────────────────────────────────────
  // 0003_force_rls.sql's policy carries no FOR clause, so its USING
  // expression doubles as the WITH CHECK on INSERT and UPDATE, and it
  // applies to every command. That is what each test below leans on — the
  // first one deliberately checks the happy path too, so a 0-row result
  // can only come from the policy hiding B's row, not from a connection
  // that somehow can't write at all.

  it("builder A can update their own customer (proves writes work at all)", async () => {
    const rowCount = await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
      const result = await client.query(
        "update customers set full_name = 'Customer belonging to A' where full_name = 'Customer belonging to A'"
      );
      return result.rowCount;
    });
    expect(rowCount).toBe(1);
  });

  it("builder A cannot update builder B's customers", async () => {
    const rowCount = await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
      const result = await client.query(
        "update customers set full_name = 'Renamed by A' where full_name = 'Customer belonging to B'"
      );
      return result.rowCount;
    });
    expect(rowCount).toBe(0);
  });

  it("builder A cannot delete builder B's customers", async () => {
    const rowCount = await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
      const result = await client.query(
        "delete from customers where full_name = 'Customer belonging to B'"
      );
      return result.rowCount;
    });
    expect(rowCount).toBe(0);
  });

  it("builder A cannot re-parent one of their own customers to builder B", async () => {
    // The row itself is visible to A (it's A's), so this is decided by the
    // policy's WITH CHECK against the NEW row's builder_id — exactly the
    // guard that stops one tenant from adopting another tenant's rows.
    await expect(
      inTransaction(pool, async (client) => {
        await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
        await client.query(
          "update customers set builder_id = $1 where full_name = 'Customer belonging to A'",
          [builderBId]
        );
      })
    ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege (RLS violation)
  });

  it("builder A cannot insert a customer row wearing builder B's id", async () => {
    // INSERT with no FOR clause on the policy is checked against the same
    // USING expression — a cross-tenant builder_id on the new row is
    // rejected outright rather than silently re-scoped.
    await expect(
      inTransaction(pool, async (client) => {
        await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
        await client.query(
          "insert into customers (builder_id, full_name) values ($1, 'Smuggled into B')",
          [builderBId]
        );
      })
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("the API's INSERT...SELECT payment pattern cannot reach another builder's customer", async () => {
    // Mirrors POST /customers/:id/payments exactly (apps/api/src/index.ts):
    // builder_id and customer_id are both derived from the customer row
    // itself, so a payment aimed at another builder's customer simply finds
    // zero visible rows and inserts nothing — the route then answers 404.
    // Zero rows here is the correct outcome, not an error.
    const rowCount = await inTransaction(pool, async (client) => {
      await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
      const result = await client.query(`
        insert into recovery_transactions (builder_id, customer_id, received_on, flat_cost_received)
        select c.builder_id, c.id, current_date, 100
        from customers c
        where c.full_name = 'Customer belonging to B'
        returning id
      `);
      return result.rowCount;
    });
    expect(rowCount).toBe(0);
  });

  // Known, deliberate scope gap (documented rather than fixed here — it
  // belongs to the Future-Proofing Plan's Phase 4 payment-integrity work):
  // the RLS policy checks only the row's own builder_id, so a raw-SQL
  // insert into recovery_transactions with builder_id = A but customer_id
  // = one of B's customers would satisfy both the WITH CHECK and the FK
  // constraint (foreign keys ignore RLS). No API route can produce that
  // shape — every payment write derives both columns from the customer row
  // — but a database-level check constraint (builder_id must equal the
  // customer's builder_id) is the right long-term closure.
});
