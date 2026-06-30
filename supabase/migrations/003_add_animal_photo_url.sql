alter table public.live_transition_dogs
add column if not exists photo_url text;

create index if not exists live_transition_dogs_gingr_animal_id_photo_idx
on public.live_transition_dogs(gingr_animal_id)
where photo_url is not null;
