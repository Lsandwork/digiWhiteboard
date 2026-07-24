-- Vet Visits ledger for admin/management owner follow-up tracking.

create table if not exists public.vet_visits (
  id uuid primary key default gen_random_uuid(),
  visit_number text not null,
  occurred_at timestamptz not null default now(),
  dog_name text not null,
  dog_breed text,
  owner_name text not null default '',
  reason text not null default '',
  vet_clinic text not null default '',
  reported_by text not null default '',
  reported_by_user_id uuid references public.admin_users(id) on delete set null,
  receipt_url text,
  receipt_label text,
  bill_total_cents integer not null default 0,
  paid_by text not null default 'fitdog' check (paid_by in ('fitdog', 'owner')),
  owner_follow_up_status text not null default 'pending'
    check (owner_follow_up_status in ('pending', 'due', 'completed')),
  owner_follow_up_due_at date,
  owner_follow_up_completed_at timestamptz,
  management_status text not null default 'in_progress'
    check (management_status in ('in_progress', 'resolved')),
  assigned_to_user_id uuid references public.admin_users(id) on delete set null,
  assigned_to_name text,
  linked_owner_follow_up_id text,
  notes text not null default '',
  latest_update text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists vet_visits_visit_number_uidx on public.vet_visits (visit_number);
create index if not exists vet_visits_occurred_at_idx on public.vet_visits (occurred_at desc);
create index if not exists vet_visits_management_status_idx on public.vet_visits (management_status);
create index if not exists vet_visits_owner_follow_up_status_idx on public.vet_visits (owner_follow_up_status);

drop trigger if exists set_vet_visits_updated_at on public.vet_visits;
create trigger set_vet_visits_updated_at
  before update on public.vet_visits
  for each row execute function public.set_updated_at();

alter table public.vet_visits enable row level security;

drop policy if exists "No public vet_visits" on public.vet_visits;
create policy "No public vet_visits" on public.vet_visits for all using (false);
