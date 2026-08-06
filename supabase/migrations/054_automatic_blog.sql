-- Automatic Blog — Fitdog editorial publishing platform
-- Isolated blog_* tables; does not alter DigiBoard / Ruffly core tables.

create extension if not exists pgcrypto;

create table if not exists blog_settings (
  id text primary key default 'default',
  enabled boolean not null default false,
  auto_publish_enabled boolean not null default false,
  emergency_off boolean not null default false,
  human_score_threshold integer not null default 90,
  topic_score_threshold integer not null default 85,
  manual_approval_first_n integer not null default 25,
  published_count integer not null default 0,
  ai_images_enabled boolean not null default false,
  max_cost_per_article_cents integer not null default 250,
  daily_cost_limit_cents integer not null default 2500,
  weekly_cost_limit_cents integer not null default 10000,
  monthly_cost_limit_cents integer not null default 30000,
  max_articles_per_week integer not null default 7,
  primary_provider text not null default 'gemini',
  evaluator_provider text not null default 'gemini',
  publish_provider text not null default 'native',
  public_ai_disclosure text,
  brand_voice jsonb not null default '{}'::jsonb,
  editorial_rules jsonb not null default '{}'::jsonb,
  voice_sliders jsonb not null default '{}'::jsonb,
  provider_config jsonb not null default '{}'::jsonb,
  setup_step integer not null default 0,
  setup_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into blog_settings (id) values ('default') on conflict (id) do nothing;

create table if not exists blog_content_pillars (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_voice_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_default boolean not null default false,
  characteristics jsonb not null default '[]'::jsonb,
  sliders jsonb not null default '{}'::jsonb,
  banned_phrases jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  approved_statement text not null,
  supporting_docs jsonb not null default '[]'::jsonb,
  approved_by text,
  approved_at timestamptz,
  review_at timestamptz,
  expires_at timestamptz,
  public_use_allowed boolean not null default false,
  internal_notes text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_knowledge_category_idx on blog_knowledge_entries (category, status);

create table if not exists blog_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  working_title text,
  pillar_id uuid references blog_content_pillars(id) on delete set null,
  audience text not null default 'dog_owners',
  reader_concern text not null default '',
  reader_goal text not null default '',
  why_it_matters text not null default '',
  primary_takeaway text not null default '',
  angle text not null default '',
  search_intent text not null default 'informational',
  primary_keyword text not null default '',
  supporting_keywords jsonb not null default '[]'::jsonb,
  local_relevance text not null default '',
  tone_preset text not null default 'service_explanation',
  topic_quality_score integer,
  topic_score_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'idea'
    check (status in ('idea', 'scored', 'approved', 'rejected', 'used', 'archived')),
  source_mode text not null default 'manual',
  rejection_reason text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_topics_status_idx on blog_topics (status, topic_quality_score desc);

create table if not exists blog_content_briefs (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references blog_topics(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'ready',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_research_sources (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references blog_topics(id) on delete cascade,
  article_id uuid,
  title text not null,
  publisher text,
  author text,
  url text,
  published_at date,
  accessed_at date not null default current_date,
  relevant_claim text not null default '',
  reliability_rating text not null default 'unrated',
  source_type text not null default 'other',
  notes text not null default '',
  expires_at date,
  created_at timestamptz not null default now()
);

create table if not exists blog_articles (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references blog_topics(id) on delete set null,
  brief_id uuid references blog_content_briefs(id) on delete set null,
  title text not null,
  subtitle text,
  slug text not null unique,
  excerpt text not null default '',
  body_html text not null default '',
  body_markdown text not null default '',
  status text not null default 'IDEA',
  audience text not null default 'dog_owners',
  reader_concern text not null default '',
  primary_takeaway text not null default '',
  content_pillar text not null default '',
  tone_preset text not null default 'service_explanation',
  author_profile text not null default 'Fitdog Team',
  ai_assistance jsonb not null default '{}'::jsonb,
  human_reviewer text,
  primary_keyword text not null default '',
  supporting_keywords jsonb not null default '[]'::jsonb,
  seo_title text,
  meta_description text,
  canonical_url text,
  og_title text,
  og_description text,
  robots text not null default 'index,follow',
  cta_label text,
  cta_url text,
  cover_media_id uuid,
  cover_alt text,
  publish_destination text not null default 'native',
  scheduled_for timestamptz,
  published_at timestamptz,
  published_url text,
  topic_quality_score integer,
  human_editorial_score integer,
  natural_voice_score integer,
  empathy_score integer,
  fact_check_status text not null default 'pending',
  image_review_status text not null default 'pending',
  version integer not null default 1,
  estimated_cost_cents integer not null default 0,
  actual_cost_cents integer not null default 0,
  provider_usage jsonb not null default '{}'::jsonb,
  error_history jsonb not null default '[]'::jsonb,
  quality_reports jsonb not null default '{}'::jsonb,
  social_package jsonb not null default '{}'::jsonb,
  claims jsonb not null default '[]'::jsonb,
  created_by text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_articles_status_idx on blog_articles (status, updated_at desc);
create index if not exists blog_articles_published_idx on blog_articles (published_at desc) where status = 'PUBLISHED';

create table if not exists blog_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references blog_articles(id) on delete cascade,
  version integer not null,
  title text not null,
  body_html text not null default '',
  body_markdown text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  unique (article_id, version)
);

create table if not exists blog_status_history (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references blog_articles(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text not null default '',
  actor text,
  created_at timestamptz not null default now()
);

create table if not exists blog_agent_runs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references blog_articles(id) on delete cascade,
  topic_id uuid references blog_topics(id) on delete set null,
  agent_name text not null,
  provider text,
  model text,
  input_summary text not null default '',
  output jsonb not null default '{}'::jsonb,
  score integer,
  ok boolean not null default true,
  error text,
  cost_cents integer not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists blog_agent_runs_article_idx on blog_agent_runs (article_id, created_at desc);

create table if not exists blog_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_generation_jobs_queue_idx
  on blog_generation_jobs (status, run_after);

create table if not exists blog_media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text,
  public_url text,
  source_class text not null default 'fitdog_owned'
    check (source_class in (
      'fitdog_owned', 'member_submitted', 'employee_submitted',
      'licensed_stock', 'photographer_licensed', 'partner_provided',
      'ai_generated_approved'
    )),
  photographer text,
  license_notes text not null default '',
  usage_restrictions text not null default '',
  consent_id uuid,
  uploaded_by text,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'expired')),
  alt_text text not null default '',
  caption text not null default '',
  tags jsonb not null default '[]'::jsonb,
  activity text,
  orientation text,
  season text,
  synthetic_flags jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_media_consents (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_label text not null default '',
  granted_by text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  scope text not null default 'public_blog',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists blog_publish_destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null check (provider in ('native', 'wordpress', 'webhook', 'export')),
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references blog_articles(id) on delete cascade,
  destination_id uuid references blog_publish_destinations(id) on delete set null,
  idempotency_key text not null unique,
  status text not null default 'pending',
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  published_url text,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists blog_usage_records (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references blog_articles(id) on delete set null,
  provider text not null,
  model text,
  units integer not null default 0,
  cost_cents integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists blog_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists blog_audit_logs_created_idx on blog_audit_logs (created_at desc);

create table if not exists blog_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references blog_articles(id) on delete cascade,
  provider text not null default 'unavailable',
  metrics jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

-- Seed default pillars
insert into blog_content_pillars (slug, title, description, sort_order) values
  ('puppy-care', 'Puppy care', 'Routines, socialization, and first experiences for puppies.', 10),
  ('daycare-education', 'Dog daycare education', 'What responsible daycare looks like and how to prepare.', 20),
  ('boarding-preparation', 'Dog boarding preparation', 'Helping dogs and owners prepare for overnight stays.', 30),
  ('training', 'Dog training', 'Practical, kind training guidance for real households.', 40),
  ('enrichment', 'Enrichment', 'Mental stimulation, rest, and healthy activity balance.', 50),
  ('outdoor-safety', 'Outdoor safety', 'Heat, pavement, beaches, hikes, and Southern California outings.', 60),
  ('grooming', 'Grooming', 'Coat care, nails, and comfort-focused grooming habits.', 70),
  ('seasonal-care', 'Seasonal dog care', 'Holiday, weather, and schedule-change support.', 80),
  ('senior-rescue', 'Senior and rescue dogs', 'Adjustment, mobility, and confidence-building care.', 90),
  ('local-guides', 'Santa Monica & LA guides', 'Local dog-owner guidance rooted in Fitdog’s community.', 100),
  ('fitdog-services', 'Fitdog service explanations', 'Clear explanations of evaluations, supervision, and programs.', 110)
on conflict (slug) do nothing;

insert into blog_voice_profiles (name, slug, is_default, characteristics, sliders, banned_phrases)
values (
  'Fitdog Team Default',
  'fitdog-default',
  true,
  '["warm","knowledgeable","calm","caring","practical","honest","friendly","helpful_before_promotional"]'::jsonb,
  '{"warmth":80,"friendliness":75,"professionalism":70,"humor":25,"localPersonality":60,"emotionalSensitivity":70,"technicalDetail":45,"simplicity":65,"promotionalStrength":25,"articleLength":55,"firstPersonFitdogVoice":40,"useOfContractions":80,"useOfExamples":70,"useOfLists":40,"readingLevel":60}'::jsonb,
  '["In today’s fast-paced world","In today’s world","When it comes to","It is important to note","It is worth noting","Delve into","Dive into","Navigate the world of","Unlock the secrets","Unleash the power","Game changer","Ultimate guide","Comprehensive guide","One-stop shop","Whether you are a seasoned dog owner","From furry friends to","Your furry companion","Rest assured","Look no further","The good news is","At the end of the day","In conclusion","To sum it all up","This article will explore","Let’s explore","Let’s dive in","In this blog post","Embark on a journey","Taking your dog care to the next level"]'::jsonb
)
on conflict (slug) do nothing;

insert into blog_publish_destinations (name, provider, config, active)
values
  ('Native Fitdog Blog', 'native', '{"basePath":"/blog"}'::jsonb, true),
  ('WordPress REST', 'wordpress', '{}'::jsonb, false),
  ('Protected Webhook', 'webhook', '{}'::jsonb, false)
on conflict do nothing;
