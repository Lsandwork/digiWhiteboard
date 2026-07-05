-- Grooming push notices for Staff Digital Whiteboard handler alerts

create table if not exists public.grooming_push_notices (
  id uuid primary key default gen_random_uuid(),
  dog_id text,
  dog_name text not null,
  dog_photo_url text,
  owner_name text,
  owner_initial text,
  service text not null,
  groomer_name text not null,
  action text not null default 'Bring to Catch',
  notes text,
  safety_tags text[] default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'cleared', 'expired')),
  requested_by text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  cleared_at timestamptz,
  cleared_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grooming_push_notices_status_idx
  on public.grooming_push_notices (status, requested_at asc);

create index if not exists grooming_push_notices_requested_at_idx
  on public.grooming_push_notices (requested_at desc);

create index if not exists grooming_push_notices_expires_at_idx
  on public.grooming_push_notices (expires_at asc)
  where status = 'active';

drop trigger if exists set_grooming_push_notices_updated_at on public.grooming_push_notices;
create trigger set_grooming_push_notices_updated_at
  before update on public.grooming_push_notices
  for each row
  execute function public.set_updated_at();

alter table public.grooming_push_notices enable row level security;

drop policy if exists "No public grooming push notices access" on public.grooming_push_notices;
create policy "No public grooming push notices access"
  on public.grooming_push_notices
  for all
  using (false);

do $$
begin
  alter publication supabase_realtime add table public.grooming_push_notices;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
