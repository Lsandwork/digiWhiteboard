-- Persistent 30-day lobby checkout fun-fact history.
-- Joke selection is additive enhancement: lobby must still work if this table is missing.

create table if not exists public.checkout_fun_fact_history (
  id uuid primary key default gen_random_uuid(),
  dog_key text not null,
  joke_id text not null,
  shown_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (dog_key, joke_id)
);

create index if not exists checkout_fun_fact_history_dog_shown_idx
  on public.checkout_fun_fact_history (dog_key, shown_at desc);

create index if not exists checkout_fun_fact_history_shown_at_idx
  on public.checkout_fun_fact_history (shown_at);

grant select, insert, update, delete on table public.checkout_fun_fact_history to service_role;

alter table public.checkout_fun_fact_history enable row level security;

drop policy if exists "No public checkout fun fact history access" on public.checkout_fun_fact_history;
create policy "No public checkout fun fact history access"
  on public.checkout_fun_fact_history for all using (false) with check (false);
