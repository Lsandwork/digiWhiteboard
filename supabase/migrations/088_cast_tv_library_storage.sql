-- CAST-TV playlist JSON lives in the working lobby-slideshow bucket.
-- The dedicated cast_tv_* Postgres tables hang in production, so metadata
-- cannot live there or in admin_settings.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime)
  from unnest(
    coalesce(allowed_mime_types, '{}'::text[])
    || array[
      'application/json',
      'text/plain',
      'image/jpg',
      'image/pjpeg',
      'image/heic',
      'image/heif'
    ]
  ) as mime
)
where id = 'lobby-slideshow';
