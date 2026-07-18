-- Gingr Photo Upload Queue: prepare, track, and export report-card photos for manual Gingr transfer.

create table if not exists public.photo_upload_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photo_upload_yards (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.photo_upload_categories (key, label, sort_order) values
  ('daycare', 'Daycare', 10),
  ('boarding', 'Boarding', 20),
  ('training', 'Training', 30),
  ('grooming', 'Grooming', 40),
  ('adventure_hike', 'Adventure Hike', 50),
  ('beach_excursion', 'Beach Excursion', 60),
  ('class', 'Class', 70),
  ('birthday', 'Birthday', 80),
  ('staff_favorite', 'Staff Favorite', 90),
  ('social_media', 'Social Media', 100),
  ('other', 'Other', 110)
on conflict (key) do nothing;

insert into public.photo_upload_yards (key, label, sort_order) values
  ('big_side', 'Big Side', 10),
  ('small_side', 'Small Side', 20),
  ('training_area', 'Training Area', 30),
  ('grooming', 'Grooming', 40),
  ('lobby', 'Lobby', 50),
  ('off_site', 'Off-Site', 60),
  ('adventure_hike', 'Adventure Hike', 70),
  ('beach', 'Beach', 80),
  ('other', 'Other', 90)
on conflict (key) do nothing;

create table if not exists public.photo_upload_batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  service_date date not null,
  photographer_name text not null,
  photographer_user_id uuid references public.admin_users(id) on delete set null,
  default_yard text not null default 'big_side',
  default_category text not null default 'daycare',
  internal_note text,
  status text not null default 'draft'
    check (status in (
      'draft', 'processing', 'needs_review', 'ready', 'exported',
      'partially_uploaded', 'uploaded_to_gingr', 'archived'
    )),
  created_by uuid references public.admin_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  exported_at timestamptz,
  uploaded_to_gingr_at timestamptz,
  uploaded_to_gingr_by uuid references public.admin_users(id) on delete set null,
  uploaded_to_gingr_by_name text,
  archived_at timestamptz,
  reopen_reason text,
  reopened_at timestamptz,
  reopened_by uuid references public.admin_users(id) on delete set null
);

create index if not exists photo_upload_batches_service_date_idx
  on public.photo_upload_batches (service_date desc);
create index if not exists photo_upload_batches_status_idx
  on public.photo_upload_batches (status, created_at desc);
create index if not exists photo_upload_batches_created_by_idx
  on public.photo_upload_batches (created_by);

create table if not exists public.photo_upload_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.photo_upload_batches(id) on delete cascade,
  original_filename text not null,
  stored_filename text not null,
  original_storage_path text not null,
  thumbnail_storage_path text,
  gingr_ready_storage_path text,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  sha256_hash text not null,
  yard text,
  category text,
  photographer_name text,
  internal_note text,
  status text not null default 'processing'
    check (status in (
      'processing', 'needs_dog_assignment', 'needs_review', 'ready_for_gingr',
      'included_in_export', 'uploaded_to_gingr', 'excluded', 'failed'
    )),
  duplicate_of_item_id uuid references public.photo_upload_items(id) on delete set null,
  duplicate_override boolean not null default false,
  excluded_reason text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_to_gingr_at timestamptz,
  uploaded_to_gingr_by uuid references public.admin_users(id) on delete set null
);

create index if not exists photo_upload_items_batch_id_idx
  on public.photo_upload_items (batch_id, created_at);
create index if not exists photo_upload_items_sha256_idx
  on public.photo_upload_items (sha256_hash);
create index if not exists photo_upload_items_status_idx
  on public.photo_upload_items (status);

create table if not exists public.photo_upload_item_dogs (
  id uuid primary key default gen_random_uuid(),
  photo_item_id uuid not null references public.photo_upload_items(id) on delete cascade,
  gingr_pet_id text,
  dog_name text not null,
  owner_name text,
  dog_photo_url text,
  reservation_type text,
  assignment_source text not null default 'manual'
    check (assignment_source in ('checked_in', 'manual', 'bulk')),
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_users(id) on delete set null
);

create index if not exists photo_upload_item_dogs_item_idx
  on public.photo_upload_item_dogs (photo_item_id);
create index if not exists photo_upload_item_dogs_name_idx
  on public.photo_upload_item_dogs (lower(dog_name));
create index if not exists photo_upload_item_dogs_pet_idx
  on public.photo_upload_item_dogs (gingr_pet_id);

create table if not exists public.photo_upload_exports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.photo_upload_batches(id) on delete cascade,
  export_number integer not null default 1,
  zip_storage_path text,
  total_items integer not null default 0,
  created_by uuid references public.admin_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  confirmed_uploaded_at timestamptz,
  confirmed_uploaded_by uuid references public.admin_users(id) on delete set null,
  confirmed_uploaded_by_name text,
  locked_at timestamptz,
  unique (batch_id, export_number)
);

create table if not exists public.photo_upload_export_items (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.photo_upload_exports(id) on delete cascade,
  photo_item_id uuid not null references public.photo_upload_items(id) on delete cascade,
  exported_filename text not null,
  created_at timestamptz not null default now(),
  unique (export_id, photo_item_id)
);

create index if not exists photo_upload_export_items_export_idx
  on public.photo_upload_export_items (export_id);

create table if not exists public.photo_upload_audit_log (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.photo_upload_batches(id) on delete cascade,
  photo_item_id uuid references public.photo_upload_items(id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  performed_by uuid references public.admin_users(id) on delete set null,
  performed_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists photo_upload_audit_log_batch_idx
  on public.photo_upload_audit_log (batch_id, created_at desc);

drop trigger if exists set_photo_upload_batches_updated_at on public.photo_upload_batches;
create trigger set_photo_upload_batches_updated_at
  before update on public.photo_upload_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_photo_upload_items_updated_at on public.photo_upload_items;
create trigger set_photo_upload_items_updated_at
  before update on public.photo_upload_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_photo_upload_categories_updated_at on public.photo_upload_categories;
create trigger set_photo_upload_categories_updated_at
  before update on public.photo_upload_categories
  for each row execute function public.set_updated_at();

drop trigger if exists set_photo_upload_yards_updated_at on public.photo_upload_yards;
create trigger set_photo_upload_yards_updated_at
  before update on public.photo_upload_yards
  for each row execute function public.set_updated_at();

alter table public.photo_upload_categories enable row level security;
alter table public.photo_upload_yards enable row level security;
alter table public.photo_upload_batches enable row level security;
alter table public.photo_upload_items enable row level security;
alter table public.photo_upload_item_dogs enable row level security;
alter table public.photo_upload_exports enable row level security;
alter table public.photo_upload_export_items enable row level security;
alter table public.photo_upload_audit_log enable row level security;

drop policy if exists "No public photo_upload_categories access" on public.photo_upload_categories;
create policy "No public photo_upload_categories access" on public.photo_upload_categories for all using (false);
drop policy if exists "No public photo_upload_yards access" on public.photo_upload_yards;
create policy "No public photo_upload_yards access" on public.photo_upload_yards for all using (false);
drop policy if exists "No public photo_upload_batches access" on public.photo_upload_batches;
create policy "No public photo_upload_batches access" on public.photo_upload_batches for all using (false);
drop policy if exists "No public photo_upload_items access" on public.photo_upload_items;
create policy "No public photo_upload_items access" on public.photo_upload_items for all using (false);
drop policy if exists "No public photo_upload_item_dogs access" on public.photo_upload_item_dogs;
create policy "No public photo_upload_item_dogs access" on public.photo_upload_item_dogs for all using (false);
drop policy if exists "No public photo_upload_exports access" on public.photo_upload_exports;
create policy "No public photo_upload_exports access" on public.photo_upload_exports for all using (false);
drop policy if exists "No public photo_upload_export_items access" on public.photo_upload_export_items;
create policy "No public photo_upload_export_items access" on public.photo_upload_export_items for all using (false);
drop policy if exists "No public photo_upload_audit_log access" on public.photo_upload_audit_log;
create policy "No public photo_upload_audit_log access" on public.photo_upload_audit_log for all using (false);

insert into public.admin_permissions (key, label) values
  ('manage_photo_upload_queue', 'Manage Gingr Photo Upload Queue'),
  ('reopen_photo_upload_batches', 'Reopen completed photo upload batches'),
  ('manage_photo_upload_settings', 'Manage photo upload categories and yards')
on conflict (key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-uploads',
  'photo-uploads',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
    'application/zip'
  ]::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;
