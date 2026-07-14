-- CAST-TV standalone digital signage slideshow (photos and videos only).

create table if not exists public.cast_tv_media (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  file_name text not null,
  storage_path text not null unique,
  public_url text,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text,
  file_size_bytes bigint,
  duration_seconds numeric,
  image_display_seconds integer not null default 10 check (image_display_seconds in (5, 10, 15, 20, 30, 60)),
  display_order integer not null default 0,
  is_enabled boolean not null default true,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cast_tv_media_enabled_order_idx
  on public.cast_tv_media (is_enabled, display_order, created_at);

create index if not exists cast_tv_media_created_at_idx
  on public.cast_tv_media (created_at desc);

drop trigger if exists set_cast_tv_media_updated_at on public.cast_tv_media;
create trigger set_cast_tv_media_updated_at
  before update on public.cast_tv_media
  for each row
  execute function public.set_updated_at();

alter table public.cast_tv_media enable row level security;

drop policy if exists "No public cast_tv_media access" on public.cast_tv_media;
create policy "No public cast_tv_media access"
  on public.cast_tv_media
  for all
  using (false);

create table if not exists public.cast_tv_settings (
  id uuid primary key default gen_random_uuid(),
  default_image_seconds integer not null default 10 check (default_image_seconds in (5, 10, 15, 20, 30, 60)),
  transition_ms integer not null default 700 check (transition_ms >= 0 and transition_ms <= 5000),
  transition_style text not null default 'fade' check (transition_style in ('fade', 'crossfade', 'none')),
  object_fit text not null default 'contain' check (object_fit in ('contain', 'cover')),
  show_standby_logo boolean not null default true,
  is_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

drop trigger if exists set_cast_tv_settings_updated_at on public.cast_tv_settings;
create trigger set_cast_tv_settings_updated_at
  before update on public.cast_tv_settings
  for each row
  execute function public.set_updated_at();

alter table public.cast_tv_settings enable row level security;

drop policy if exists "No public cast_tv_settings access" on public.cast_tv_settings;
create policy "No public cast_tv_settings access"
  on public.cast_tv_settings
  for all
  using (false);

insert into public.cast_tv_settings (id)
values ('00000000-0000-4000-8000-00000000c0a7')
on conflict (id) do nothing;

create table if not exists public.cast_tv_heartbeats (
  screen_id text primary key,
  last_seen_at timestamptz not null default now(),
  user_agent text,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_cast_tv_heartbeats_updated_at on public.cast_tv_heartbeats;
create trigger set_cast_tv_heartbeats_updated_at
  before update on public.cast_tv_heartbeats
  for each row
  execute function public.set_updated_at();

alter table public.cast_tv_heartbeats enable row level security;

drop policy if exists "No public cast_tv_heartbeats access" on public.cast_tv_heartbeats;
create policy "No public cast_tv_heartbeats access"
  on public.cast_tv_heartbeats
  for all
  using (false);

insert into public.admin_permissions (key, label) values
  ('manage_cast_tv', 'Manage CAST-TV Slideshow')
on conflict (key) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.cast_tv_media;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cast_tv_settings;
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cast-tv-media',
  'cast-tv-media',
  true,
  262144000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
