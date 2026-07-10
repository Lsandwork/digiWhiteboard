-- Yard operations Daily Reminders for Staff Digital Whiteboard.
-- These run seven days a week and display as Daily Reminder push notices for 3 minutes.

do $$
declare
  all_days text[] := array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::text[];
  item record;
begin
  update public.daily_reminders
  set
    is_active = false,
    internal_notes = coalesce(internal_notes, 'disabled_by_yard_operations_daily_recurring_v1'),
    updated_at = now()
  where title in (
    'Check In With Team Lead',
    'Fanny Pack + Yard Supply Check',
    'Morning Potty Support',
    'Yard Safety Setup',
    'Taxi Arrival Support',
    'Special Needs Dog Reminder',
    'Breakfast + Water Support',
    'Yard Observation Check',
    'Potty Station Cleaning',
    'Water + Yard Reset',
    'Swing Handler Handoff Check',
    'Lunch Coverage Plan',
    'Handler Lunch 1 Coverage',
    'Handler Lunch 2 Coverage',
    'Post-Lunch Yard Reset',
    'Potty Station Reset',
    'Boarder Area Refresh Support',
    'Yard + Hallway Cleaning',
    'Dog Notes Support',
    'PM Prep Support',
    'Mop Wheel Hair Removal',
    'Laundry + Towel Support',
    'End-of-Shift Handoff',
    'Clock Out Check'
  )
  and coalesce(internal_notes, '') <> 'yard_operations_daily_recurring_v1';

  for item in
    select *
    from (
      values
        ('06:35:00', 'Morning Yard Setup', 'Please make sure the yard gate is fully set up, secure, and ready before dogs enter the yard. Check that water bowls, poop buckets, mop buckets, and yard tools are ready.', 'Action: Acknowledge', 1001),
        ('06:40:00', 'Time Out X-Pen Setup', 'Please set up the time out x-pen before yard play starts. Make sure it is secure, easy to access, and ready if a dog needs a calm reset.', 'Action: Acknowledge', 1002),
        ('07:15:00', 'Morning Yard Engagement', 'Stay actively engaged with the dogs. Move around the yard, redirect energy early, praise good behavior, and avoid standing in one spot too long.', 'Action: Acknowledge', 1003),
        ('08:30:00', 'Turf Rake Reminder', 'Please rake the turf and clear loose hair, poop pieces, debris, or messy areas. The yard should stay clean throughout the day, not only at closing.', 'Action: Done', 1004),
        ('09:30:00', 'Fence Wipe Down', 'Please wipe down fence areas where dogs have jumped, marked, drooled, or left dirt. Keep the yard looking clean and cared for.', 'Action: Done', 1005),
        ('10:45:00', 'Midday Yard Reset', 'Quick yard reset: rake turf, clean visible messes, refresh water bowls, check the gate, and make sure the time out x-pen is still properly set up.', 'Action: Done', 1006),
        ('12:45:00', 'First Shift Handoff Prep', 'Please do one last yard check before second shift arrives. Rake turf, clean visible messes, check water, check gate setup, and communicate any dog behavior notes.', 'Action: Done', 1007),
        ('13:30:00', 'Second Shift Yard Handoff', 'Second shift: please check yard condition before taking over. Confirm gate setup, x-pen setup, clean turf, water bowls, poop buckets, and any behavior notes from first shift.', 'Action: Acknowledge', 1008),
        ('14:30:00', 'Afternoon Engagement Check', 'Stay active on the yard. Keep dogs engaged, watch body language, redirect rough play early, and make sure the yard does not turn into passive supervision.', 'Action: Acknowledge', 1009),
        ('15:30:00', 'Afternoon Turf Rake', 'Please rake the turf, pick up debris, clean visible messes, and check high-traffic areas. Keep the yard clean for dogs, staff, tours, and cameras.', 'Action: Done', 1010),
        ('16:30:00', 'Fence & Gate Check', 'Please wipe down dirty fence areas and check that the yard gate is still secure and properly set up. Report anything loose, broken, or unsafe.', 'Action: Done', 1011),
        ('17:30:00', 'Evening Yard Reset', 'Evening reset: rake turf, refresh water bowls, clean visible messes, check x-pen, check gate setup, and make sure the yard still looks guest-ready.', 'Action: Done', 1012),
        ('18:30:00', 'Evening Engagement Reminder', 'Dogs still need active engagement. Keep moving, rotate attention, prevent overcrowding at gates/fences, and redirect dogs before energy gets too high.', 'Action: Acknowledge', 1013),
        ('19:30:00', 'Pre-Close Yard Check', 'Start preparing for close-down. Rake turf, clean visible messes, refresh water if needed, check tools, and begin getting the yard ready before dogs go up.', 'Action: Done', 1014),
        ('20:00:00', 'Dogs Up / Yard Close', 'Please put dogs up safely and calmly. Double-check rooms, water, bedding, special notes, and make sure no dog is left behind or placed incorrectly.', 'Action: Done', 1015),
        ('20:15:00', 'Deep Clean Starts', 'Deep clean begins now. Rake turf thoroughly, hose/sanitize assigned areas, wipe fences, clean gates, empty poop buckets, clean tools, and reset the yard for morning.', 'Action: Start Deep Clean', 1016),
        ('20:45:00', 'Deep Clean Final Check', 'Final check: turf cleaned, fences wiped, gates secure, x-pen reset, tools cleaned, buckets emptied, water bowls handled, and yard ready for overnight/morning team.', 'Action: Done', 1017),
        ('21:00:00', 'Yard Closed / Deep Clean Complete', 'Yard deep clean should be complete. Please confirm everything is cleaned, secure, and ready for the next day. Report any issues to Team Lead/Admin before leaving.', null, 1018)
    ) as reminders(scheduled_time, title, message, footer_text, sort_order)
  loop
    update public.daily_reminders
    set
      message = item.message,
      scheduled_time = item.scheduled_time::time,
      audience = array['dog_handler','team_lead']::text[],
      shift_group = 'all_handler_shifts',
      priority = 'normal',
      display_duration_seconds = 180,
      active_days = all_days,
      requires_swing_handler = false,
      is_active = true,
      footer_text = item.footer_text,
      internal_notes = 'yard_operations_daily_recurring_v1',
      sort_order = item.sort_order,
      updated_at = now()
    where title = item.title;

    if not found then
      insert into public.daily_reminders (
        title,
        message,
        scheduled_time,
        audience,
        shift_group,
        priority,
        display_duration_seconds,
        active_days,
        requires_swing_handler,
        is_active,
        footer_text,
        internal_notes,
        sort_order
      )
      values (
        item.title,
        item.message,
        item.scheduled_time::time,
        array['dog_handler','team_lead']::text[],
        'all_handler_shifts',
        'normal',
        180,
        all_days,
        false,
        true,
        item.footer_text,
        'yard_operations_daily_recurring_v1',
        item.sort_order
      );
    end if;
  end loop;
end $$;
