-- Package Group Walks — complimentary daily group walk for dogs whose owner holds
-- an eligible Gingr package (Monthly Unlimited / 20-Day PLUS Package).
--
-- Design note: only COMPLETION records are stored. "Pending" is derived at read time
-- from live Gingr check-in state so a stored row can never keep a checked-out dog on
-- the board. That keeps Gingr the single source of truth for check-in and prevents
-- one row per eligible dog per sync.

create table if not exists public.package_group_walks (
  id uuid primary key default gen_random_uuid(),

  -- Fitdog business date (America/Los_Angeles), never UTC-truncated.
  business_date date not null,
  walk_type text not null default 'package_group_walk'
    check (walk_type in ('package_group_walk')),

  -- Gingr canonical identifiers + display snapshots (dogs get renamed; history must not shift).
  gingr_animal_id text not null check (char_length(trim(gingr_animal_id)) > 0),
  dog_name text not null,
  gingr_owner_id text,
  owner_name text,
  gingr_reservation_id text,
  gingr_checked_in_at timestamptz,

  -- Eligible package that granted the walk.
  package_key text not null check (package_key in ('monthly_unlimited', 'twenty_day_plus')),
  package_name text not null,
  gingr_package_id text,

  status text not null default 'completed' check (status in ('completed', 'voided')),
  completed_at timestamptz not null default now(),
  completed_by_user_id uuid references public.admin_users(id) on delete set null,
  completed_by_user_name text not null,
  completed_by_user_email text,
  source text not null default 'ruffops_web',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One complimentary walk per qualifying dog per business day.
-- Enforces idempotency across double clicks, concurrent users, sync retries,
-- duplicate Gingr payloads, and same-day re-check-in.
create unique index if not exists package_group_walks_unique_completion_idx
  on public.package_group_walks (business_date, gingr_animal_id, walk_type)
  where status = 'completed';

-- Completed Today list + whiteboard overlay (business_date = today).
create index if not exists package_group_walks_business_date_idx
  on public.package_group_walks (business_date desc, completed_at desc);

-- Per-dog history ("Aug 19 completed by Julie, Aug 20 by Lane").
create index if not exists package_group_walks_animal_history_idx
  on public.package_group_walks (gingr_animal_id, business_date desc);

drop trigger if exists set_package_group_walks_updated_at on public.package_group_walks;
create trigger set_package_group_walks_updated_at
  before update on public.package_group_walks
  for each row execute function public.set_updated_at();

-- App reads/writes through the service role only (same as every other RuffOps table).
alter table public.package_group_walks enable row level security;

drop policy if exists "No public package group walks access" on public.package_group_walks;
create policy "No public package group walks access"
  on public.package_group_walks for all using (false) with check (false);

revoke all on table public.package_group_walks from public;
grant select, insert, update, delete on table public.package_group_walks to service_role;

-- Realtime so the Package Group Walks page updates for every signed-in user
-- the moment anyone marks a walk completed.
do $$
begin
  alter publication supabase_realtime add table public.package_group_walks;
exception
  when duplicate_object then null;
end $$;
