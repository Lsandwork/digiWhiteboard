-- Patch one admin_settings JSON key without read/modify/write of the whole blob.
-- Also cap service_role statement time so abandoned REST calls cannot hold connections forever.

alter role service_role set statement_timeout = '30s';
alter role service_role set idle_in_transaction_session_timeout = '30s';

create or replace function public.patch_admin_settings_json(p_key text, p_value jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  touched timestamptz := now();
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'p_key is required';
  end if;

  insert into public.admin_settings (id, settings, updated_at)
  values ('default', jsonb_build_object(p_key, p_value), touched)
  on conflict (id) do update
    set settings = jsonb_set(coalesce(public.admin_settings.settings, '{}'::jsonb), array[p_key], p_value, true),
        updated_at = touched;

  return touched;
end;
$$;

revoke all on function public.patch_admin_settings_json(text, jsonb) from public;
grant execute on function public.patch_admin_settings_json(text, jsonb) to service_role;
