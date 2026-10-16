-- Rollback for 100_security_default_privileges.sql.
-- Restores the Supabase platform defaults observed before 100 (pg_default_acl for
-- role postgres in schema public). Affects only objects created afterwards.

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated;

alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated;

alter default privileges for role postgres
  grant execute on functions to public;
