-- CAST-TV picture uploads: accept common camera types and allow signed-URL writes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cast-tv-media',
  'cast-tv-media',
  true,
  262144000,
  array[
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cast_tv_media_public_read" on storage.objects;
create policy "cast_tv_media_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'cast-tv-media');

drop policy if exists "cast_tv_media_signed_insert" on storage.objects;
create policy "cast_tv_media_signed_insert"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'cast-tv-media');

drop policy if exists "cast_tv_media_signed_update" on storage.objects;
create policy "cast_tv_media_signed_update"
  on storage.objects
  for update
  to public
  using (bucket_id = 'cast-tv-media')
  with check (bucket_id = 'cast-tv-media');

drop policy if exists "cast_tv_media_signed_delete" on storage.objects;
create policy "cast_tv_media_signed_delete"
  on storage.objects
  for delete
  to public
  using (bucket_id = 'cast-tv-media');
