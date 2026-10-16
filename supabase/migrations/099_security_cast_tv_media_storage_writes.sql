-- Security: remove anonymous write access to the public cast-tv-media bucket.
--
-- 087 added INSERT/UPDATE/DELETE policies on storage.objects for role `public`
-- scoped only by bucket_id, so anyone with the anon key could upload, overwrite or
-- delete CAST-TV media shown on lobby/staff TVs.
--
-- Legitimate writes do not need these policies:
--   * Server uploads/removals use getServiceSupabase() (service_role bypasses RLS).
--   * Browser uploads use createSignedUploadUrl() tokens minted by the server; the
--     lobby-slideshow and cast-videos buckets already rely on this with no anon
--     write policies (lobby-slideshow: 5 signed uploads in the last 30 days).
-- Public read (cast_tv_media_public_read) is kept: TVs load media by public URL.
--
-- Reversible: supabase/rollbacks/099_security_cast_tv_media_storage_writes.down.sql
-- Runtime impact: none (policy catalog change only, no data touched).

set lock_timeout = '3s';

drop policy if exists "cast_tv_media_signed_insert" on storage.objects;
drop policy if exists "cast_tv_media_signed_update" on storage.objects;
drop policy if exists "cast_tv_media_signed_delete" on storage.objects;

reset lock_timeout;
