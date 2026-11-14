-- Manage Team Engagement — Bark Outs, moderation, development, feedback, programs, and audit history.
--
-- Identity stays on public.admin_users (and the staff directory). Nothing here duplicates an employee record.
-- The app reads and writes through the service role only: every table has RLS enabled with deny-all policies,
-- and anon/authenticated have no grants. Multi-row changes go through public.team_engagement_commit so the
-- change and its audit event land in one transaction. Audit events are append-only.
--
-- Reversible: supabase/rollbacks/103_team_engagement.down.sql

create extension if not exists pgcrypto;

create table if not exists public.team_engagement_bark_outs (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid references public.admin_users(id) on delete set null,
  author_name text not null check (char_length(trim(author_name)) > 0),
  author_departments text[] not null default '{}',
  recipient_user_id uuid references public.admin_users(id) on delete set null,
  recipient_name text not null check (char_length(trim(recipient_name)) > 0),
  recipient_departments text[] not null default '{}',
  category text not null check (char_length(category) between 1 and 64),
  message text not null check (char_length(message) between 1 and 1000),
  context text check (context is null or char_length(context) <= 300),
  status text not null default 'pending_review'
    check (status in ('awaiting_confirmation', 'pending_review', 'published', 'rejected', 'removed', 'withdrawn')),
  moderation_outcome text not null default 'human_review'
    check (moderation_outcome in (
      'ai_approved', 'author_confirmation', 'human_review', 'policy_rejected', 'moderator_approved',
      'moderator_rejected', 'moderator_removed', 'author_withdrawn', 'hidden_after_reports'
    )),
  author_confirmations integer not null default 0 check (author_confirmations between 0 and 2),
  author_prompt text check (author_prompt is null or char_length(author_prompt) <= 400),
  author_notice text check (author_notice is null or char_length(author_notice) <= 400),
  content_fingerprint text not null,
  escalated_at timestamptz,
  escalation_note text check (escalation_note is null or char_length(escalation_note) <= 600),
  open_report_count integer not null default 0 check (open_report_count >= 0),
  published_at timestamptz,
  decided_at timestamptz,
  decided_by_user_id uuid references public.admin_users(id) on delete set null,
  decided_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_engagement_bark_outs_no_self_recognition
    check (recipient_user_id is null or author_user_id is null or recipient_user_id <> author_user_id)
);

create index if not exists team_engagement_bark_outs_status_idx
  on public.team_engagement_bark_outs (status, created_at desc);
create index if not exists team_engagement_bark_outs_published_idx
  on public.team_engagement_bark_outs (published_at desc) where status = 'published';
create index if not exists team_engagement_bark_outs_recipient_idx
  on public.team_engagement_bark_outs (recipient_user_id, created_at desc);
create index if not exists team_engagement_bark_outs_author_idx
  on public.team_engagement_bark_outs (author_user_id, created_at desc);
create index if not exists team_engagement_bark_outs_duplicate_idx
  on public.team_engagement_bark_outs (author_user_id, recipient_user_id, content_fingerprint);
create index if not exists team_engagement_bark_outs_recipient_departments_idx
  on public.team_engagement_bark_outs using gin (recipient_departments);
create index if not exists team_engagement_bark_outs_author_departments_idx
  on public.team_engagement_bark_outs using gin (author_departments);

create table if not exists public.team_engagement_moderation_events (
  id uuid primary key default gen_random_uuid(),
  bark_out_id uuid not null references public.team_engagement_bark_outs(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'screened', 'ai_review', 'author_confirmed', 'moderator_decision', 'report_filed',
      'report_resolved', 'escalated', 'withdrawn', 'auto_hidden'
    )),
  outcome text check (outcome is null or char_length(outcome) <= 40),
  reason_codes text[] not null default '{}',
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 1000),
  ai_provider text,
  ai_model text,
  ai_confidence numeric(4, 3) check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists team_engagement_moderation_events_bark_out_idx
  on public.team_engagement_moderation_events (bark_out_id, created_at desc);
create index if not exists team_engagement_moderation_events_type_idx
  on public.team_engagement_moderation_events (event_type, created_at desc);

create table if not exists public.team_engagement_reactions (
  id uuid primary key default gen_random_uuid(),
  bark_out_id uuid not null references public.team_engagement_bark_outs(id) on delete cascade,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  reaction text not null check (reaction in ('kudos', 'thanks', 'celebrate')),
  created_at timestamptz not null default now(),
  constraint team_engagement_reactions_unique unique (bark_out_id, user_id, reaction)
);

create index if not exists team_engagement_reactions_bark_out_idx
  on public.team_engagement_reactions (bark_out_id);

create table if not exists public.team_engagement_reports (
  id uuid primary key default gen_random_uuid(),
  bark_out_id uuid not null references public.team_engagement_bark_outs(id) on delete cascade,
  reporter_user_id uuid references public.admin_users(id) on delete set null,
  reporter_name text not null check (char_length(trim(reporter_name)) > 0),
  reason text not null check (char_length(reason) between 3 and 600),
  status text not null default 'open' check (status in ('open', 'kept', 'removed', 'dismissed')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  resolved_by_user_id uuid references public.admin_users(id) on delete set null,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_engagement_reports_one_open_idx
  on public.team_engagement_reports (bark_out_id, reporter_user_id) where status = 'open';
create index if not exists team_engagement_reports_status_idx
  on public.team_engagement_reports (status, created_at desc);

create table if not exists public.team_engagement_development_records (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid not null references public.admin_users(id) on delete cascade,
  employee_name text not null check (char_length(trim(employee_name)) > 0),
  employee_departments text[] not null default '{}',
  record_type text not null
    check (record_type in ('skill', 'milestone', 'training', 'goal', 'achievement', 'growth_note', 'follow_up')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'in_progress' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  visibility text not null default 'leadership' check (visibility in ('leadership', 'shared_with_employee')),
  due_on date,
  completed_at timestamptz,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text not null,
  updated_by_user_id uuid references public.admin_users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_development_employee_idx
  on public.team_engagement_development_records (employee_user_id, created_at desc);
create index if not exists team_engagement_development_departments_idx
  on public.team_engagement_development_records using gin (employee_departments);
create index if not exists team_engagement_development_due_idx
  on public.team_engagement_development_records (status, due_on);

create table if not exists public.team_engagement_feedback (
  id uuid primary key default gen_random_uuid(),
  submitter_user_id uuid references public.admin_users(id) on delete set null,
  submitter_name text not null check (char_length(trim(submitter_name)) > 0),
  submitter_departments text[] not null default '{}',
  category text not null
    check (category in ('operations', 'safety', 'scheduling', 'training', 'equipment', 'team_culture', 'customer_experience', 'other')),
  about_department text
    check (about_department is null or about_department in (
      'front_desk', 'management', 'daycare', 'grooming', 'training', 'transportation', 'overnight', 'maintenance', 'admin'
    )),
  subject text not null check (char_length(trim(subject)) between 3 and 160),
  details text not null check (char_length(trim(details)) between 10 and 3000),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'planned', 'resolved', 'declined')),
  assigned_to_user_id uuid references public.admin_users(id) on delete set null,
  assigned_to_name text,
  follow_up_on date,
  resolution text check (resolution is null or char_length(resolution) <= 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_feedback_status_idx
  on public.team_engagement_feedback (status, created_at desc);
create index if not exists team_engagement_feedback_submitter_idx
  on public.team_engagement_feedback (submitter_user_id, created_at desc);
create index if not exists team_engagement_feedback_departments_idx
  on public.team_engagement_feedback using gin (submitter_departments);

create table if not exists public.team_engagement_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.team_engagement_feedback(id) on delete cascade,
  event_type text not null
    check (event_type in ('submitted', 'status_changed', 'response', 'internal_note', 'assigned', 'follow_up_set')),
  body text check (body is null or char_length(body) <= 3000),
  visible_to_submitter boolean not null default false,
  from_status text,
  to_status text,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_engagement_feedback_events_feedback_idx
  on public.team_engagement_feedback_events (feedback_id, created_at);

create table if not exists public.team_engagement_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 140),
  body text not null check (char_length(trim(body)) between 3 and 4000),
  audience_departments text[] not null default '{}',
  status text not null default 'published' check (status in ('published', 'archived')),
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text not null,
  published_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_engagement_announcements_status_idx
  on public.team_engagement_announcements (status, published_at desc);
create index if not exists team_engagement_announcements_audience_idx
  on public.team_engagement_announcements using gin (audience_departments);

create table if not exists public.team_engagement_programs (
  id uuid primary key default gen_random_uuid(),
  program_type text not null
    check (program_type in (
      'employee_of_the_month', 'team_achievement', 'milestone', 'cross_department',
      'outstanding_teamwork', 'training_achievement', 'positive_contribution'
    )),
  name text not null check (char_length(trim(name)) between 3 and 120),
  description text check (description is null or char_length(description) <= 1000),
  criteria text check (criteria is null or char_length(criteria) <= 1500),
  cadence text not null default 'monthly' check (cadence in ('monthly', 'quarterly', 'annual', 'ongoing')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  nominations_open boolean not null default true,
  created_by_user_id uuid references public.admin_users(id) on delete set null,
  created_by_name text not null,
  updated_by_user_id uuid references public.admin_users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_engagement_nominations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.team_engagement_programs(id) on delete cascade,
  nominee_user_id uuid not null references public.admin_users(id) on delete cascade,
  nominee_name text not null,
  nominee_departments text[] not null default '{}',
  nominated_by_user_id uuid references public.admin_users(id) on delete set null,
  nominated_by_name text not null,
  period_label text not null check (char_length(period_label) between 1 and 20),
  reason text not null check (char_length(trim(reason)) between 20 and 2000),
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'selected', 'not_selected', 'withdrawn')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  decided_by_user_id uuid references public.admin_users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_engagement_nominations_no_self check (nominated_by_user_id is null or nominated_by_user_id <> nominee_user_id)
);

create unique index if not exists team_engagement_nominations_one_active_idx
  on public.team_engagement_nominations (program_id, nominee_user_id, period_label) where status <> 'withdrawn';
create index if not exists team_engagement_nominations_status_idx
  on public.team_engagement_nominations (status, created_at desc);

create table if not exists public.team_engagement_department_profiles (
  department_key text primary key
    check (department_key in (
      'front_desk', 'management', 'daycare', 'grooming', 'training', 'transportation', 'overnight', 'maintenance', 'admin'
    )),
  description text check (description is null or char_length(description) <= 600),
  recognition_enabled boolean not null default true,
  updated_by_user_id uuid references public.admin_users(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_engagement_department_managers (
  department_key text not null
    check (department_key in ('front_desk', 'daycare', 'grooming', 'training', 'transportation', 'overnight', 'maintenance')),
  manager_user_id uuid not null references public.admin_users(id) on delete cascade,
  assigned_by_user_id uuid references public.admin_users(id) on delete set null,
  assigned_by_name text,
  created_at timestamptz not null default now(),
  primary key (department_key, manager_user_id)
);

create index if not exists team_engagement_department_managers_user_idx
  on public.team_engagement_department_managers (manager_user_id);

create table if not exists public.team_engagement_settings (
  setting_key text primary key
    check (setting_key in ('categories', 'participation', 'ai_policy', 'features', 'retention')),
  value jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  updated_by_user_id uuid references public.admin_users(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_engagement_preferences (
  user_id uuid primary key references public.admin_users(id) on delete cascade,
  show_on_team_feed boolean not null default true,
  notify_on_bark_out boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_engagement_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_name text not null,
  actor_role text,
  category text not null check (category in ('engagement', 'moderation', 'configuration', 'access', 'security', 'export')),
  action text not null check (char_length(action) between 3 and 80),
  target_type text,
  target_id text,
  target_label text,
  scope text,
  previous_value jsonb,
  new_value jsonb,
  reason text check (reason is null or char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists team_engagement_audit_events_occurred_idx
  on public.team_engagement_audit_events (occurred_at desc);
create index if not exists team_engagement_audit_events_category_idx
  on public.team_engagement_audit_events (category, occurred_at desc);
create index if not exists team_engagement_audit_events_actor_idx
  on public.team_engagement_audit_events (actor_user_id, occurred_at desc);
create index if not exists team_engagement_audit_events_target_idx
  on public.team_engagement_audit_events (target_type, target_id);

-- Audit events can be inserted, never edited. Deletes run only inside team_engagement_purge.
create or replace function public.team_engagement_audit_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('team_engagement.audit_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Team Engagement audit events are append-only.' using errcode = '42501';
end;
$$;

drop trigger if exists team_engagement_audit_events_no_update on public.team_engagement_audit_events;
create trigger team_engagement_audit_events_no_update
  before update or delete on public.team_engagement_audit_events
  for each row execute function public.team_engagement_audit_guard();

drop trigger if exists team_engagement_audit_events_no_truncate on public.team_engagement_audit_events;
create trigger team_engagement_audit_events_no_truncate
  before truncate on public.team_engagement_audit_events
  for each statement execute function public.team_engagement_audit_guard();

-- Applies a list of insert / upsert / update / delete operations in one transaction.
-- Any failure, or an update that touches a different row count than expect_rows, rolls back everything.
create or replace function public.team_engagement_commit(p_ops jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_op jsonb;
  v_kind text;
  v_table text;
  v_values jsonb;
  v_match jsonb;
  v_conflict jsonb;
  v_cols text;
  v_set_cols text;
  v_where text;
  v_rows jsonb;
  v_count integer;
  v_expect integer;
  v_index integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'team_engagement_commit expects an array of operations.' using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'op';
    v_table := v_op->>'table';
    v_expect := nullif(v_op->>'expect_rows', '')::integer;

    if v_table is null or v_table not in (
      'team_engagement_bark_outs', 'team_engagement_moderation_events', 'team_engagement_reactions',
      'team_engagement_reports', 'team_engagement_development_records', 'team_engagement_feedback',
      'team_engagement_feedback_events', 'team_engagement_announcements', 'team_engagement_programs',
      'team_engagement_nominations', 'team_engagement_department_profiles', 'team_engagement_department_managers',
      'team_engagement_settings', 'team_engagement_preferences', 'team_engagement_audit_events'
    ) then
      raise exception 'team_engagement_commit: table % is not allowed.', coalesce(v_table, '(none)') using errcode = '42501';
    end if;

    if v_table = 'team_engagement_audit_events' and v_kind <> 'insert' then
      raise exception 'Team Engagement audit events are append-only.' using errcode = '42501';
    end if;

    if v_kind in ('insert', 'upsert') then
      v_values := v_op->'values';
      if v_values is null or jsonb_typeof(v_values) <> 'object' then
        raise exception 'team_engagement_commit: % needs values.', v_kind using errcode = '22023';
      end if;
      select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(v_values) as key;

      if v_kind = 'insert' then
        execute format(
          'with ins as (insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning *) '
          || 'select coalesce(jsonb_agg(to_jsonb(ins.*)), ''[]''::jsonb) from ins',
          v_table, v_cols
        ) into v_rows using v_values;
      else
        v_conflict := v_op->'conflict';
        if v_conflict is null or jsonb_typeof(v_conflict) <> 'array' or jsonb_array_length(v_conflict) = 0 then
          raise exception 'team_engagement_commit: upsert needs conflict columns.' using errcode = '22023';
        end if;
        select string_agg(format('%I', value), ', ') into v_where from jsonb_array_elements_text(v_conflict) as value;
        select string_agg(format('%1$I = excluded.%1$I', key), ', ') into v_set_cols
          from jsonb_object_keys(v_values) as key
          where key not in (select value from jsonb_array_elements_text(v_conflict));
        execute format(
          'with ins as (insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
          || 'on conflict (%3$s) do update set %4$s returning *) '
          || 'select coalesce(jsonb_agg(to_jsonb(ins.*)), ''[]''::jsonb) from ins',
          v_table, v_cols, v_where, v_set_cols
        ) into v_rows using v_values;
      end if;
    elsif v_kind = 'update' then
      v_match := v_op->'match';
      v_values := v_op->'set';
      if v_match is null or jsonb_typeof(v_match) <> 'object' or v_match = '{}'::jsonb then
        raise exception 'team_engagement_commit: update needs match columns.' using errcode = '22023';
      end if;
      if v_values is null or jsonb_typeof(v_values) <> 'object' or v_values = '{}'::jsonb then
        raise exception 'team_engagement_commit: update needs set columns.' using errcode = '22023';
      end if;
      select string_agg(format('%I', key), ', ') into v_set_cols from jsonb_object_keys(v_values) as key;
      select string_agg(format('t.%1$I is not distinct from m.%1$I', key), ' and ') into v_where
        from jsonb_object_keys(v_match) as key;
      execute format(
        'with m as (select * from jsonb_populate_record(null::public.%1$I, $2)), '
        || 'upd as (update public.%1$I as t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) '
        || 'from m where %3$s returning t.*) '
        || 'select coalesce(jsonb_agg(to_jsonb(upd.*)), ''[]''::jsonb) from upd',
        v_table, v_set_cols, v_where
      ) into v_rows using v_values, v_match;
    elsif v_kind = 'delete' then
      v_match := v_op->'match';
      if v_match is null or jsonb_typeof(v_match) <> 'object' or v_match = '{}'::jsonb then
        raise exception 'team_engagement_commit: delete needs match columns.' using errcode = '22023';
      end if;
      select string_agg(format('t.%1$I is not distinct from m.%1$I', key), ' and ') into v_where
        from jsonb_object_keys(v_match) as key;
      execute format(
        'with m as (select * from jsonb_populate_record(null::public.%1$I, $1)), '
        || 'del as (delete from public.%1$I as t using m where %2$s returning t.*) '
        || 'select coalesce(jsonb_agg(to_jsonb(del.*)), ''[]''::jsonb) from del',
        v_table, v_where
      ) into v_rows using v_match;
    else
      raise exception 'team_engagement_commit: unknown operation %.', coalesce(v_kind, '(none)') using errcode = '22023';
    end if;

    v_count := jsonb_array_length(v_rows);
    if v_expect is not null and v_count <> v_expect then
      raise exception 'team_engagement_conflict'
        using errcode = 'P0001',
              detail = format('Operation %s on %s changed %s rows; expected %s.', v_index, v_table, v_count, v_expect);
    end if;

    v_results := v_results || jsonb_build_array(v_rows);
    v_index := v_index + 1;
  end loop;

  return v_results;
end;
$$;

-- Retention purge for closed records. Audit history younger than 365 days is never deleted.
create or replace function public.team_engagement_purge(p_plan jsonb, p_audit jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_rejected integer := 0;
  v_withdrawn integer := 0;
  v_removed integer := 0;
  v_feedback integer := 0;
  v_audit integer := 0;
  v_counts jsonb;
begin
  if p_audit is null or jsonb_typeof(p_audit) <> 'object' then
    raise exception 'team_engagement_purge needs an audit event.' using errcode = '22023';
  end if;

  if p_plan ? 'rejected_before' then
    delete from public.team_engagement_bark_outs
      where status = 'rejected' and created_at < (p_plan->>'rejected_before')::timestamptz;
    get diagnostics v_rejected = row_count;
  end if;

  if p_plan ? 'withdrawn_before' then
    delete from public.team_engagement_bark_outs
      where status = 'withdrawn' and updated_at < (p_plan->>'withdrawn_before')::timestamptz;
    get diagnostics v_withdrawn = row_count;
  end if;

  if p_plan ? 'removed_before' then
    delete from public.team_engagement_bark_outs
      where status = 'removed' and updated_at < (p_plan->>'removed_before')::timestamptz;
    get diagnostics v_removed = row_count;
  end if;

  if p_plan ? 'closed_feedback_before' then
    delete from public.team_engagement_feedback
      where status in ('resolved', 'declined') and updated_at < (p_plan->>'closed_feedback_before')::timestamptz;
    get diagnostics v_feedback = row_count;
  end if;

  if p_plan ? 'audit_before' then
    if (p_plan->>'audit_before')::timestamptz > now() - interval '365 days' then
      raise exception 'Audit history younger than 365 days cannot be purged.' using errcode = '22023';
    end if;
    perform set_config('team_engagement.audit_purge', 'on', true);
    delete from public.team_engagement_audit_events where occurred_at < (p_plan->>'audit_before')::timestamptz;
    get diagnostics v_audit = row_count;
    perform set_config('team_engagement.audit_purge', 'off', true);
  end if;

  v_counts := jsonb_build_object(
    'rejected_bark_outs', v_rejected,
    'withdrawn_bark_outs', v_withdrawn,
    'removed_bark_outs', v_removed,
    'closed_feedback', v_feedback,
    'audit_events', v_audit
  );

  insert into public.team_engagement_audit_events
    select * from jsonb_populate_record(
      null::public.team_engagement_audit_events,
      jsonb_build_object('id', gen_random_uuid(), 'occurred_at', now(), 'created_at', now())
        || p_audit
        || jsonb_build_object('new_value', v_counts)
    );

  return v_counts;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'team_engagement_bark_outs', 'team_engagement_moderation_events', 'team_engagement_reactions',
    'team_engagement_reports', 'team_engagement_development_records', 'team_engagement_feedback',
    'team_engagement_feedback_events', 'team_engagement_announcements', 'team_engagement_programs',
    'team_engagement_nominations', 'team_engagement_department_profiles', 'team_engagement_department_managers',
    'team_engagement_settings', 'team_engagement_preferences', 'team_engagement_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists "No public access" on public.%I', v_table);
    execute format('create policy "No public access" on public.%I for all using (false) with check (false)', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function public.team_engagement_commit(jsonb) from public, anon, authenticated;
revoke all on function public.team_engagement_purge(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.team_engagement_audit_guard() from public, anon, authenticated;
grant execute on function public.team_engagement_commit(jsonb) to service_role;
grant execute on function public.team_engagement_purge(jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
