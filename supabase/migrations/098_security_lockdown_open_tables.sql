-- Security: close anon/authenticated access to tables created without RLS.
--
-- These 66 tables were created without `enable row level security`, so the default
-- public-schema grants let anyone holding the public anon key read and write them
-- through PostgREST (customer contacts, call records, internal notes, provider
-- connections, owner tracking, blog subscribers, ...).
--
-- Access inventory (verified against production catalog + code, read-only):
--   * Every application read/write goes through getServiceSupabase() (service_role,
--     BYPASSRLS) or a direct `postgres` connection (table owner). Neither is affected.
--   * The browser anon client only subscribes to realtime on live_transition_dogs,
--     package_group_walks and walk_board_cycles. None of those is in this list and
--     none of these tables is in the supabase_realtime publication.
--   * Intended design (044_ruffly_core.sql): "service role used by Next.js; enable
--     RLS and deny anon by default". These tables were simply missed.
--
-- No policies are added: RLS enabled with zero policies denies anon/authenticated
-- while service_role keeps full access. Grants are revoked as a second layer.
-- Reversible: supabase/rollbacks/098_security_lockdown_open_tables.down.sql
--
-- Runtime impact: no new queries, no data changes. Each ALTER takes a brief
-- ACCESS EXCLUSIVE lock; lock_timeout keeps it from queueing behind live traffic
-- (if it times out, nothing is applied — rerun at a quieter time).

set lock_timeout = '3s';

do $$
declare
  target text;
  targets text[] := array[
    'blog_agent_runs',
    'blog_analytics_snapshots',
    'blog_article_tags',
    'blog_article_versions',
    'blog_articles',
    'blog_audit_logs',
    'blog_authors',
    'blog_bookmarks',
    'blog_categories',
    'blog_content_briefs',
    'blog_content_pillars',
    'blog_generation_jobs',
    'blog_knowledge_entries',
    'blog_media_assets',
    'blog_media_consents',
    'blog_promotions',
    'blog_publish_attempts',
    'blog_publish_destinations',
    'blog_research_sources',
    'blog_settings',
    'blog_social_connections',
    'blog_social_pack_items',
    'blog_social_packs',
    'blog_social_posts',
    'blog_status_history',
    'blog_subscribers',
    'blog_tags',
    'blog_topics',
    'blog_usage_records',
    'blog_voice_profiles',
    'management_reports',
    'route_owner_sms_events',
    'route_owner_tracking',
    'ruffly_ai_sessions',
    'ruffly_ai_usage',
    'ruffly_audit_logs',
    'ruffly_automation_runs',
    'ruffly_automation_steps',
    'ruffly_automation_versions',
    'ruffly_automations',
    'ruffly_call_records',
    'ruffly_campaign_events',
    'ruffly_campaign_recipients',
    'ruffly_campaign_steps',
    'ruffly_consents',
    'ruffly_contact_dogs',
    'ruffly_contact_identities',
    'ruffly_contact_tags',
    'ruffly_conversation_participants',
    'ruffly_feedback_events',
    'ruffly_internal_notes',
    'ruffly_job_queue',
    'ruffly_knowledge_articles',
    'ruffly_knowledge_versions',
    'ruffly_lead_events',
    'ruffly_message_attachments',
    'ruffly_notification_preferences',
    'ruffly_provider_connections',
    'ruffly_review_requests',
    'ruffly_saved_replies',
    'ruffly_social_posts',
    'ruffly_suppressions',
    'ruffly_sync_runs',
    'ruffly_tags',
    'ruffly_tasks',
    'ruffly_webchat_visitors'
  ];
begin
  foreach target in array targets loop
    if to_regclass(format('public.%I', target)) is null then
      raise notice 'skip missing table public.%', target;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all on table public.%I from public, anon, authenticated', target);
    execute format('grant all on table public.%I to service_role', target);
  end loop;
end
$$;

-- SECURITY DEFINER settings writers: 075/096 only revoked from PUBLIC, but Supabase
-- grants EXECUTE to anon/authenticated directly, so the anon key could rewrite
-- admin_settings (password policy, permission matrix, role assignments).
-- Only the server (service_role) calls these.
revoke execute on function public.patch_admin_settings_json(text, jsonb) from public, anon, authenticated;
grant execute on function public.patch_admin_settings_json(text, jsonb) to service_role;

revoke execute on function public.patch_admin_settings_json_if_revision(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.patch_admin_settings_json_if_revision(text, bigint, jsonb) to service_role;

reset lock_timeout;
