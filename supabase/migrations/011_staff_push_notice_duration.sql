-- Staff Push Notices display duration (non-destructive)

alter table public.staff_push_notices
  add column if not exists display_duration_minutes integer not null default 5;

do $$
begin
  alter table public.staff_push_notices
    drop constraint if exists staff_push_notices_display_duration_minutes_check;

  alter table public.staff_push_notices
    add constraint staff_push_notices_display_duration_minutes_check
    check (display_duration_minutes between 1 and 240);
exception
  when undefined_table then
    null;
end $$;
