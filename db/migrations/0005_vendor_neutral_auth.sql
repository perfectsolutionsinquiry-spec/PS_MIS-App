-- 0005_vendor_neutral_auth.sql
--
-- Makes the auth columns vendor-neutral so the app can switch between
-- Clerk (cloud) and local/self-hosted auth without schema changes.
--
-- Changes:
--   1. Renames clerk_user_id -> auth_user_id on staff_users and builder_users.
--      The column now stores whatever id the active auth provider issues
--      (Clerk's user_... id, or our own local auth's id — the row's own
--      primary key, used as the JWT subject).
--   2. Adds password_hash to staff_users and builder_users for local auth
--      (AUTH_PROVIDER=local). Null for Clerk-managed users.
--      (0002 dropped the 0001 password_hash columns; this re-introduces
--      them in nullable form.)
--   3. No email change needed: builder_users has had `email text not null
--      unique` since 0001 (line 67), same as staff_users — local auth
--      looks users up by that column directly.
--
-- Run via: npm run migrate --workspace=apps/api
-- (or psql "$DATABASE_URL" -f db/migrations/0005_vendor_neutral_auth.sql)

-- 1. Rename clerk_user_id -> auth_user_id
alter table staff_users rename column clerk_user_id to auth_user_id;
alter table builder_users rename column clerk_user_id to auth_user_id;

-- 2. Add password_hash for local auth (nullable — Clerk users don't need it)
alter table staff_users add column password_hash text;
alter table builder_users add column password_hash text;