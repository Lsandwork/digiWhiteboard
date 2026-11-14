-- Pack Phase 4: Would You Rather, team events, goal participation, team pulse, You Said We Did outcomes.
-- Service-role writes only (deny-all RLS), same pattern as 105/107.

create extension if not exists pgcrypto;

alter table public.team_engagement_feedback drop constraint if exists team_engagement_feedback_status_check;
alter table public.team_engagement_feedback
  add constraint team_engagement_feedback_status_check
  check (status in (
    'submitted', 'under_review', 'needs_information', 'approved', 'in_progress', 'implemented',
    'declined', 'not_moving_forward', 'planned', 'resolved'
  ));

create table if not exists public.team_engagement_pack_goal_participants (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.team_engagement_pack_goals(id) on delete cascade,
  participant_user_id uuid not null references public.admin_users(id) on delete cascade,
  participant_name text not null,
  joined_at timestamptz not null default now(),
  unique (goal_id, participant_user_id)
);

create table if not exists public.team_engagement_would_you_rather (
  id uuid primary key default gen_random_uuid(),
  prompt text check (prompt is null or char_length(trim(prompt)) <= 400),
  option_a text not null check (char_length(trim(option_a)) between 1 and 200),
  option_b text not null check (char_length(trim(option_b)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed', 'archived')),
  publish_at timestamptz,
  close_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_engagement_would_you_rather_votes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.team_engagement_would_you_rather(id) on delete cascade,
  voter_user_id uuid not null references public.admin_users(id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  created_at timestamptz not null default now(),
  unique (question_id, voter_user_id)
);

create table if not exists public.team_engagement_pack_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  location text check (location is null or char_length(location) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_engagement_pack_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.team_engagement_pack_events(id) on delete cascade,
  attendee_user_id uuid not null references public.admin_users(id) on delete cascade,
  attendee_name text not null,
  response text not null check (response in ('going', 'maybe', 'cant')),
  created_at timestamptz not null default now(),
  unique (event_id, attendee_user_id)
);

create table if not exists public.team_engagement_team_pulse_responses (
  id uuid primary key default gen_random_uuid(),
  responder_user_id uuid not null references public.admin_users(id) on delete cascade,
  week_start date not null,
  workload_rating smallint not null check (workload_rating between 1 and 5),
  support_rating smallint not null check (support_rating between 1 and 5),
  connection_rating smallint not null check (connection_rating between 1 and 5),
  note text check (note is null or char_length(trim(note)) <= 400),
  created_at timestamptz not null default now(),
  unique (responder_user_id, week_start)
);

create table if not exists public.team_engagement_voice_outcomes (
  id uuid primary key default gen_random_uuid(),
  theme text not null check (char_length(trim(theme)) between 3 and 200),
  management_response text not null check (char_length(trim(management_response)) between 5 and 2000),
  action_taken text check (action_taken is null or char_length(action_taken) <= 2000),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'archived')),
  completed_at timestamptz,
  published_at timestamptz,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.team_engagement_pack_goal_participants enable row level security;
alter table public.team_engagement_would_you_rather enable row level security;
alter table public.team_engagement_would_you_rather_votes enable row level security;
alter table public.team_engagement_pack_events enable row level security;
alter table public.team_engagement_pack_event_rsvps enable row level security;
alter table public.team_engagement_team_pulse_responses enable row level security;
alter table public.team_engagement_voice_outcomes enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'team_engagement_pack_goal_participants',
    'team_engagement_would_you_rather',
    'team_engagement_would_you_rather_votes',
    'team_engagement_pack_events',
    'team_engagement_pack_event_rsvps',
    'team_engagement_team_pulse_responses',
    'team_engagement_voice_outcomes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_deny_all', t);
    execute format('create policy %I on public.%I as restrictive for all using (false)', t || '_deny_all', t);
  end loop;
end $$;