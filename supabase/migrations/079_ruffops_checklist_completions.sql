-- Shared RuffOps Checklist completions for Team Leads, Managers, and Admins.
-- One list: if anyone checks an item, everyone sees the timestamp and name.

create table if not exists public.ops_checklist_completions (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  source text not null check (source in ('gingr', 'reminder', 'walks', 'alert')),
  source_id text not null,
  shift_date date not null,
  completed_at timestamptz not null default now(),
  completed_by uuid references public.admin_users(id) on delete set null,
  completed_by_name text,
  undone_at timestamptz,
  undone_by uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops_checklist_completions_shift_idx
  on public.ops_checklist_completions (shift_date desc, completed_at desc);

create index if not exists ops_checklist_completions_active_idx
  on public.ops_checklist_completions (shift_date, source)
  where undone_at is null;

drop trigger if exists set_ops_checklist_completions_updated_at on public.ops_checklist_completions;
create trigger set_ops_checklist_completions_updated_at
  before update on public.ops_checklist_completions
  for each row execute function public.set_updated_at();

alter table public.ops_checklist_completions enable row level security;

drop policy if exists "No public ops checklist completions access" on public.ops_checklist_completions;
create policy "No public ops checklist completions access"
  on public.ops_checklist_completions for all using (false) with check (false);
