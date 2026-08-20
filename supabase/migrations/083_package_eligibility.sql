-- Outstanding Packages CSV eligibility for Package Group Walks.
-- Completions stay in package_group_walks. These tables hold the point-in-time
-- Gingr Outstanding Packages report, exact-name owner resolution, and Admin
-- mappings for ambiguous/unresolved CSV names.
--
-- No emails, phones, addresses, notes, or payment data are stored.

create table if not exists public.package_eligibility_imports (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  imported_by uuid references public.admin_users(id) on delete set null,
  imported_by_name text,
  filename text not null,
  row_count integer not null default 0 check (row_count >= 0),
  eligible_row_count integer not null default 0 check (eligible_row_count >= 0),
  monthly_unlimited_count integer not null default 0 check (monthly_unlimited_count >= 0),
  twenty_day_plus_count integer not null default 0 check (twenty_day_plus_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  mapped_count integer not null default 0 check (mapped_count >= 0),
  ambiguous_count integer not null default 0 check (ambiguous_count >= 0),
  unresolved_count integer not null default 0 check (unresolved_count >= 0),
  expired_count integer not null default 0 check (expired_count >= 0),
  zero_remaining_count integer not null default 0 check (zero_remaining_count >= 0),
  status text not null default 'complete'
    check (status in ('pending', 'complete', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists package_eligibility_imports_imported_at_idx
  on public.package_eligibility_imports (imported_at desc)
  where status = 'complete';

create table if not exists public.package_owner_mappings (
  id uuid primary key default gen_random_uuid(),
  normalized_owner_name text not null check (char_length(trim(normalized_owner_name)) > 0),
  gingr_owner_id text not null check (char_length(trim(gingr_owner_id)) > 0),
  status text not null default 'active' check (status in ('active', 'invalid')),
  invalid_reason text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_owner_name)
);

create index if not exists package_owner_mappings_owner_id_idx
  on public.package_owner_mappings (gingr_owner_id);

drop trigger if exists set_package_owner_mappings_updated_at on public.package_owner_mappings;
create trigger set_package_owner_mappings_updated_at
  before update on public.package_owner_mappings
  for each row execute function public.set_updated_at();

create table if not exists public.package_eligibility_records (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.package_eligibility_imports(id) on delete cascade,
  gingr_owner_id text,
  owner_display_name text not null,
  normalized_owner_name text not null,
  package_key text not null check (package_key in ('monthly_unlimited', 'twenty_day_plus')),
  package_type text not null,
  number_remaining numeric,
  expires_at date,
  purchased_at date,
  location text,
  expiration_was_blank boolean not null default false,
  exclusion_reason text check (exclusion_reason in ('expired', 'zero_remaining')),
  match_status text not null check (match_status in ('matched', 'ambiguous', 'unresolved', 'manual', 'skipped')),
  source text not null default 'csv',
  created_at timestamptz not null default now()
);

create index if not exists package_eligibility_records_import_idx
  on public.package_eligibility_records (import_id);

create index if not exists package_eligibility_records_owner_idx
  on public.package_eligibility_records (gingr_owner_id)
  where gingr_owner_id is not null and exclusion_reason is null;

create index if not exists package_eligibility_records_review_idx
  on public.package_eligibility_records (import_id, match_status)
  where exclusion_reason is null and match_status in ('ambiguous', 'unresolved');

create index if not exists package_eligibility_records_name_idx
  on public.package_eligibility_records (normalized_owner_name);

alter table public.package_eligibility_imports enable row level security;
alter table public.package_eligibility_records enable row level security;
alter table public.package_owner_mappings enable row level security;

drop policy if exists "No public package eligibility imports access" on public.package_eligibility_imports;
create policy "No public package eligibility imports access"
  on public.package_eligibility_imports for all using (false) with check (false);

drop policy if exists "No public package eligibility records access" on public.package_eligibility_records;
create policy "No public package eligibility records access"
  on public.package_eligibility_records for all using (false) with check (false);

drop policy if exists "No public package owner mappings access" on public.package_owner_mappings;
create policy "No public package owner mappings access"
  on public.package_owner_mappings for all using (false) with check (false);

revoke all on table public.package_eligibility_imports from public;
revoke all on table public.package_eligibility_records from public;
revoke all on table public.package_owner_mappings from public;

grant select, insert, update, delete on table public.package_eligibility_imports to service_role;
grant select, insert, update, delete on table public.package_eligibility_records to service_role;
grant select, insert, update, delete on table public.package_owner_mappings to service_role;
