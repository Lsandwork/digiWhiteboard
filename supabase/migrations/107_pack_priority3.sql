-- The Pack Priority 3: goals, employee voice (anonymous-safe), ideas status, milestone sync metadata.
-- Service-role writes only (deny-all RLS), same pattern as 103/105.

create extension if not exists pgcrypto;

-- Ideas workflow: "More Information Needed"
alter table public.team_engagement_feedback drop constraint if exists team_engagement_feedback_status_check;
alter table public.team_engagement_feedback
  add constraint team_engagement_feedback_status_check
  check (status in (
    'submitted', 'under_review', 'needs_information', 'approved', 'in_progress', 'implemented',
    'declined', 'planned', 'resolved'
  ));

-- ---------------------------------------------------------------------------
-- Pack Goals
-- ---------------------------------------------------------------------------
create table if not exists public.team_engagement_pack_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null check (char_length(trim(description)) between 10 and 2000),
  goal_type text not null check (goal_type in ('numeric', 'completion', 'participation', 'milestone', 'timebound')),
  target_value numeric check (target_value is null or target_value >= 0),
  current_value numeric not null default 0 check (current_value >= 0),
  unit text check (unit is null or char_length(trim(unit)) <= 40),
  departments text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  starts_on date,
  ends_on date,
  success_criteria text check (success_criteria is null or char_length(success_criteria) <= 600),
  published_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_pack_goals_status_idx
  on public.team_engagement_pack_goals (status, ends_on);

create table if not exists public.team_engagement_pack_goal_events (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.team_engagement_pack_goals(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'published', 'progress', 'completed', 'archived', 'edited')),
  previous_value numeric,
  new_value numeric,
  note text check (note is null or char_length(note) <= 500),
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_engagement_pack_goal_events_goal_idx
  on public.team_engagement_pack_goal_events (goal_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Employee Voice (surveys) — anonymous responses stored without identity
-- ---------------------------------------------------------------------------
create table if not exists public.team_engagement_voice_surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  introduction text check (introduction is null or char_length(introduction) <= 1200),
  anonymity_mode text not null default 'identified' check (anonymity_mode in ('identified', 'anonymous')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'closed', 'archived')),
  departments text[] not null default '{}',
  publish_at timestamptz,
  close_at timestamptz,
  min_aggregate_responses integer not null default 5 check (min_aggregate_responses between 1 and 100),
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_voice_surveys_status_idx
  on public.team_engagement_voice_surveys (status, publish_at);

create table if not exists public.team_engagement_voice_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.team_engagement_voice_surveys(id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 3 and 400),
  question_type text not null check (question_type in ('single', 'multi', 'rating', 'yes_no', 'text')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default true,
  sort_order integer not null default 0
);

create index if not exists team_engagement_voice_questions_survey_idx
  on public.team_engagement_voice_questions (survey_id, sort_order);

-- Identified responses only (leadership may view per policy — not used for anonymous surveys)
create table if not exists public.team_engagement_voice_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.team_engagement_voice_surveys(id) on delete cascade,
  question_id uuid not null references public.team_engagement_voice_questions(id) on delete cascade,
  responder_user_id uuid not null references public.admin_users(id) on delete cascade,
  responder_name text not null,
  answer jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists team_engagement_voice_responses_unique_idx
  on public.team_engagement_voice_responses (survey_id, question_id, responder_user_id);

-- Anonymous responses: no employee identifiers
create table if not exists public.team_engagement_voice_anonymous_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.team_engagement_voice_surveys(id) on delete cascade,
  question_id uuid not null references public.team_engagement_voice_questions(id) on delete cascade,
  answer jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists team_engagement_voice_anon_responses_survey_idx
  on public.team_engagement_voice_anonymous_responses (survey_id, question_id);

-- Dedupe completions for anonymous surveys (hash only — never exposed to leadership APIs)
create table if not exists public.team_engagement_voice_anonymous_completions (
  survey_id uuid not null references public.team_engagement_voice_surveys(id) on delete cascade,
  participant_hash text not null check (char_length(participant_hash) = 64),
  completed_at timestamptz not null default now(),
  primary key (survey_id, participant_hash)
);

-- RLS deny-all on new tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'team_engagement_pack_goals',
    'team_engagement_pack_goal_events',
    'team_engagement_voice_surveys',
    'team_engagement_voice_questions',
    'team_engagement_voice_responses',
    'team_engagement_voice_anonymous_responses',
    'team_engagement_voice_anonymous_completions'
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