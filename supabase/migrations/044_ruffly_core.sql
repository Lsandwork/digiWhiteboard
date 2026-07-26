-- Ruffly: Fitdog customer care platform (contacts, inbox, leads, reviews, campaigns, AI, jobs)
-- Isolated via ruffly_ table prefix. Provider secrets never stored in plaintext.

create extension if not exists pgcrypto;

-- ---------- Core settings / feature state ----------
create table if not exists public.ruffly_settings (
  id text primary key default 'default',
  setup_completed boolean not null default false,
  setup_step integer not null default 0,
  business_name text not null default 'Fitdog',
  business_profile jsonb not null default '{}'::jsonb,
  quiet_hours jsonb not null default '{"start":"21:00","end":"08:00","timezone":"America/Los_Angeles"}'::jsonb,
  consent_wording_version text not null default 'v1',
  review_request_delay_minutes integer not null default 120,
  review_followup_hours integer not null default 72,
  ai_enabled boolean not null default false,
  webchat_enabled boolean not null default false,
  voice_enabled boolean not null default false,
  campaigns_enabled boolean not null default false,
  automations_enabled boolean not null default false,
  sending_channels jsonb not null default '{"sms":false,"email":false}'::jsonb,
  webchat_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null
);

insert into public.ruffly_settings (id) values ('default') on conflict (id) do nothing;

create table if not exists public.ruffly_provider_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null default 'setup_required'
    check (status in ('connected','setup_required','error','reauth_required','disabled')),
  display_name text not null default '',
  config jsonb not null default '{}'::jsonb,
  secret_ref text,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

create table if not exists public.ruffly_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index if not exists ruffly_audit_logs_created_idx on public.ruffly_audit_logs (created_at desc);
create index if not exists ruffly_audit_logs_entity_idx on public.ruffly_audit_logs (entity_type, entity_id);

create table if not exists public.ruffly_job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','cancelled','dead')),
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  idempotency_key text,
  last_error text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ruffly_job_queue_idempotency_uidx
  on public.ruffly_job_queue (idempotency_key) where idempotency_key is not null;
create index if not exists ruffly_job_queue_due_idx
  on public.ruffly_job_queue (status, run_after) where status in ('pending','failed');

-- ---------- Contacts ----------
create table if not exists public.ruffly_contacts (
  id uuid primary key default gen_random_uuid(),
  gingr_owner_id text,
  first_name text not null default '',
  last_name text not null default '',
  preferred_name text,
  phone text,
  phone_normalized text,
  email text,
  email_normalized text,
  preferred_channel text check (preferred_channel is null or preferred_channel in ('sms','email','phone','webchat')),
  preferred_language text not null default 'en',
  home_location text,
  tags text[] not null default '{}',
  is_vip boolean not null default false,
  client_status text not null default 'unknown'
    check (client_status in ('unknown','lead','active','inactive','former')),
  lead_status text,
  assigned_employee_id uuid references public.admin_users(id) on delete set null,
  lead_source text,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  last_visit_at timestamptz,
  next_reservation_at timestamptz,
  total_completed_visits integer not null default 0,
  estimated_lifetime_value numeric(12,2) not null default 0,
  photo_url text,
  merge_status text not null default 'none'
    check (merge_status in ('none','queued','merged','rejected')),
  merge_candidate_of uuid references public.ruffly_contacts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ruffly_contacts_gingr_owner_uidx
  on public.ruffly_contacts (gingr_owner_id) where gingr_owner_id is not null and deleted_at is null;
create index if not exists ruffly_contacts_phone_idx on public.ruffly_contacts (phone_normalized) where deleted_at is null;
create index if not exists ruffly_contacts_email_idx on public.ruffly_contacts (email_normalized) where deleted_at is null;
create index if not exists ruffly_contacts_assigned_idx on public.ruffly_contacts (assigned_employee_id);

create table if not exists public.ruffly_contact_dogs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.ruffly_contacts(id) on delete cascade,
  gingr_animal_id text,
  name text not null default '',
  breed text,
  birthdate date,
  age_text text,
  photo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ruffly_contact_dogs_contact_idx on public.ruffly_contact_dogs (contact_id);
create unique index if not exists ruffly_contact_dogs_gingr_uidx
  on public.ruffly_contact_dogs (gingr_animal_id) where gingr_animal_id is not null;

create table if not exists public.ruffly_contact_identities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.ruffly_contacts(id) on delete cascade,
  identity_type text not null check (identity_type in ('phone','email','gingr_owner','facebook','instagram','whatsapp','webchat')),
  identity_value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (identity_type, normalized_value)
);

create table if not exists public.ruffly_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_contact_tags (
  contact_id uuid not null references public.ruffly_contacts(id) on delete cascade,
  tag_id uuid not null references public.ruffly_tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create table if not exists public.ruffly_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.ruffly_contacts(id) on delete cascade,
  channel text not null check (channel in ('sms','email','voice','webchat')),
  purpose text not null check (purpose in ('transactional','marketing')),
  status text not null check (status in ('opted_in','opted_out','unknown')),
  source text,
  wording_version text,
  ip inet,
  consented_at timestamptz,
  opted_out_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, channel, purpose)
);

create table if not exists public.ruffly_suppressions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  phone_normalized text,
  email_normalized text,
  channel text not null check (channel in ('sms','email','voice','all')),
  purpose text not null check (purpose in ('transactional','marketing','all')),
  reason text not null,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists ruffly_suppressions_phone_idx on public.ruffly_suppressions (phone_normalized);
create index if not exists ruffly_suppressions_email_idx on public.ruffly_suppressions (email_normalized);

-- ---------- Conversations / inbox ----------
create table if not exists public.ruffly_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  channel text not null
    check (channel in ('sms','email','webchat','form','phone','voice_ai','facebook','instagram','google','whatsapp','manual')),
  subject text,
  status text not null default 'open'
    check (status in ('open','waiting_client','waiting_staff','snoozed','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  sentiment text check (sentiment is null or sentiment in ('positive','neutral','negative','mixed')),
  assigned_employee_id uuid references public.admin_users(id) on delete set null,
  is_vip boolean not null default false,
  is_complaint boolean not null default false,
  is_lead boolean not null default false,
  unread_count integer not null default 0,
  snoozed_until timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  ai_active boolean not null default false,
  gingr_linked boolean not null default false,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists ruffly_conversations_status_idx on public.ruffly_conversations (status, last_message_at desc);
create index if not exists ruffly_conversations_assigned_idx on public.ruffly_conversations (assigned_employee_id);
create index if not exists ruffly_conversations_contact_idx on public.ruffly_conversations (contact_id);

create table if not exists public.ruffly_conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ruffly_conversations(id) on delete cascade,
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  role text not null default 'customer',
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ruffly_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound','system','internal')),
  channel text not null,
  body text not null default '',
  body_html text,
  sender_name text,
  sender_admin_id uuid references public.admin_users(id) on delete set null,
  provider_message_id text,
  delivery_status text check (delivery_status is null or delivery_status in ('queued','sent','delivered','failed','bounced')),
  idempotency_key text,
  ai_generated boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists ruffly_messages_idempotency_uidx
  on public.ruffly_messages (idempotency_key) where idempotency_key is not null;
create index if not exists ruffly_messages_conversation_idx on public.ruffly_messages (conversation_id, created_at);

create table if not exists public.ruffly_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.ruffly_messages(id) on delete cascade,
  storage_path text not null,
  file_name text,
  content_type text,
  byte_size integer,
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_internal_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ruffly_conversations(id) on delete cascade,
  contact_id uuid references public.ruffly_contacts(id) on delete cascade,
  lead_id uuid,
  body text not null,
  author_id uuid references public.admin_users(id) on delete set null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_saved_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  language text not null default 'en',
  category text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Leads ----------
create table if not exists public.ruffly_leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  conversation_id uuid references public.ruffly_conversations(id) on delete set null,
  lead_type text not null default 'general_inquiry',
  stage text not null default 'new_lead',
  source text,
  original_message text,
  assigned_owner_id uuid references public.admin_users(id) on delete set null,
  estimated_value numeric(12,2),
  confidence numeric(5,2),
  priority text not null default 'normal',
  next_action text,
  follow_up_at timestamptz,
  lost_reason text,
  ai_summary text,
  ai_next_action text,
  gingr_owner_id text,
  gingr_reservation_id text,
  conversion_event text,
  won_at timestamptz,
  lost_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ruffly_leads_stage_idx on public.ruffly_leads (stage, follow_up_at);
create index if not exists ruffly_leads_assigned_idx on public.ruffly_leads (assigned_owner_id);

create table if not exists public.ruffly_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ruffly_leads(id) on delete cascade,
  event_type text not null,
  from_stage text,
  to_stage text,
  note text,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  due_at timestamptz,
  assigned_to uuid references public.admin_users(id) on delete set null,
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  lead_id uuid references public.ruffly_leads(id) on delete set null,
  conversation_id uuid references public.ruffly_conversations(id) on delete set null,
  priority text not null default 'normal',
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- Reviews / feedback ----------
create table if not exists public.ruffly_review_requests (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.ruffly_contacts(id) on delete cascade,
  channel text not null check (channel in ('sms','email')),
  status text not null default 'queued'
    check (status in ('queued','sent','clicked','submitted','expired','cancelled','failed')),
  token_hash text not null,
  expires_at timestamptz not null,
  gingr_reservation_id text,
  service_type text,
  sent_at timestamptz,
  clicked_at timestamptz,
  submitted_at timestamptz,
  public_review_clicked_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists ruffly_review_requests_token_uidx on public.ruffly_review_requests (token_hash);
create unique index if not exists ruffly_review_requests_idem_uidx
  on public.ruffly_review_requests (idempotency_key) where idempotency_key is not null;

create table if not exists public.ruffly_reviews (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  review_request_id uuid references public.ruffly_review_requests(id) on delete set null,
  platform text not null default 'internal'
    check (platform in ('internal','google','facebook','other')),
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  body text,
  author_name text,
  platform_review_id text,
  sentiment text,
  response_draft text,
  response_status text not null default 'none'
    check (response_status in ('none','draft','pending_approval','approved','posted','paused')),
  responded_at timestamptz,
  published_at timestamptz,
  topics text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ruffly_reviews_rating_idx on public.ruffly_reviews (rating, created_at desc);

create table if not exists public.ruffly_feedback (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  review_request_id uuid references public.ruffly_review_requests(id) on delete set null,
  category text not null default 'other',
  rating integer check (rating is null or (rating >= 1 and rating <= 5)),
  body text,
  callback_requested boolean not null default false,
  preferred_callback_time text,
  status text not null default 'new'
    check (status in ('new','reviewing','owner_contact_needed','owner_contacted','waiting_on_owner','internal_follow_up','resolved','closed')),
  urgency text not null default 'normal' check (urgency in ('normal','high','critical')),
  dog_ids uuid[] not null default '{}',
  reservation_id text,
  ai_summary text,
  assigned_to uuid references public.admin_users(id) on delete set null,
  token_hash text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ruffly_feedback_status_idx on public.ruffly_feedback (status, created_at desc);

create table if not exists public.ruffly_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.ruffly_feedback(id) on delete cascade,
  event_type text not null,
  note text,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Campaigns / automations ----------
create table if not exists public.ruffly_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_type text not null,
  channel text not null check (channel in ('sms','email','both')),
  status text not null default 'draft'
    check (status in ('draft','scheduled','sending','paused','completed','cancelled','failed')),
  subject text,
  body_sms text,
  body_email_html text,
  audience_filters jsonb not null default '{}'::jsonb,
  schedule_at timestamptz,
  timezone text not null default 'America/Los_Angeles',
  requires_approval boolean not null default true,
  approved_by uuid references public.admin_users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  stats jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ruffly_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ruffly_campaigns(id) on delete cascade,
  step_order integer not null default 0,
  delay_hours integer not null default 0,
  channel text not null,
  subject text,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ruffly_campaigns(id) on delete cascade,
  contact_id uuid not null references public.ruffly_contacts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','skipped','queued','sent','delivered','failed','unsubscribed','clicked')),
  skip_reason text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (campaign_id, contact_id)
);

create table if not exists public.ruffly_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ruffly_campaigns(id) on delete cascade,
  recipient_id uuid references public.ruffly_campaign_recipients(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  template_key text,
  version integer not null default 1,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ruffly_automation_versions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.ruffly_automations(id) on delete cascade,
  version integer not null,
  definition jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (automation_id, version)
);

create table if not exists public.ruffly_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.ruffly_automations(id) on delete cascade,
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  status text not null default 'running'
    check (status in ('running','completed','failed','cancelled','dry_run')),
  idempotency_key text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists ruffly_automation_runs_idem_uidx
  on public.ruffly_automation_runs (idempotency_key) where idempotency_key is not null;

create table if not exists public.ruffly_automation_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ruffly_automation_runs(id) on delete cascade,
  step_key text not null,
  status text not null default 'pending',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------- Knowledge / AI / calls / webchat ----------
create table if not exists public.ruffly_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null default '',
  status text not null default 'draft'
    check (status in ('draft','pending_approval','published','archived')),
  location text,
  audience text not null default 'customer' check (audience in ('customer','staff','both')),
  effective_at timestamptz,
  expires_at timestamptz,
  source text,
  last_reviewed_by uuid references public.admin_users(id) on delete set null,
  last_reviewed_at timestamptz,
  version integer not null default 1,
  ai_enabled boolean not null default true,
  customer_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ruffly_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.ruffly_knowledge_articles(id) on delete cascade,
  version integer not null,
  content text not null,
  changed_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_id, version)
);

create table if not exists public.ruffly_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ruffly_conversations(id) on delete set null,
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  channel text not null,
  status text not null default 'active' check (status in ('active','handed_off','closed')),
  handoff_reason text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ruffly_ai_usage (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.ruffly_ai_sessions(id) on delete set null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(12,6) not null default 0,
  purpose text,
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_call_records (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  conversation_id uuid references public.ruffly_conversations(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound','missed')),
  from_number text,
  to_number text,
  outcome text,
  transcript text,
  recording_enabled boolean not null default false,
  recording_url text,
  ai_summary text,
  duration_seconds integer,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ruffly_webchat_visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_token_hash text not null unique,
  contact_id uuid references public.ruffly_contacts(id) on delete set null,
  conversation_id uuid references public.ruffly_conversations(id) on delete set null,
  domain text,
  user_agent text,
  ip inet,
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.ruffly_social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','scheduled','published','failed','cancelled')),
  caption text not null default '',
  media_urls text[] not null default '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  approval_required boolean not null default true,
  approved_by uuid references public.admin_users(id) on delete set null,
  photo_consent_ok boolean not null default false,
  analytics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ruffly_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  event_type text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  sms boolean not null default false,
  unique (admin_user_id, event_type)
);

-- ---------- Webhooks / sync ----------
create table if not exists public.ruffly_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text,
  external_id text,
  idempotency_key text not null,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  sanitized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received','processing','processed','failed','ignored','replayed')),
  attempts integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ruffly_webhook_events_idem_uidx on public.ruffly_webhook_events (idempotency_key);
create index if not exists ruffly_webhook_events_status_idx on public.ruffly_webhook_events (status, created_at desc);

create table if not exists public.ruffly_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null default 'running'
    check (status in ('running','completed','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  contacts_upserted integer not null default 0,
  reservations_scanned integer not null default 0,
  errors integer not null default 0,
  message text,
  metadata jsonb not null default '{}'::jsonb
);

-- Seed disabled automation templates (idempotent)
insert into public.ruffly_automations (name, description, status, trigger_type, template_key, trigger_config)
select v.name, v.description, v.status, v.trigger_type, v.template_key, v.trigger_config
from (values
  ('Post-Daycare Follow-Up', 'Follow up after daycare checkout', 'draft', 'gingr_checkout', 'post_daycare_followup', '{"service":"daycare"}'::jsonb),
  ('Post-Boarding Follow-Up', 'Follow up after boarding checkout', 'draft', 'gingr_checkout', 'post_boarding_followup', '{"service":"boarding"}'::jsonb),
  ('Post-Grooming Follow-Up', 'Follow up after grooming checkout', 'draft', 'gingr_checkout', 'post_grooming_followup', '{"service":"grooming"}'::jsonb),
  ('Post-Training Follow-Up', 'Follow up after training visit', 'draft', 'gingr_checkout', 'post_training_followup', '{"service":"training"}'::jsonb),
  ('Missed-Call Recovery', 'Text back after a missed call', 'draft', 'missed_call', 'missed_call_recovery', '{}'::jsonb),
  ('New Lead Immediate Response', 'Acknowledge new website or Gingr leads', 'draft', 'lead_created', 'new_lead_response', '{}'::jsonb),
  ('Assessment Follow-Up', 'Follow up after assessment', 'draft', 'assessment_completed', 'assessment_followup', '{}'::jsonb),
  ('Inactive Client Reactivation', 'Re-engage clients with no recent visits', 'draft', 'no_visit_days', 'inactive_reactivation', '{"days":90}'::jsonb),
  ('Low Feedback Management Alert', 'Alert management on low private feedback', 'draft', 'low_feedback', 'low_feedback_alert', '{}'::jsonb),
  ('Review Response Reminder', 'Remind staff to respond to reviews', 'draft', 'review_awaiting_response', 'review_response_reminder', '{}'::jsonb)
) as v(name, description, status, trigger_type, template_key, trigger_config)
where not exists (
  select 1 from public.ruffly_automations a where a.template_key = v.template_key
);

-- RLS: service role used by Next.js; enable RLS and deny anon by default
alter table public.ruffly_settings enable row level security;
alter table public.ruffly_contacts enable row level security;
alter table public.ruffly_conversations enable row level security;
alter table public.ruffly_messages enable row level security;
alter table public.ruffly_leads enable row level security;
alter table public.ruffly_reviews enable row level security;
alter table public.ruffly_feedback enable row level security;
alter table public.ruffly_campaigns enable row level security;
alter table public.ruffly_webhook_events enable row level security;
