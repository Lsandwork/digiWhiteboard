create table if not exists public.lobby_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  category text,
  icon_key text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lobby_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_at timestamptz,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lobby_settings (
  id text primary key default 'default',
  max_queue_count integer not null default 6,
  refresh_interval_ms integer not null default 15000,
  show_promotions boolean not null default true,
  show_events boolean not null default true,
  footer_message text,
  lobby_message text,
  updated_at timestamptz not null default now()
);

create index if not exists lobby_promotions_active_sort_idx
  on public.lobby_promotions(active, sort_order);

create index if not exists lobby_events_active_sort_idx
  on public.lobby_events(active, sort_order);

insert into public.lobby_settings (id)
values ('default')
on conflict (id) do nothing;

insert into public.lobby_promotions (title, subtitle, category, icon_key, sort_order)
values
  ('Grooming & Spa', 'Pamper your pup with a fresh coat and calm care.', 'service', 'scissors', 1),
  ('Training & Behavior', 'Build confidence with positive, play-based coaching.', 'service', 'training', 2),
  ('Enrichment Classes', 'Fun classes that keep minds and tails moving.', 'service', 'puzzle', 3),
  ('Transportation Service', 'Safe rides to and from Fitdog when you need us.', 'service', 'transport', 4),
  ('Daycare Membership', 'More play days, more connection, more tail wags.', 'service', 'paw', 5),
  ('Boarding', 'Comfortable stays with the Fitdog family.', 'service', 'boarding', 6)
on conflict do nothing;

insert into public.lobby_events (title, description, event_at, sort_order)
values
  ('Puppy Social Hour', 'Meet other pups and practice polite play.', now() + interval '3 days', 1),
  ('Dog Parent Workshop', 'Tips and tools for happier walks and routines.', now() + interval '7 days', 2),
  ('Loose Leash Walking 101', 'Learn easy techniques for smoother strolls.', now() + interval '10 days', 3),
  ('Spa Day Sundays', 'Relaxing spa add-ons for members.', now() + interval '14 days', 4),
  ('Member Special', 'Ask the front desk about this month''s perks.', now() + interval '21 days', 5)
on conflict do nothing;

alter table public.lobby_promotions enable row level security;
alter table public.lobby_events enable row level security;
alter table public.lobby_settings enable row level security;

drop policy if exists "No public lobby promotions access" on public.lobby_promotions;
create policy "No public lobby promotions access"
on public.lobby_promotions
for all
using (false);

drop policy if exists "No public lobby events access" on public.lobby_events;
create policy "No public lobby events access"
on public.lobby_events
for all
using (false);

drop policy if exists "No public lobby settings access" on public.lobby_settings;
create policy "No public lobby settings access"
on public.lobby_settings
for all
using (false);
