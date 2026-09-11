-- Card Studio: ID card design, issuance, print queue, and printer abstraction.
-- Authorization is enforced in the application RBAC layer (custom admin_users).
-- RLS denies anon/authenticated; service_role is used by API routes.

create extension if not exists pgcrypto;

create sequence if not exists public.card_studio_card_number_seq start with 18400;
create sequence if not exists public.card_studio_job_number_seq start with 1;

create table if not exists public.card_studio_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null
);

insert into public.card_studio_settings (id, settings)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.card_studio_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'standard_member',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  current_version_id uuid,
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_studio_templates_status_idx on public.card_studio_templates (status, updated_at desc);
create index if not exists card_studio_templates_category_idx on public.card_studio_templates (category);

create table if not exists public.card_studio_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.card_studio_templates(id) on delete cascade,
  version integer not null,
  document jsonb not null,
  preview_front_path text,
  preview_back_path text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create index if not exists card_studio_template_versions_template_idx
  on public.card_studio_template_versions (template_id, version desc);

alter table public.card_studio_templates
  drop constraint if exists card_studio_templates_current_version_fk;
alter table public.card_studio_templates
  add constraint card_studio_templates_current_version_fk
  foreign key (current_version_id) references public.card_studio_template_versions(id) on delete set null;

create table if not exists public.card_studio_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'logo',
  storage_path text,
  public_src text,
  width integer,
  height integer,
  approved boolean not null default false,
  active boolean not null default true,
  original_asset_id uuid references public.card_studio_assets(id) on delete set null,
  uploaded_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists card_studio_assets_category_idx on public.card_studio_assets (category, approved, created_at desc);

create table if not exists public.card_studio_printers (
  id text primary key,
  name text not null,
  manufacturer text not null,
  model text not null,
  adapter_id text not null,
  connection text not null default 'simulator',
  native_integration boolean not null default false,
  ip_address text,
  serial_number text,
  firmware text,
  capabilities jsonb not null default '{}'::jsonb,
  status_code text not null default 'unknown',
  status_message text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_studio_printer_profiles (
  id uuid primary key default gen_random_uuid(),
  printer_id text not null references public.card_studio_printers(id) on delete cascade,
  name text not null,
  card_size text not null default 'cr80',
  dpi integer not null default 300,
  x_offset_mm numeric not null default 0,
  y_offset_mm numeric not null default 0,
  scale numeric not null default 1,
  rotation numeric not null default 0,
  front_offset_x_mm numeric not null default 0,
  front_offset_y_mm numeric not null default 0,
  back_offset_x_mm numeric not null default 0,
  back_offset_y_mm numeric not null default 0,
  bleed_mm numeric,
  printable_inset_mm numeric,
  color_settings jsonb not null default '{}'::jsonb,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_studio_printer_profiles_printer_idx
  on public.card_studio_printer_profiles (printer_id);

create table if not exists public.card_studio_cards (
  id uuid primary key default gen_random_uuid(),
  card_uuid text not null unique,
  card_number text not null unique,
  status text not null default 'draft',
  member_name text,
  dog_name text,
  membership_type text,
  fitdog_owner_id text,
  fitdog_dog_id text,
  gingr_animal_id text,
  ops_dog_id uuid,
  member_snapshot jsonb not null default '{}'::jsonb,
  template_id uuid references public.card_studio_templates(id) on delete set null,
  template_version_id uuid references public.card_studio_template_versions(id) on delete set null,
  template_version integer,
  front_artwork_path text,
  back_artwork_path text,
  printer_id text references public.card_studio_printers(id) on delete set null,
  operator_admin_id uuid references public.admin_users(id) on delete set null,
  print_job_id uuid,
  reprint_count integer not null default 0,
  replaced_card_id uuid references public.card_studio_cards(id) on delete set null,
  issued_at timestamptz,
  expiration_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_studio_cards_status_idx on public.card_studio_cards (status, created_at desc);
create index if not exists card_studio_cards_member_idx on public.card_studio_cards (fitdog_owner_id, fitdog_dog_id);
create index if not exists card_studio_cards_issued_idx on public.card_studio_cards (issued_at desc);

create table if not exists public.card_studio_print_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null unique,
  card_id uuid references public.card_studio_cards(id) on delete set null,
  template_id uuid references public.card_studio_templates(id) on delete set null,
  template_version_id uuid references public.card_studio_template_versions(id) on delete set null,
  printer_id text references public.card_studio_printers(id) on delete set null,
  operator_admin_id uuid references public.admin_users(id) on delete set null,
  operator_email text,
  print_mode text not null default 'duplex',
  status text not null default 'queued',
  error_message text,
  retry_count integer not null default 0,
  reprint_count integer not null default 0,
  duplicate_risk boolean not null default false,
  idempotency_key text unique,
  front_artwork_path text,
  back_artwork_path text,
  batch_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_studio_print_jobs_status_idx
  on public.card_studio_print_jobs (status, created_at desc);
create index if not exists card_studio_print_jobs_printer_idx
  on public.card_studio_print_jobs (printer_id, created_at desc);

alter table public.card_studio_cards
  drop constraint if exists card_studio_cards_print_job_fk;
alter table public.card_studio_cards
  add constraint card_studio_cards_print_job_fk
  foreign key (print_job_id) references public.card_studio_print_jobs(id) on delete set null;

create table if not exists public.card_studio_reprint_requests (
  id uuid primary key default gen_random_uuid(),
  original_card_id uuid not null references public.card_studio_cards(id) on delete cascade,
  new_card_id uuid references public.card_studio_cards(id) on delete set null,
  reason text not null,
  notes text,
  requested_by uuid references public.admin_users(id) on delete set null,
  printer_id text,
  result text,
  created_at timestamptz not null default now()
);

create table if not exists public.card_studio_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.card_studio_cards(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists card_studio_verification_tokens_card_idx
  on public.card_studio_verification_tokens (card_id);

create table if not exists public.card_studio_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  resource_type text not null,
  resource_id text,
  result text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists card_studio_audit_events_created_idx
  on public.card_studio_audit_events (created_at desc);
create index if not exists card_studio_audit_events_resource_idx
  on public.card_studio_audit_events (resource_type, resource_id, created_at desc);

create table if not exists public.card_studio_print_bridges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null,
  last_seen_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.card_studio_printers (
  id, name, manufacturer, model, adapter_id, connection, native_integration, serial_number, firmware, capabilities, status_code, status_message, last_seen_at
) values
  (
    'sim-cr80',
    'RuffOps Virtual CR80 Printer',
    'RuffOps',
    'Virtual CR80',
    'simulator',
    'simulator',
    true,
    'SIM-CR80-001',
    'sim-1.0',
    '{"color":true,"monochrome":true,"duplex":false,"automaticDuplex":false,"manualFlip":true,"edgeToEdge":true,"resolution":300,"uv":false,"lamination":false,"magneticStripe":false,"smartCard":false,"contactless":false,"usb":false,"ethernet":false,"wifi":false,"osDriver":false,"nativeIntegration":true}'::jsonb,
    'online',
    'Simulator online.',
    now()
  ),
  (
    'sim-duplex',
    'RuffOps Virtual Duplex Printer',
    'RuffOps',
    'Virtual Duplex',
    'simulator',
    'simulator',
    true,
    'SIM-DUPLEX-001',
    'sim-1.0',
    '{"color":true,"monochrome":true,"duplex":true,"automaticDuplex":true,"manualFlip":true,"edgeToEdge":true,"resolution":300,"uv":false,"lamination":false,"magneticStripe":false,"smartCard":false,"contactless":false,"usb":false,"ethernet":false,"wifi":false,"osDriver":false,"nativeIntegration":true}'::jsonb,
    'online',
    'Simulator online (automatic duplex).',
    now()
  ),
  (
    'sim-fail',
    'RuffOps Virtual Failure Printer',
    'RuffOps',
    'Virtual Failure',
    'simulator',
    'simulator',
    true,
    'SIM-FAIL-001',
    'sim-1.0',
    '{"color":true,"monochrome":true,"duplex":false,"automaticDuplex":false,"manualFlip":true,"edgeToEdge":true,"resolution":300,"uv":false,"lamination":false,"magneticStripe":false,"smartCard":false,"contactless":false,"usb":false,"ethernet":false,"wifi":false,"osDriver":false,"nativeIntegration":true}'::jsonb,
    'error',
    'Simulator is configured to fail prints.',
    now()
  )
on conflict (id) do nothing;

insert into public.card_studio_printer_profiles (printer_id, name, dpi)
select id, name || ' CR80 300 DPI', 300
from public.card_studio_printers
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-studio-assets',
  'card-studio-assets',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do nothing;

alter table public.card_studio_settings enable row level security;
alter table public.card_studio_templates enable row level security;
alter table public.card_studio_template_versions enable row level security;
alter table public.card_studio_assets enable row level security;
alter table public.card_studio_printers enable row level security;
alter table public.card_studio_printer_profiles enable row level security;
alter table public.card_studio_cards enable row level security;
alter table public.card_studio_print_jobs enable row level security;
alter table public.card_studio_reprint_requests enable row level security;
alter table public.card_studio_verification_tokens enable row level security;
alter table public.card_studio_audit_events enable row level security;
alter table public.card_studio_print_bridges enable row level security;

drop policy if exists "No public card studio settings" on public.card_studio_settings;
create policy "No public card studio settings" on public.card_studio_settings for all using (false);

drop policy if exists "No public card studio templates" on public.card_studio_templates;
create policy "No public card studio templates" on public.card_studio_templates for all using (false);

drop policy if exists "No public card studio template versions" on public.card_studio_template_versions;
create policy "No public card studio template versions" on public.card_studio_template_versions for all using (false);

drop policy if exists "No public card studio assets" on public.card_studio_assets;
create policy "No public card studio assets" on public.card_studio_assets for all using (false);

drop policy if exists "No public card studio printers" on public.card_studio_printers;
create policy "No public card studio printers" on public.card_studio_printers for all using (false);

drop policy if exists "No public card studio printer profiles" on public.card_studio_printer_profiles;
create policy "No public card studio printer profiles" on public.card_studio_printer_profiles for all using (false);

drop policy if exists "No public card studio cards" on public.card_studio_cards;
create policy "No public card studio cards" on public.card_studio_cards for all using (false);

drop policy if exists "No public card studio print jobs" on public.card_studio_print_jobs;
create policy "No public card studio print jobs" on public.card_studio_print_jobs for all using (false);

drop policy if exists "No public card studio reprints" on public.card_studio_reprint_requests;
create policy "No public card studio reprints" on public.card_studio_reprint_requests for all using (false);

drop policy if exists "No public card studio verification tokens" on public.card_studio_verification_tokens;
create policy "No public card studio verification tokens" on public.card_studio_verification_tokens for all using (false);

drop policy if exists "No public card studio audit" on public.card_studio_audit_events;
create policy "No public card studio audit" on public.card_studio_audit_events for all using (false);

drop policy if exists "No public card studio print bridges" on public.card_studio_print_bridges;
create policy "No public card studio print bridges" on public.card_studio_print_bridges for all using (false);

create or replace function public.card_studio_next_card_number()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.card_studio_card_number_seq');
$$;

create or replace function public.card_studio_next_job_number()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.card_studio_job_number_seq');
$$;

revoke all on function public.card_studio_next_card_number() from public, anon, authenticated;
revoke all on function public.card_studio_next_job_number() from public, anon, authenticated;
grant execute on function public.card_studio_next_card_number() to service_role;
grant execute on function public.card_studio_next_job_number() to service_role;

insert into public.admin_permissions (key, label, description)
values
  ('card_studio.view', 'View Card Studio', 'Open Card Studio'),
  ('card_studio.design', 'Design Cards', 'Create and edit templates'),
  ('card_studio.issue', 'Issue Cards', 'Issue membership cards'),
  ('card_studio.print', 'Print Cards', 'Submit print jobs'),
  ('card_studio.manage_assets', 'Manage Card Assets', 'Manage approved brand assets'),
  ('card_studio.delete_templates', 'Delete Templates', 'Delete card templates'),
  ('card_studio.manage_printers', 'Manage Printers', 'Printer administration'),
  ('card_studio.manage_settings', 'Card Studio Settings', 'System settings'),
  ('card_studio.revoke', 'Revoke Cards', 'Revoke issued cards')
on conflict (key) do nothing;
