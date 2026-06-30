alter table public.live_transition_dogs
add column if not exists display_until timestamptz;

create index if not exists live_transition_dogs_display_until_idx
on public.live_transition_dogs(display_until)
where hidden = false and display_status = 'checking_out';
