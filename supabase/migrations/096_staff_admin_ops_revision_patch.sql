-- Compare-and-swap patch for staff_admin_ops._revision inside admin_settings JSON.

create or replace function public.patch_admin_settings_json_if_revision(
  p_key text,
  p_expected_revision bigint,
  p_value jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_revision bigint;
  touched timestamptz := now();
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'p_key is required';
  end if;

  select coalesce((settings -> p_key ->> '_revision')::bigint, 0)
    into current_revision
  from public.admin_settings
  where id = 'default'
  for update;

  if not found then
    current_revision := 0;
    if p_expected_revision <> 0 then
      return -1;
    end if;
    insert into public.admin_settings (id, settings, updated_at)
    values ('default', jsonb_build_object(p_key, p_value), touched);
    return coalesce((p_value ->> '_revision')::bigint, 0);
  end if;

  if current_revision <> coalesce(p_expected_revision, 0) then
    return -1;
  end if;

  update public.admin_settings
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), array[p_key], p_value, true),
      updated_at = touched
  where id = 'default';

  return coalesce((p_value ->> '_revision')::bigint, current_revision + 1);
end;
$$;

revoke all on function public.patch_admin_settings_json_if_revision(text, bigint, jsonb) from public;
grant execute on function public.patch_admin_settings_json_if_revision(text, bigint, jsonb) to service_role;

-- REST loaders and integration tests read admin_settings via service_role.
grant select, insert, update on public.admin_settings to service_role;
