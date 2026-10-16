-- Rollback for 098_security_lockdown_open_tables.sql.
-- Restores the pre-098 state exactly: RLS off and Supabase default grants for
-- anon/authenticated on the 66 tables, EXECUTE on the settings RPCs.
-- WARNING: this re-opens customer data to the public anon key. Use only to recover
-- from an outage proven to be caused by 098, then re-apply a corrected lockdown.

set lock_timeout = '3s';

do $$
declare
  target text;
  targets text[] := array[
    'blog_agent_runs', 'blog_analytics_snapshots', 'blog_article_tags', 'blog_article_versions',
    'blog_articles', 'blog_audit_logs', 'blog_authors', 'blog_bookmarks', 'blog_categories',
    'blog_content_briefs', 'blog_content_pillars', 'blog_generation_jobs', 'blog_knowledge_entries',
    'blog_media_assets', 'blog_media_consents', 'blog_promotions', 'blog_publish_attempts',
    'blog_publish_destinations', 'blog_research_sources', 'blog_settings', 'blog_social_connections',
    'blog_social_pack_items', 'blog_social_packs', 'blog_social_posts', 'blog_status_history',
    'blog_subscribers', 'blog_tags', 'blog_topics', 'blog_usage_records', 'blog_voice_profiles',
    'management_reports', 'route_owner_sms_events', 'route_owner_tracking',
    'ruffly_ai_sessions', 'ruffly_ai_usage', 'ruffly_audit_logs', 'ruffly_automation_runs',
    'ruffly_automation_steps', 'ruffly_automation_versions', 'ruffly_automations', 'ruffly_call_records',
    'ruffly_campaign_events', 'ruffly_campaign_recipients', 'ruffly_campaign_steps', 'ruffly_consents',
    'ruffly_contact_dogs', 'ruffly_contact_identities', 'ruffly_contact_tags',
    'ruffly_conversation_participants', 'ruffly_feedback_events', 'ruffly_internal_notes',
    'ruffly_job_queue', 'ruffly_knowledge_articles', 'ruffly_knowledge_versions', 'ruffly_lead_events',
    'ruffly_message_attachments', 'ruffly_notification_preferences', 'ruffly_provider_connections',
    'ruffly_review_requests', 'ruffly_saved_replies', 'ruffly_social_posts', 'ruffly_suppressions',
    'ruffly_sync_runs', 'ruffly_tags', 'ruffly_tasks', 'ruffly_webchat_visitors'
  ];
begin
  foreach target in array targets loop
    if to_regclass(format('public.%I', target)) is null then
      continue;
    end if;
    execute format('alter table public.%I disable row level security', target);
    execute format('grant all on table public.%I to anon, authenticated', target);
  end loop;
end
$$;

grant execute on function public.patch_admin_settings_json(text, jsonb) to anon, authenticated;
grant execute on function public.patch_admin_settings_json_if_revision(text, bigint, jsonb) to anon, authenticated;

reset lock_timeout;
