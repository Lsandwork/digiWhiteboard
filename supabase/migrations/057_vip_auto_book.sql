-- VIP Auto Book: track owners/dogs that should always be booked on app.fitdog.com
-- (group classes, hikes, excursions) on a weekly or monthly cadence.

create table if not exists public.vip_auto_book_clients (
  id uuid primary key default gen_random_uuid(),
  fitdog_owner_id text,
  fitdog_dog_id text,
  owner_name text not null,
  owner_email text,
  owner_phone text,
  dog_name text not null,
  dog_breed text,
  service_kind text not null default 'group_class'
    check (service_kind in (
      'group_class',
      'adventure_hike',
      'beach_excursion',
      'trainer_led_hike',
      'taxi',
      'other'
    )),
  service_name text not null default '',
  cadence text not null default 'weekly'
    check (cadence in ('weekly', 'monthly', 'custom')),
  days_of_week integer[] not null default '{}'::integer[],
  monthly_week integer,
  preferred_time text,
  timezone text not null default 'America/Los_Angeles',
  starts_on date not null default (timezone('America/Los_Angeles', now()))::date,
  ends_on date,
  status text not null default 'active'
    check (status in ('active', 'paused', 'cancelled')),
  notes text not null default '',
  last_verified_at timestamptz,
  last_booked_for date,
  last_book_status text,
  last_book_error text,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vip_auto_book_clients_status_idx
  on public.vip_auto_book_clients (status);
create index if not exists vip_auto_book_clients_owner_name_idx
  on public.vip_auto_book_clients (owner_name);
create index if not exists vip_auto_book_clients_dog_name_idx
  on public.vip_auto_book_clients (dog_name);
create index if not exists vip_auto_book_clients_fitdog_owner_idx
  on public.vip_auto_book_clients (fitdog_owner_id);
create index if not exists vip_auto_book_clients_fitdog_dog_idx
  on public.vip_auto_book_clients (fitdog_dog_id);

create unique index if not exists vip_auto_book_clients_active_fitdog_dog_service_uidx
  on public.vip_auto_book_clients (fitdog_dog_id, service_kind, cadence)
  where status = 'active' and fitdog_dog_id is not null;

drop trigger if exists set_vip_auto_book_clients_updated_at on public.vip_auto_book_clients;
create trigger set_vip_auto_book_clients_updated_at
  before update on public.vip_auto_book_clients
  for each row execute function public.set_updated_at();

alter table public.vip_auto_book_clients enable row level security;

drop policy if exists "No public vip_auto_book_clients" on public.vip_auto_book_clients;
create policy "No public vip_auto_book_clients"
  on public.vip_auto_book_clients for all using (false);

create table if not exists public.vip_auto_book_directory_sync (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'error')),
  owners_upserted integer not null default 0,
  dogs_upserted integer not null default 0,
  dates_scanned text[] not null default '{}'::text[],
  message text,
  error text
);

alter table public.vip_auto_book_directory_sync enable row level security;

drop policy if exists "No public vip_auto_book_directory_sync" on public.vip_auto_book_directory_sync;
create policy "No public vip_auto_book_directory_sync"
  on public.vip_auto_book_directory_sync for all using (false);

create index if not exists fitdog_customers_owner_name_ilike_idx
  on public.fitdog_customers (lower(owner_name));
create index if not exists fitdog_dogs_dog_name_ilike_idx
  on public.fitdog_dogs (lower(dog_name));
