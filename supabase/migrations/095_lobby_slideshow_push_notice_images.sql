-- Ensure lobby-slideshow objects are publicly readable (push-notice images live under push-notices/).
-- Service-role uploads bypass RLS; browsers need public SELECT for getPublicUrl images.

drop policy if exists "lobby_slideshow_public_read" on storage.objects;
create policy "lobby_slideshow_public_read"
  on storage.objects
  for select
  using (bucket_id = 'lobby-slideshow');

drop policy if exists "lobby_slideshow_service_insert" on storage.objects;
create policy "lobby_slideshow_service_insert"
  on storage.objects
  for insert
  with check (bucket_id = 'lobby-slideshow');

drop policy if exists "lobby_slideshow_service_update" on storage.objects;
create policy "lobby_slideshow_service_update"
  on storage.objects
  for update
  using (bucket_id = 'lobby-slideshow')
  with check (bucket_id = 'lobby-slideshow');

drop policy if exists "lobby_slideshow_service_delete" on storage.objects;
create policy "lobby_slideshow_service_delete"
  on storage.objects
  for delete
  using (bucket_id = 'lobby-slideshow');
