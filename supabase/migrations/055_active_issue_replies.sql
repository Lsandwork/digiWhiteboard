-- Shared update / comment thread for Active Issues (parity with crossover_message_replies).
-- Runtime staff-ops state is still JSON-backed; this table documents the shape for future relational storage.

create table if not exists public.active_issue_replies (
  id uuid primary key default gen_random_uuid(),
  active_issue_id uuid not null references public.active_issues(id) on delete cascade,
  message text not null,
  update_type text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists active_issue_replies_issue_idx
  on public.active_issue_replies (active_issue_id, created_at desc);
