-- Cast video push notices for Staff Digital Whiteboard full-screen overlays

create table if not exists public.cast_video_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent', 'emergency')),
  departments text[] not null default array['everyone']::text[],
  video_storage_path text,
  video_url text,
  thumbnail_storage_path text,
  thumbnail_url text,
  mime_type text,
  file_size_bytes bigint,
  allow_sound boolean not null default false,
  require_acknowledgement boolean not null default false,
  auto_clear_mode text not null default 'manual' check (auto_clear_mode in ('manual', '30s', '1m', '2m', '5m', '10m')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'cleared', 'expired', 'deleted')),
  scheduled_at timestamptz,
  pushed_at timestamptz,
  pushed_by text,
  expires_at timestamptz,
  cleared_at timestamptz,
  cleared_by text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cast_video_notices_status_idx
  on public.cast_video_notices (status, pushed_at asc nulls last);

create index if not exists cast_video_notices_priority_idx
  on public.cast_video_notices (priority desc, pushed_at asc nulls last)
  where status = 'active';

create index if not exists cast_video_notices_expires_at_idx
  on public.cast_video_notices (expires_at asc)
  where status = 'active';

create table if not exists public.cast_video_views (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.cast_video_notices(id) on delete cascade,
  viewer_key text not null,
  viewer_role text,
  viewer_location text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  watch_duration_ms integer,
  acknowledged boolean not null default false,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cast_video_views_notice_idx
  on public.cast_video_views (notice_id, opened_at desc);

create unique index if not exists cast_video_views_notice_viewer_idx
  on public.cast_video_views (notice_id, viewer_key);

drop trigger if exists set_cast_video_notices_updated_at on public.cast_video_notices;
create trigger set_cast_video_notices_updated_at
  before update on public.cast_video_notices
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_cast_video_views_updated_at on public.cast_video_views;
create trigger set_cast_video_views_updated_at
  before update on public.cast_video_views
  for each row
  execute function public.set_updated_at();

alter table public.cast_video_notices enable row level security;
alter table public.cast_video_views enable row level security;

drop policy if exists "No public cast video notices access" on public.cast_video_notices;
create policy "No public cast video notices access"
  on public.cast_video_notices
  for all
  using (false);

drop policy if exists "No public cast video views access" on public.cast_video_views;
create policy "No public cast video views access"
  on public.cast_video_views
  for all
  using (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cast-videos',
  'cast-videos',
  false,
  262144000,
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  alter publication supabase_realtime add table public.cast_video_notices;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
