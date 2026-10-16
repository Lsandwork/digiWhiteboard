-- Rollback for 101_admin_login_throttle.sql.
-- Safe at any time: the app falls back to its in-memory limiter when these are missing.

drop function if exists public.admin_login_throttle_fail(text, integer, integer, integer);
drop table if exists public.admin_login_throttle;
