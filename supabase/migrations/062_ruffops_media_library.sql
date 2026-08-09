-- RuffOps Cloud Media Library: extend photo upload items for cross-date archive + video.

alter table public.photo_upload_items
  add column if not exists media_kind text not null default 'photo'
    check (media_kind in ('photo', 'video'));

alter table public.photo_upload_items
  add column if not exists duration_seconds numeric;

alter table public.photo_upload_items
  add column if not exists uploaded_by uuid references public.admin_users(id) on delete set null;

alter table public.photo_upload_items
  add column if not exists uploaded_by_name text;

-- Backfill uploader metadata from the parent batch when available.
update public.photo_upload_items i
set
  uploaded_by = coalesce(i.uploaded_by, b.created_by),
  uploaded_by_name = coalesce(
    nullif(trim(i.uploaded_by_name), ''),
    nullif(trim(b.created_by_name), ''),
    nullif(trim(b.photographer_name), '')
  )
from public.photo_upload_batches b
where i.batch_id = b.id
  and (i.uploaded_by is null or i.uploaded_by_name is null);

-- Infer video rows already stored with a video mime type.
update public.photo_upload_items
set media_kind = 'video'
where media_kind = 'photo'
  and mime_type is not null
  and mime_type ilike 'video/%';

create index if not exists photo_upload_items_library_created_idx
  on public.photo_upload_items (created_at desc)
  where status is distinct from 'failed';

create index if not exists photo_upload_items_media_kind_created_idx
  on public.photo_upload_items (media_kind, created_at desc)
  where status is distinct from 'failed';

create index if not exists photo_upload_items_filename_lower_idx
  on public.photo_upload_items (lower(original_filename));

create index if not exists photo_upload_items_uploaded_by_idx
  on public.photo_upload_items (uploaded_by);
