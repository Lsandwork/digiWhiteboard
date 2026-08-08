-- Gingr reservation sync for VIP Auto Book last-day-booked confirm/correct.

alter table public.vip_auto_book_clients
  add column if not exists gingr_animal_id text,
  add column if not exists gingr_owner_id text;

create index if not exists vip_auto_book_clients_gingr_animal_idx
  on public.vip_auto_book_clients (gingr_animal_id)
  where gingr_animal_id is not null;

create table if not exists public.vip_auto_book_gingr_sync (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'error')),
  dates_scanned text[] not null default '{}'::text[],
  clients_checked integer not null default 0,
  clients_confirmed integer not null default 0,
  clients_corrected integer not null default 0,
  clients_unmatched integer not null default 0,
  message text,
  error text
);

alter table public.vip_auto_book_gingr_sync enable row level security;

drop policy if exists "No public vip_auto_book_gingr_sync" on public.vip_auto_book_gingr_sync;
create policy "No public vip_auto_book_gingr_sync"
  on public.vip_auto_book_gingr_sync for all using (false);
