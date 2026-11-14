drop table if exists public.team_engagement_spotlights cascade;
drop table if exists public.team_engagement_fun_trivia_answers cascade;
drop table if exists public.team_engagement_fun_trivia cascade;
drop table if exists public.team_engagement_fun_poll_votes cascade;
drop table if exists public.team_engagement_fun_poll_options cascade;
drop table if exists public.team_engagement_fun_polls cascade;
drop table if exists public.team_engagement_fun_question_responses cascade;
drop table if exists public.team_engagement_fun_questions cascade;
drop table if exists public.team_engagement_milestone_messages cascade;
drop table if exists public.team_engagement_milestones cascade;
drop table if exists public.team_engagement_bark_out_comments cascade;

alter table public.team_engagement_feedback drop constraint if exists team_engagement_feedback_status_check;
alter table public.team_engagement_feedback
  add constraint team_engagement_feedback_status_check
  check (status in ('submitted', 'under_review', 'planned', 'resolved', 'declined'));

alter table public.staff_directory
  drop column if exists hire_date,
  drop column if exists birthday_month,
  drop column if exists birthday_day,
  drop column if exists show_birthday;