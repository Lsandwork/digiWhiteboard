-- Migration 111 created template tables but did not grant service_role (unlike 105_pack_priority2).
-- Required for PostgREST writes when team_engagement_commit is not expanded yet (migration 112).

do $$
declare
  t text;
begin
  foreach t in array array[
    'team_engagement_templates',
    'team_engagement_template_favorites',
    'team_engagement_template_publications'
  ] loop
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';