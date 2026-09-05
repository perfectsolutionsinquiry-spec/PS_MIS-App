// First-login bootstrap for local auth (AUTH_PROVIDER=local).
//
// Sets/resets a local-auth password for a staff_user or builder_user directly
// in the database — needed because /auth/set-password is staff-only, and on a
// fresh self-hosted install there is no staff login yet to make that call.
//
// Usage:
//   DATABASE_URL=postgresql://... \
//   LOCAL_AUTH_EMAIL=azhar@perfectsolutions.in \
//   LOCAL_AUTH_PASSWORD='a-strong-password' \
//   npm run local:set-password --workspace=apps/api
//
// Finds the user by email in staff_users first, then builder_users (both
// tables have carried an email column since 0001_init.sql; builder_users
// additionally falls back to the builders table's contact email).

import pg from "pg";
import { hashPassword } from "../auth/local.js";

const { Pool } = pg;

async function main(): Promise<void> {
  const email = process.env.LOCAL_AUTH_EMAIL?.trim().toLowerCase();
  const password = process.env.LOCAL_AUTH_PASSWORD;
  if (!email || !password) {
    console.error(
      "Usage: DATABASE_URL=... LOCAL_AUTH_EMAIL=user@example.com LOCAL_AUTH_PASSWORD='...' npm run local:set-password --workspace=apps/api"
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  // The script owns its connection (same pattern as src/migrate.ts) so it
  // works against any Postgres without touching the API's shared pool.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  const hash = hashPassword(password);

  // Staff first.
  const staff = await pool.query("select id, email from staff_users where lower(email) = lower($1)", [email]);
  if (staff.rows.length > 0) {
    await pool.query("update staff_users set password_hash = $1 where id = $2", [hash, staff.rows[0].id]);
    console.log(`Password set for staff user ${staff.rows[0].email} (${staff.rows[0].id}).`);
    await pool.end();
    return;
  }

  // Builder users — match their own email, or their builder's email.
  const builderUser = await pool.query(
    `select bu.id, coalesce(bu.email, b.email) as email
     from builder_users bu
     left join builders b on b.id = bu.builder_id
     where lower(bu.email) = lower($1) or lower(b.email) = lower($1)`,
    [email]
  );
  if (builderUser.rows.length > 0) {
    // Keep the email column populated so future logins match reliably.
    await pool.query("update builder_users set email = $1, password_hash = $2 where id = $3", [
      email,
      hash,
      builderUser.rows[0].id,
    ]);
    console.log(`Password set for builder user ${builderUser.rows[0].email} (${builderUser.rows[0].id}).`);
    await pool.end();
    return;
  }

  console.error(`No staff_user or builder_user found with email ${email}.`);
  await pool.end();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});