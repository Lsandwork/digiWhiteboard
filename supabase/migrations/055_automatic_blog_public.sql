-- Automatic Blog public extensions: categories, subscribers, promotions, bookmarks, featured flag.

alter table if exists blog_articles
  add column if not exists featured boolean not null default false,
  add column if not exists reading_minutes integer,
  add column if not exists category_slug text,
  add column if not exists cover_image_path text;

create table if not exists blog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists blog_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists blog_article_tags (
  article_id uuid not null references blog_articles(id) on delete cascade,
  tag_id uuid not null references blog_tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create table if not exists blog_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'pending')),
  source text not null default 'blog_public',
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null default '',
  cta_label text not null default 'Claim Offer',
  cta_url text not null default 'https://www.fitdog.com',
  terms text not null default '',
  eligibility text not null default '',
  service_restrictions text not null default '',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default false,
  approved boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_bookmarks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references blog_articles(id) on delete cascade,
  user_key text not null,
  created_at timestamptz not null default now(),
  unique (article_id, user_key)
);

create table if not exists blog_authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  bio text not null default '',
  public_profile boolean not null default true,
  created_at timestamptz not null default now()
);

insert into blog_categories (slug, label, sort_order) values
  ('puppy-care', 'Puppy Care', 10),
  ('training', 'Training', 20),
  ('daycare', 'Daycare', 30),
  ('boarding', 'Boarding', 40),
  ('grooming', 'Grooming', 50),
  ('enrichment', 'Enrichment', 60),
  ('adventures', 'Adventures', 70),
  ('seasonal-safety', 'Seasonal Safety', 80),
  ('health-and-wellness', 'Health and Wellness', 90),
  ('local-guides', 'Local Guides', 100),
  ('fitdog-news', 'Fitdog News', 110)
on conflict (slug) do nothing;

insert into blog_authors (name, slug, bio)
values ('Fitdog Team', 'fitdog-team', 'Care guidance from the Fitdog team in Santa Monica and Los Angeles.')
on conflict (slug) do nothing;

-- Default promotion is NOT approved/active — UI falls back to service CTA until Super Admin enables a real offer.
insert into blog_promotions (title, subtitle, cta_label, cta_url, terms, active, approved)
select
  '20% OFF YOUR FIRST DAY!',
  'New client offer — confirm eligibility with Fitdog before redeeming.',
  'Claim Offer',
  'https://www.fitdog.com',
  'Must be approved by Super Admin before public display. Restrictions apply.',
  false,
  false
where not exists (select 1 from blog_promotions);
