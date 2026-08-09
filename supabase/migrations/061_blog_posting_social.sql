-- Blog full-auto SEO scheduler, WordPress mirror flags, social generator + posting analytics

alter table blog_settings
  add column if not exists full_auto_enabled boolean not null default false,
  add column if not exists wordpress_mirror_enabled boolean not null default false,
  add column if not exists posts_per_week integer not null default 3,
  add column if not exists min_hours_between_posts integer not null default 20,
  add column if not exists schedule_jitter_min_minutes integer not null default 18,
  add column if not exists schedule_jitter_max_minutes integer not null default 45,
  add column if not exists quiet_hours_start integer not null default 20,
  add column if not exists quiet_hours_end integer not null default 7,
  add column if not exists scheduler_timezone text not null default 'America/Los_Angeles',
  add column if not exists automation_config jsonb not null default '{}'::jsonb;

comment on column blog_settings.full_auto_enabled is
  'When true: generate → score gates → human-like schedule → publish without per-article approval.';
comment on column blog_settings.wordpress_mirror_enabled is
  'When true: also publish to WordPress after native success.';

create table if not exists blog_social_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'snapchat')),
  username text not null default '',
  secret_encrypted jsonb not null default '{}'::jsonb,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'configured', 'connected', 'error')),
  last_tested_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform)
);

create table if not exists blog_social_packs (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  prompt text not null default '',
  article_id uuid references blog_articles(id) on delete set null,
  topic_id uuid references blog_topics(id) on delete set null,
  status text not null default 'ready'
    check (status in ('ready', 'archived')),
  voice_notes jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_social_packs_created_idx on blog_social_packs (created_at desc);

create table if not exists blog_social_pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references blog_social_packs(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'snapchat')),
  format text not null,
  hook text not null default '',
  body text not null default '',
  cta text not null default '',
  hashtags jsonb not null default '[]'::jsonb,
  visual_direction text not null default '',
  tone_tags jsonb not null default '[]'::jsonb,
  script_spoken text not null default '',
  on_screen_text text not null default '',
  content jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists blog_social_pack_items_pack_idx
  on blog_social_pack_items (pack_id, platform, format);

create table if not exists blog_social_posts (
  id uuid primary key default gen_random_uuid(),
  pack_item_id uuid references blog_social_pack_items(id) on delete set null,
  pack_id uuid references blog_social_packs(id) on delete set null,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'snapchat')),
  format text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'scheduled', 'posting', 'posted', 'failed', 'cancelled')),
  scheduled_for timestamptz,
  posted_at timestamptz,
  external_url text,
  external_id text,
  error text,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_social_posts_status_idx
  on blog_social_posts (status, scheduled_for);

create index if not exists blog_publish_attempts_article_idx
  on blog_publish_attempts (article_id, created_at desc);

create index if not exists blog_analytics_snapshots_captured_idx
  on blog_analytics_snapshots (captured_at desc);

insert into blog_social_connections (platform, username, status)
values
  ('instagram', '', 'disconnected'),
  ('facebook', '', 'disconnected'),
  ('tiktok', '', 'disconnected'),
  ('snapchat', '', 'disconnected')
on conflict (platform) do nothing;

-- Mode C default path: enable full auto + auto publish once migration applied.
-- emergency_off still blocks everything; score gates still apply.
update blog_settings
set
  full_auto_enabled = true,
  auto_publish_enabled = true,
  wordpress_mirror_enabled = coalesce(wordpress_mirror_enabled, false),
  posts_per_week = greatest(posts_per_week, 3),
  updated_at = now()
where id = 'default';
