-- Rollback for 103_team_engagement.sql.
-- Deletes every Team Engagement record (Bark Outs, feedback, development records, programs, and audit history).
-- Export anything you need to keep before running this.

drop function if exists public.team_engagement_purge(jsonb, jsonb);
drop function if exists public.team_engagement_commit(jsonb);

drop table if exists public.team_engagement_audit_events;
drop function if exists public.team_engagement_audit_guard();
drop table if exists public.team_engagement_preferences;
drop table if exists public.team_engagement_settings;
drop table if exists public.team_engagement_department_managers;
drop table if exists public.team_engagement_department_profiles;
drop table if exists public.team_engagement_nominations;
drop table if exists public.team_engagement_programs;
drop table if exists public.team_engagement_announcements;
drop table if exists public.team_engagement_feedback_events;
drop table if exists public.team_engagement_feedback;
drop table if exists public.team_engagement_development_records;
drop table if exists public.team_engagement_reports;
drop table if exists public.team_engagement_reactions;
drop table if exists public.team_engagement_moderation_events;
drop table if exists public.team_engagement_bark_outs;

notify pgrst, 'reload schema';
