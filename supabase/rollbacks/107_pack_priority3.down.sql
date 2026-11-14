drop table if exists public.team_engagement_voice_anonymous_completions cascade;
drop table if exists public.team_engagement_voice_anonymous_responses cascade;
drop table if exists public.team_engagement_voice_responses cascade;
drop table if exists public.team_engagement_voice_questions cascade;
drop table if exists public.team_engagement_voice_surveys cascade;
drop table if exists public.team_engagement_pack_goal_events cascade;
drop table if exists public.team_engagement_pack_goals cascade;

alter table public.team_engagement_feedback drop constraint if exists team_engagement_feedback_status_check;
alter table public.team_engagement_feedback
  add constraint team_engagement_feedback_status_check
  check (status in (
    'submitted', 'under_review', 'approved', 'in_progress', 'implemented',
    'declined', 'planned', 'resolved'
  ));