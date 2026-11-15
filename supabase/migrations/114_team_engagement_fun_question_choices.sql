-- Multiple-choice answers for Fun Zone "Question of the day" (distinct from Pack polls).

alter table public.team_engagement_fun_questions
  add column if not exists response_kind text not null default 'text'
  check (response_kind in ('text', 'choice'));

create table if not exists public.team_engagement_fun_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.team_engagement_fun_questions(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 120),
  sort_order integer not null default 0
);

create index if not exists team_engagement_fun_question_options_question_idx
  on public.team_engagement_fun_question_options (question_id, sort_order);

create table if not exists public.team_engagement_fun_question_choice_votes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.team_engagement_fun_questions(id) on delete cascade,
  option_id uuid not null references public.team_engagement_fun_question_options(id) on delete cascade,
  responder_user_id uuid not null references public.admin_users(id) on delete cascade,
  responder_name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists team_engagement_fun_question_choice_votes_unique_idx
  on public.team_engagement_fun_question_choice_votes (question_id, responder_user_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'team_engagement_fun_question_options',
    'team_engagement_fun_question_choice_votes'
  ] loop
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';