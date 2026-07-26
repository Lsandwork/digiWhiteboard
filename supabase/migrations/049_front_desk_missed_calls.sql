-- Front Desk Missed Calls: Vonage call/voicemail emails ingested from Gmail (lonnie@fitdog.com).

create table if not exists public.missed_call_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'manual')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  messages_scanned integer not null default 0,
  calls_created integer not null default 0,
  calls_updated integer not null default 0,
  error_count integer not null default 0,
  message text,
  error_details text,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists missed_call_sync_runs_started_idx
  on public.missed_call_sync_runs (started_at desc);

create table if not exists public.missed_calls (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  gmail_thread_id text,
  source text not null default 'vonage_email',
  call_type text not null default 'missed_call'
    check (call_type in ('missed_call', 'voicemail', 'other')),
  from_number text,
  from_name text,
  to_number text,
  subject text not null default '',
  snippet text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  received_at timestamptz not null,
  voicemail_url text,
  voicemail_storage_path text,
  voicemail_content_type text,
  voicemail_filename text,
  voicemail_byte_size integer,
  status text not null default 'new'
    check (status in ('new', 'listened', 'archived')),
  listened_at timestamptz,
  listened_by uuid references public.admin_users(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists missed_calls_received_idx
  on public.missed_calls (received_at desc);
create index if not exists missed_calls_status_idx
  on public.missed_calls (status, received_at desc);
create index if not exists missed_calls_from_number_idx
  on public.missed_calls (from_number);

alter table public.missed_calls enable row level security;
alter table public.missed_call_sync_runs enable row level security;

drop policy if exists missed_calls_deny_all on public.missed_calls;
create policy missed_calls_deny_all on public.missed_calls
  for all using (false) with check (false);

drop policy if exists missed_call_sync_runs_deny_all on public.missed_call_sync_runs;
create policy missed_call_sync_runs_deny_all on public.missed_call_sync_runs
  for all using (false) with check (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'missed-call-voicemails',
  'missed-call-voicemails',
  false,
  52428800,
  array[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/webm',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;
