-- Security: stop granting anon/authenticated access to future public-schema objects.
--
-- Root cause of 098: default privileges for `postgres` in schema public grant ALL
-- on new tables/sequences and EXECUTE on new functions to anon and authenticated,
-- so any table created without RLS is immediately open through the anon key.
--
-- Affects only objects created AFTER this runs. Existing grants are unchanged.
-- The app uses service_role for all table access; the only anon (browser) access is
-- realtime on live_transition_dogs / package_group_walks / walk_board_cycles, which
-- already exist. A future table that needs browser realtime must GRANT SELECT to
-- anon explicitly in its own migration (together with an RLS policy).
--
-- Objects created by supabase_admin keep Supabase's platform defaults (cannot be
-- altered from a migration role).
--
-- Reversible: supabase/rollbacks/100_security_default_privileges.down.sql

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Per-schema defaults can only add to the role-wide defaults, and the built-in
-- role-wide default grants EXECUTE on new functions to PUBLIC (which includes anon).
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;

alter default privileges for role postgres in schema public
  grant all on sequences to service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
