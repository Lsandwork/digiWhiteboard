-- Rollback for 099_security_cast_tv_media_storage_writes.sql.
-- Recreates the 087 policies verbatim (anonymous write access to cast-tv-media).
-- Use only if CAST-TV uploads are proven to fail because of 099.

set lock_timeout = '3s';

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

reset lock_timeout;
