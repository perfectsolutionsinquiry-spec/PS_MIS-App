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
// Requires a real Postgres reachable via DATABASE_URL with migration
// 0001_init.sql already applied. Skips (not fails) if DATABASE_URL isn't set
// yet, since there is no database wired up in increment 1.

const { Pool } = pg;
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("tenant isolation", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let builderAId: string;
  let builderBId: string;

  beforeAll(async () => {
    const a = await pool.query("insert into builders (name) values ($1) returning id", [
      "Test Builder A",
    ]);
    const b = await pool.query("insert into builders (name) values ($1) returning id", [
      "Test Builder B",
    ]);
    builderAId = a.rows[0].id;
    builderBId = b.rows[0].id;

    await pool.query("insert into customers (builder_id, full_name) values ($1, $2)", [
      builderAId,
      "Customer belonging to A",
    ]);
    await pool.query("insert into customers (builder_id, full_name) values ($1, $2)", [
      builderBId,
      "Customer belonging to B",
    ]);
  });

  afterAll(async () => {
    await pool.query("delete from builders where id in ($1, $2)", [builderAId, builderBId]);
    await pool.end();
  });

  it("builder A cannot see builder B's customers", async () => {
    const client = await pool.connect();
    try {
      await client.query("select set_config('app.current_builder_id', $1, true)", [builderAId]);
      const result = await client.query("select full_name, builder_id from customers");

      const names = result.rows.map((r) => r.full_name);
      expect(names).toContain("Customer belonging to A");
      expect(names).not.toContain("Customer belonging to B");
      expect(result.rows.every((r) => r.builder_id === builderAId)).toBe(true);
    } finally {
      client.release();
    }
  });

  it("a query with no current_builder_id set sees nothing, not everything", async () => {
    const client = await pool.connect();
    try {
      await client.query("select set_config('app.current_builder_id', '', true)");
      const result = await client.query("select * from customers");
      expect(result.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });

  it("a staff login sees every builder's customers", async () => {
    const client = await pool.connect();
    try {
      await client.query("select set_config('app.is_staff', 'true', true)");
      const result = await client.query("select full_name from customers");
      const names = result.rows.map((r) => r.full_name);
      expect(names).toContain("Customer belonging to A");
      expect(names).toContain("Customer belonging to B");
    } finally {
      client.release();
    }
  });
});
