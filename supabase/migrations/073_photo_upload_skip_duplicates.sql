-- Keep one active photo/video per content hash, then prevent re-duplicates.
-- Soft-exclude newer duplicates first so a unique index can be applied safely.
-- Hard storage cleanup is handled by purgeDuplicatePhotoItems in the app.

with ranked as (
  select
    id,
    row_number() over (
      partition by lower(sha256_hash)
      order by created_at asc, id asc
    ) as rn
  from public.photo_upload_items
  where status <> 'excluded'
    and coalesce(sha256_hash, '') <> ''
)
update public.photo_upload_items i
set
  status = 'excluded',
  excluded_reason = 'Duplicate image removed (identical file already in library)',
  duplicate_override = false,
  updated_at = now()
from ranked r
where i.id = r.id
  and r.rn > 1;

create unique index if not exists photo_upload_items_sha256_active_uidx
  on public.photo_upload_items (sha256_hash)
  where status <> 'excluded'
    and coalesce(sha256_hash, '') <> '';
