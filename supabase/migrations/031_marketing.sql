-- Marketing panel: role, media requests, uploads, storage, campaigns, calendar, notifications, audit

-- Extend admin_users role constraint
do $$
begin
  alter table public.admin_users drop constraint if exists admin_users_role_check;
  alter table public.admin_users add constraint admin_users_role_check check (
    role in (
      'owner_admin', 'manager_admin', 'assistant_manager',
      'front_desk_coordinator', 'team_leader', 'groomer', 'trainer',
      'daycare', 'viewer', 'marketing'
    )
  );
exception when others then null;
end $$;

insert into public.admin_roles (key, label, description)
values ('marketing', 'Marketing', 'Marketing panel: media requests, uploads, campaigns, and content calendar.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

-- Media requests
create table if not exists public.marketing_media_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique,
  dog_gingr_id text,
  dog_name text not null,
  dog_breed text,
  dog_photo_url text,
  dog_location text,
  request_type text not null check (request_type in (
    'photo_session', 'video_session', 'social_media', 'campaign_content', 'before_after', 'other'
  )),
  destination text not null check (destination in (
    'photo_box', 'grooming_area', 'lobby', 'training_room', 'custom'
  )),
  custom_destination text,
  priority text not null default 'standard' check (priority in ('standard', 'time_sensitive', 'urgent')),
  requested_deadline timestamptz,
  instructions text,
  status text not null default 'awaiting_handler' check (status in (
    'awaiting_handler', 'handler_acknowledged', 'dog_being_retrieved', 'dog_ready',
    'in_session', 'completed', 'delayed', 'unavailable', 'canceled'
  )),
  delay_until timestamptz,
  staff_notice_id text,
  requested_by_id uuid references public.admin_users(id) on delete set null,
  requested_by_email text,
  requested_by_name text,
  last_handler_action text,
  last_handler_actor text,
  last_handler_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_media_requests_status_idx on public.marketing_media_requests (status, created_at desc);
create index if not exists marketing_media_requests_dog_idx on public.marketing_media_requests (dog_gingr_id, created_at desc);
create index if not exists marketing_media_requests_requester_idx on public.marketing_media_requests (requested_by_id, created_at desc);
create index if not exists marketing_media_requests_active_idx on public.marketing_media_requests (status, priority, created_at asc)
  where status not in ('completed', 'unavailable', 'canceled');

create table if not exists public.marketing_media_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_media_requests(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  actor_id uuid references public.admin_users(id) on delete set null,
  actor_email text,
  actor_name text,
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_media_request_events_request_idx on public.marketing_media_request_events (request_id, created_at desc);

-- Upload batches and media items
create table if not exists public.marketing_upload_batches (
  id uuid primary key default gen_random_uuid(),
  title text,
  photo_date date,
  campaign_id uuid,
  activity text,
  photographer text,
  tags text[] default '{}'::text[],
  dog_assignment_type text not null default 'unmatched' check (dog_assignment_type in (
    'single', 'multiple', 'group', 'facility', 'unmatched'
  )),
  status text not null default 'draft' check (status in (
    'draft', 'uploading', 'processing', 'completed', 'failed', 'canceled'
  )),
  total_files int not null default 0,
  completed_files int not null default 0,
  failed_files int not null default 0,
  created_by_id uuid references public.admin_users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists marketing_upload_batches_status_idx on public.marketing_upload_batches (status, created_at desc);
create index if not exists marketing_upload_batches_creator_idx on public.marketing_upload_batches (created_by_id, created_at desc);

create table if not exists public.marketing_media_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.marketing_upload_batches(id) on delete set null,
  storage_path text not null,
  thumbnail_path text,
  file_name text not null,
  display_title text,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  checksum text,
  width int,
  height int,
  photo_date date,
  activity text,
  photographer text,
  approval_state text not null default 'pending' check (approval_state in ('pending', 'approved', 'rejected')),
  is_favorite boolean not null default false,
  is_used boolean not null default false,
  is_archived boolean not null default false,
  archived_at timestamptz,
  uploaded_by_id uuid references public.admin_users(id) on delete set null,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_media_items_batch_idx on public.marketing_media_items (batch_id, created_at desc);
create index if not exists marketing_media_items_approval_idx on public.marketing_media_items (approval_state, is_archived, created_at desc);
create index if not exists marketing_media_items_checksum_idx on public.marketing_media_items (checksum) where checksum is not null;

create table if not exists public.marketing_media_item_dogs (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.marketing_media_items(id) on delete cascade,
  dog_gingr_id text,
  dog_name text,
  created_at timestamptz not null default now(),
  unique (media_item_id, dog_gingr_id, dog_name)
);

create index if not exists marketing_media_item_dogs_dog_idx on public.marketing_media_item_dogs (dog_gingr_id, dog_name);

create table if not exists public.marketing_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_media_item_tags (
  media_item_id uuid not null references public.marketing_media_items(id) on delete cascade,
  tag_id uuid not null references public.marketing_tags(id) on delete cascade,
  primary key (media_item_id, tag_id)
);

-- Campaigns
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date,
  end_date date,
  status text not null default 'planning' check (status in (
    'planning', 'collecting_content', 'editing', 'ready_for_approval', 'approved', 'published', 'archived'
  )),
  internal_notes text,
  checklist jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_by_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_campaigns_status_idx on public.marketing_campaigns (status, start_date);

create table if not exists public.marketing_campaign_members (
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  primary key (campaign_id, admin_user_id)
);

create table if not exists public.marketing_campaign_media (
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  media_item_id uuid not null references public.marketing_media_items(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (campaign_id, media_item_id)
);

-- Calendar
create table if not exists public.marketing_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null check (event_type in (
    'photo_session', 'video_session', 'campaign_deadline', 'content_collection', 'editing_deadline', 'publication'
  )),
  starts_at timestamptz not null,
  ends_at timestamptz,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  assigned_user_id uuid references public.admin_users(id) on delete set null,
  location text,
  notes text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'completed', 'canceled')),
  dogs_requested jsonb not null default '[]'::jsonb,
  created_by_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_calendar_events_starts_idx on public.marketing_calendar_events (starts_at);
create index if not exists marketing_calendar_events_campaign_idx on public.marketing_calendar_events (campaign_id, starts_at);

-- Marketing notifications
create table if not exists public.marketing_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.admin_users(id) on delete cascade,
  recipient_role text,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  link_path text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marketing_notifications_recipient_idx on public.marketing_notifications (recipient_user_id, is_read, created_at desc);
create index if not exists marketing_notifications_role_idx on public.marketing_notifications (recipient_role, is_read, created_at desc);

-- Marketing audit log
create table if not exists public.marketing_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.admin_users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_activity_log_entity_idx on public.marketing_activity_log (entity_type, entity_id, created_at desc);
create index if not exists marketing_activity_log_created_idx on public.marketing_activity_log (created_at desc);

-- Marketing user preferences
create table if not exists public.marketing_user_settings (
  user_id uuid primary key references public.admin_users(id) on delete cascade,
  default_destination text default 'photo_box',
  default_upload_tags text[] default '{}'::text[],
  thumbnail_density text not null default 'comfortable' check (thumbnail_density in ('compact', 'comfortable', 'spacious')),
  notify_handler_updates boolean not null default true,
  notify_upload_results boolean not null default true,
  notify_campaign_deadlines boolean not null default true,
  updated_at timestamptz not null default now()
);

-- updated_at triggers
drop trigger if exists set_marketing_media_requests_updated_at on public.marketing_media_requests;
create trigger set_marketing_media_requests_updated_at before update on public.marketing_media_requests
  for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_upload_batches_updated_at on public.marketing_upload_batches;
create trigger set_marketing_upload_batches_updated_at before update on public.marketing_upload_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_media_items_updated_at on public.marketing_media_items;
create trigger set_marketing_media_items_updated_at before update on public.marketing_media_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger set_marketing_campaigns_updated_at before update on public.marketing_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_calendar_events_updated_at on public.marketing_calendar_events;
create trigger set_marketing_calendar_events_updated_at before update on public.marketing_calendar_events
  for each row execute function public.set_updated_at();

-- RLS: deny public, app uses service role
alter table public.marketing_media_requests enable row level security;
alter table public.marketing_media_request_events enable row level security;
alter table public.marketing_upload_batches enable row level security;
alter table public.marketing_media_items enable row level security;
alter table public.marketing_media_item_dogs enable row level security;
alter table public.marketing_tags enable row level security;
alter table public.marketing_media_item_tags enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_members enable row level security;
alter table public.marketing_campaign_media enable row level security;
alter table public.marketing_calendar_events enable row level security;
alter table public.marketing_notifications enable row level security;
alter table public.marketing_activity_log enable row level security;
alter table public.marketing_user_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'marketing_media_requests', 'marketing_media_request_events', 'marketing_upload_batches',
    'marketing_media_items', 'marketing_media_item_dogs', 'marketing_tags', 'marketing_media_item_tags',
    'marketing_campaigns', 'marketing_campaign_members', 'marketing_campaign_media',
    'marketing_calendar_events', 'marketing_notifications', 'marketing_activity_log', 'marketing_user_settings'
  ]
  loop
    execute format('drop policy if exists "No public %s access" on public.%I', t, t);
    execute format('create policy "No public %s access" on public.%I for all using (false)', t, t);
  end loop;
end $$;

-- Storage bucket for marketing media (create via Supabase dashboard or storage API if missing)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-media',
  'marketing-media',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.marketing_media_requests;
exception when duplicate_object then null; when undefined_object then null;
end $$;
