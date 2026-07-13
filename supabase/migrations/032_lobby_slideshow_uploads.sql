-- Marketing-uploaded photos and videos appended to the lobby idle slideshow.

create table if not exists public.lobby_slideshow_uploads (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null,
  media_url text not null,
  poster_url text,
  mime_type text,
  file_size_bytes bigint,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lobby_slideshow_uploads_active_sort_idx
  on public.lobby_slideshow_uploads (active, sort_order, created_at);

drop trigger if exists set_lobby_slideshow_uploads_updated_at on public.lobby_slideshow_uploads;
create trigger set_lobby_slideshow_uploads_updated_at
  before update on public.lobby_slideshow_uploads
  for each row
  execute function public.set_updated_at();

alter table public.lobby_slideshow_uploads enable row level security;

drop policy if exists "No public lobby slideshow uploads access" on public.lobby_slideshow_uploads;
create policy "No public lobby slideshow uploads access"
  on public.lobby_slideshow_uploads
  for all
  using (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lobby-slideshow',
  'lobby-slideshow',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
