-- 0002_clerk_auth.sql
--
-- Corrects 0001: builder_users/staff_users had a password_hash column,
-- which is exactly the "own sessions" pattern claude/Platform Plan -
-- Architecture Options and Costs.md explicitly rules out ("Auth: Supabase
-- Auth or Clerk | ... own sessions (never)"). Passwords, reset flows and
-- session tokens are easy to get wrong and expensive to get wrong on
-- financial data — Clerk owns that instead. Each user row now just links to
-- their Clerk identity (clerk_user_id) plus their role/builder in our own
-- database, which is the part only we know.
--
-- Run via Neon's SQL Editor, or: psql "$DATABASE_URL" -f db/migrations/0002_clerk_auth.sql

alter table builder_users drop column password_hash;
alter table builder_users add column clerk_user_id text unique;

alter table staff_users drop column password_hash;
alter table staff_users add column clerk_user_id text unique;
