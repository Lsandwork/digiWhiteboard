-- The Pack Priority 2: comments, milestones, fun zone, spotlights, ideas status expansion.
-- Service-role writes only (deny-all RLS), same pattern as migration 103.

create extension if not exists pgcrypto;

-- Optional HR fields for milestone calculations (no fabricated dates).
alter table public.staff_directory
  add column if not exists hire_date date,
  add column if not exists birthday_month smallint check (birthday_month is null or birthday_month between 1 and 12),
  add column if not exists birthday_day smallint check (birthday_day is null or birthday_day between 1 and 31),
  add column if not exists show_birthday boolean not null default false;

-- Ideas for the Pack — expand feedback workflow statuses (forward compatible).
alter table public.team_engagement_feedback drop constraint if exists team_engagement_feedback_status_check;
alter table public.team_engagement_feedback
  add constraint team_engagement_feedback_status_check
  check (status in (
    'submitted', 'under_review', 'approved', 'in_progress', 'implemented',
    'declined', 'planned', 'resolved'
  ));

create table if not exists public.team_engagement_bark_out_comments (
  id uuid primary key default gen_random_uuid(),
  bark_out_id uuid not null references public.team_engagement_bark_outs(id) on delete cascade,
  parent_comment_id uuid references public.team_engagement_bark_out_comments(id) on delete set null,
  author_user_id uuid references public.admin_users(id) on delete set null,
  author_name text not null check (char_length(trim(author_name)) > 0),
  body text not null check (char_length(trim(body)) between 1 and 500),
  status text not null default 'active' check (status in ('active', 'deleted', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_bark_out_comments_bark_out_idx
  on public.team_engagement_bark_out_comments (bark_out_id, created_at);
create index if not exists team_engagement_bark_out_comments_parent_idx
  on public.team_engagement_bark_out_comments (parent_comment_id);

create table if not exists public.team_engagement_milestones (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid references public.admin_users(id) on delete set null,
  employee_name text not null,
  kind text not null check (kind in (
    'birthday', 'welcome', 'anniversary_6mo', 'anniversary_1y', 'anniversary_2y', 'anniversary_3y',
    'anniversary_5y', 'anniversary_10y', 'certification', 'training', 'promotion', 'personal', 'team'
  )),
  title text not null check (char_length(title) between 1 and 200),
  summary text check (summary is null or char_length(summary) <= 600),
  celebration_on date not null,
  visibility text not null default 'team' check (visibility in ('team', 'private', 'management')),
  source text not null default 'system' check (source in ('system', 'management', 'employee')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_engagement_milestones_dedupe_idx
  on public.team_engagement_milestones (employee_user_id, kind, celebration_on)
  where status = 'active' and employee_user_id is not null;

create index if not exists team_engagement_milestones_celebration_idx
  on public.team_engagement_milestones (celebration_on, status);

create table if not exists public.team_engagement_milestone_messages (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.team_engagement_milestones(id) on delete cascade,
  author_user_id uuid references public.admin_users(id) on delete set null,
  author_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 400),
  created_at timestamptz not null default now()
);

create index if not exists team_engagement_milestone_messages_milestone_idx
  on public.team_engagement_milestone_messages (milestone_id, created_at);

create table if not exists public.team_engagement_fun_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null check (char_length(trim(prompt)) between 5 and 400),
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'closed', 'archived')),
  publish_at timestamptz,
  close_at timestamptz,
  allow_multiple_responses boolean not null default false,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_fun_questions_status_idx
  on public.team_engagement_fun_questions (status, publish_at);

create table if not exists public.team_engagement_fun_question_responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.team_engagement_fun_questions(id) on delete cascade,
  responder_user_id uuid not null references public.admin_users(id) on delete cascade,
  responder_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 600),
  created_at timestamptz not null default now()
);

create unique index if not exists team_engagement_fun_question_one_answer_idx
  on public.team_engagement_fun_question_responses (question_id, responder_user_id)
  where true;

create table if not exists public.team_engagement_fun_polls (
  id uuid primary key default gen_random_uuid(),
  prompt text not null check (char_length(trim(prompt)) between 5 and 300),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'closed', 'archived')),
  allow_multiple boolean not null default false,
  allow_vote_change boolean not null default false,
  hide_results_until_vote boolean not null default false,
  publish_at timestamptz,
  close_at timestamptz,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_engagement_fun_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.team_engagement_fun_polls(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 120),
  sort_order integer not null default 0
);

create index if not exists team_engagement_fun_poll_options_poll_idx
  on public.team_engagement_fun_poll_options (poll_id, sort_order);

create table if not exists public.team_engagement_fun_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.team_engagement_fun_polls(id) on delete cascade,
  option_id uuid not null references public.team_engagement_fun_poll_options(id) on delete cascade,
  voter_user_id uuid not null references public.admin_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_engagement_fun_poll_votes_unique_idx
  on public.team_engagement_fun_poll_votes (poll_id, voter_user_id);

create table if not exists public.team_engagement_fun_trivia (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  prompt text not null check (char_length(trim(prompt)) between 5 and 500),
  answer_key text not null check (char_length(trim(answer_key)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed', 'archived')),
  publish_at timestamptz,
  close_at timestamptz,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_engagement_fun_trivia_answers (
  id uuid primary key default gen_random_uuid(),
  trivia_id uuid not null references public.team_engagement_fun_trivia(id) on delete cascade,
  responder_user_id uuid not null references public.admin_users(id) on delete cascade,
  answer text not null check (char_length(trim(answer)) between 1 and 200),
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists team_engagement_fun_trivia_answer_unique_idx
  on public.team_engagement_fun_trivia_answers (trivia_id, responder_user_id);

create table if not exists public.team_engagement_spotlights (
  id uuid primary key default gen_random_uuid(),
  bark_out_id uuid not null references public.team_engagement_bark_outs(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 64),
  caption text check (caption is null or char_length(caption) <= 300),
  week_start date not null,
  featured_by_user_id uuid references public.admin_users(id) on delete set null,
  featured_by_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists team_engagement_spotlights_week_active_idx
  on public.team_engagement_spotlights (week_start) where active = true;

-- RLS deny-all on new tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'team_engagement_bark_out_comments',
    'team_engagement_milestones',
    'team_engagement_milestone_messages',
    'team_engagement_fun_questions',
    'team_engagement_fun_question_responses',
    'team_engagement_fun_polls',
    'team_engagement_fun_poll_options',
    'team_engagement_fun_poll_votes',
    'team_engagement_fun_trivia',
    'team_engagement_fun_trivia_answers',
    'team_engagement_spotlights'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "No direct %s access" on public.%I', t, t);
    execute format(
      'create policy "No direct %s access" on public.%I for all using (false) with check (false)',
      t, t
    );
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
