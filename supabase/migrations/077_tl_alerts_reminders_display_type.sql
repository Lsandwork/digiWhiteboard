-- Allow TL Alerts + Reminders television displays in Cast Keeper tables.

alter table public.display_devices
  drop constraint if exists display_devices_display_type_check;

alter table public.display_devices
  add constraint display_devices_display_type_check
  check (display_type in ('staff_whiteboard', 'lobby_whiteboard', 'tl_alerts_reminders'));

alter table public.display_commands
  drop constraint if exists display_commands_display_type_check;

alter table public.display_commands
  add constraint display_commands_display_type_check
  check (display_type in ('staff_whiteboard', 'lobby_whiteboard', 'tl_alerts_reminders'));
