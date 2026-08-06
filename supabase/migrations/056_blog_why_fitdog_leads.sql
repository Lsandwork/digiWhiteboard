create table if not exists blog_why_fitdog_leads (
  id uuid primary key default gen_random_uuid(),
  owner_first_name text not null,
  email text not null,
  phone text,
  dog_name text not null,
  dog_age_range text,
  primary_goal text,
  service_interest text not null,
  preferred_contact text,
  message text,
  consent_at timestamptz not null,
  source text not null default 'why_fitdog',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  ip_hash text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists blog_why_fitdog_leads_created_idx on blog_why_fitdog_leads (created_at desc);
create index if not exists blog_why_fitdog_leads_email_idx on blog_why_fitdog_leads (email);

alter table blog_why_fitdog_leads enable row level security;
