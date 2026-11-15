-- Team Engagement — centralized template library for Manage Team Engagement.

create table if not exists public.team_engagement_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 600),
  tab text not null check (char_length(tab) between 1 and 64),
  category text not null check (char_length(category) between 1 and 80),
  tone text not null default 'Professional' check (char_length(tone) between 1 and 64),
  title_template text not null check (char_length(title_template) between 1 and 200),
  message_template text not null check (char_length(message_template) between 1 and 8000),
  instructions_template text check (instructions_template is null or char_length(instructions_template) <= 2000),
  kind text not null check (char_length(kind) between 1 and 40),
  placeholder_fields text[] not null default '{}',
  default_payload jsonb not null default '{}',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  is_system boolean not null default false,
  source_slug text,
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text,
  updated_by_user_id uuid references public.admin_users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_engagement_templates_slug_key unique (slug)
);

create index if not exists team_engagement_templates_tab_idx
  on public.team_engagement_templates (tab, category, status);
create index if not exists team_engagement_templates_kind_idx
  on public.team_engagement_templates (kind, status);

create table if not exists public.team_engagement_template_favorites (
  template_id uuid not null references public.team_engagement_templates(id) on delete cascade,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, user_id)
);

create table if not exists public.team_engagement_template_publications (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.team_engagement_templates(id) on delete set null,
  template_slug text not null,
  tab text not null,
  kind text not null,
  title_snapshot text not null,
  message_snapshot text not null,
  instructions_snapshot text,
  audience_departments text[] not null default '{}',
  status text not null default 'published'
    check (status in ('draft', 'scheduled', 'published', 'archived', 'cancelled')),
  scheduled_for timestamptz,
  expires_at timestamptz,
  target_type text,
  target_id uuid,
  participation_summary jsonb not null default '{}',
  published_by_user_id uuid references public.admin_users(id) on delete set null,
  published_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_template_publications_template_idx
  on public.team_engagement_template_publications (template_id, created_at desc);

alter table public.team_engagement_templates enable row level security;
alter table public.team_engagement_template_favorites enable row level security;
alter table public.team_engagement_template_publications enable row level security;

create policy team_engagement_templates_deny on public.team_engagement_templates for all using (false);
create policy team_engagement_template_favorites_deny on public.team_engagement_template_favorites for all using (false);
create policy team_engagement_template_publications_deny on public.team_engagement_template_publications for all using (false);

revoke all on public.team_engagement_templates from anon, authenticated;
revoke all on public.team_engagement_template_favorites from anon, authenticated;
revoke all on public.team_engagement_template_publications from anon, authenticated;