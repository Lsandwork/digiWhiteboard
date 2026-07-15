-- Package Commissions ledger upgrade: normalized financial tables.
-- Backfill from admin_settings.settings.package_commissions.rows is done by the app.

-- ─── Rules ───────────────────────────────────────────────────────────────────

create table if not exists public.package_commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trainer_user_id uuid references public.admin_users(id) on delete set null,
  applies_to_all_trainers boolean not null default true,
  commission_type text not null default 'package_sale'
    check (commission_type in (
      'package_sale', 'group_class', 'private_session', 'evaluation',
      'add_on', 'bonus', 'adjustment', 'refund_reversal', 'other'
    )),
  package_or_class text,
  calculation_type text not null default 'percentage_of_gross'
    check (calculation_type in (
      'percentage_of_gross', 'percentage_after_discount', 'fixed_per_package',
      'fixed_per_class', 'fixed_per_attendee', 'fixed_per_session',
      'tiered_percentage', 'manual_amount', 'refund_reversal'
    )),
  rate_bps integer, -- basis points: 5000 = 50.00%
  fixed_amount_cents integer,
  tier_config jsonb not null default '[]'::jsonb,
  effective_start date not null default current_date,
  effective_end date,
  priority integer not null default 100,
  is_active boolean not null default true,
  requires_manual_approval boolean not null default false,
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists package_commission_rules_active_idx
  on public.package_commission_rules (is_active, priority, effective_start);

-- ─── Payroll periods ─────────────────────────────────────────────────────────

create table if not exists public.package_commission_payroll_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  payment_date date,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'under_review', 'ready_for_payroll', 'paid', 'locked')),
  created_by uuid references public.admin_users(id) on delete set null,
  closed_by uuid references public.admin_users(id) on delete set null,
  closed_at timestamptz,
  reopen_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists package_commission_payroll_periods_status_idx
  on public.package_commission_payroll_periods (status, start_date desc);

-- ─── Import batches ──────────────────────────────────────────────────────────

create table if not exists public.package_commission_import_batches (
  id uuid primary key default gen_random_uuid(),
  original_filename text not null,
  uploaded_by uuid references public.admin_users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  mapping_template jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  warning_rows integer not null default 0,
  failed_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  gross_total_cents bigint not null default 0,
  commission_total_cents bigint not null default 0,
  status text not null default 'completed'
    check (status in ('pending', 'validating', 'completed', 'held', 'undone')),
  storage_path text,
  notes text,
  undone_at timestamptz,
  undone_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Commission records (ledger) ─────────────────────────────────────────────

create table if not exists public.package_commission_records (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  trainer_user_id uuid references public.admin_users(id) on delete set null,
  trainer_name text not null default 'Unassigned',
  trainer_email text,
  sale_date date,
  service_date date,
  client_name text not null default '',
  dog_name text not null default '',
  commission_type text not null default 'package_sale'
    check (commission_type in (
      'package_sale', 'group_class', 'private_session', 'evaluation',
      'add_on', 'bonus', 'adjustment', 'refund_reversal', 'other'
    )),
  package_or_class text not null default '',
  quantity numeric(12, 2) not null default 1,
  gross_amount_cents integer not null default 0,
  discount_amount_cents integer not null default 0,
  refund_amount_cents integer not null default 0,
  commission_rate_bps integer,
  calculated_commission_cents integer not null default 0,
  final_commission_cents integer not null default 0,
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review', 'reviewed', 'disputed', 'resolved', 'rejected')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'on_hold')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'ready_for_payroll', 'scheduled', 'paid', 'voided')),
  refund_status text not null default 'none'
    check (refund_status in ('none', 'partial', 'full', 'pending')),
  source text not null default 'manual'
    check (source in ('manual', 'csv_import', 'adjustment', 'system')),
  gingr_transaction_url text not null default '',
  external_transaction_id text,
  payroll_period_id uuid references public.package_commission_payroll_periods(id) on delete set null,
  import_batch_id uuid references public.package_commission_import_batches(id) on delete set null,
  rule_id uuid references public.package_commission_rules(id) on delete set null,
  rule_snapshot jsonb,
  calculation_input jsonb,
  is_manual_override boolean not null default false,
  override_reason text,
  override_by uuid references public.admin_users(id) on delete set null,
  has_open_comments boolean not null default false,
  is_possible_duplicate boolean not null default false,
  missing_required_info boolean not null default false,
  validation_warnings jsonb not null default '[]'::jsonb,
  internal_notes text,
  parent_record_id uuid references public.package_commission_records(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by uuid references public.admin_users(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references public.admin_users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists package_commission_records_trainer_idx
  on public.package_commission_records (trainer_user_id, sale_date desc);
create index if not exists package_commission_records_sale_date_idx
  on public.package_commission_records (sale_date desc);
create index if not exists package_commission_records_service_date_idx
  on public.package_commission_records (service_date desc);
create index if not exists package_commission_records_approval_idx
  on public.package_commission_records (approval_status);
create index if not exists package_commission_records_payment_idx
  on public.package_commission_records (payment_status);
create index if not exists package_commission_records_refund_idx
  on public.package_commission_records (refund_status);
create index if not exists package_commission_records_review_idx
  on public.package_commission_records (review_status);
create index if not exists package_commission_records_payroll_idx
  on public.package_commission_records (payroll_period_id);
create index if not exists package_commission_records_batch_idx
  on public.package_commission_records (import_batch_id);
create index if not exists package_commission_records_open_comments_idx
  on public.package_commission_records (has_open_comments) where has_open_comments;
create index if not exists package_commission_records_updated_idx
  on public.package_commission_records (updated_at desc);
create index if not exists package_commission_records_client_dog_idx
  on public.package_commission_records (client_name, dog_name);

-- ─── Import row errors ───────────────────────────────────────────────────────

create table if not exists public.package_commission_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.package_commission_import_batches(id) on delete cascade,
  row_number integer not null,
  severity text not null default 'error' check (severity in ('error', 'warning', 'duplicate')),
  message text not null,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists package_commission_import_errors_batch_idx
  on public.package_commission_import_errors (batch_id, severity);

-- ─── Cell comment threads ────────────────────────────────────────────────────

create table if not exists public.package_commission_comment_threads (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.package_commission_records(id) on delete cascade,
  field_name text not null,
  field_value_at_comment text,
  status text not null default 'open'
    check (status in ('open', 'waiting_trainer', 'waiting_management', 'resolved')),
  created_by uuid references public.admin_users(id) on delete set null,
  created_by_role text,
  resolved_by uuid references public.admin_users(id) on delete set null,
  resolved_at timestamptz,
  resolution_code text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists package_commission_comment_threads_record_idx
  on public.package_commission_comment_threads (record_id, status);
create index if not exists package_commission_comment_threads_open_idx
  on public.package_commission_comment_threads (status) where status <> 'resolved';

create table if not exists public.package_commission_comment_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.package_commission_comment_threads(id) on delete cascade,
  body text not null,
  author_user_id uuid references public.admin_users(id) on delete set null,
  author_role text,
  author_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists package_commission_comment_replies_thread_idx
  on public.package_commission_comment_replies (thread_id, created_at);

-- ─── Adjustments / refunds ───────────────────────────────────────────────────

create table if not exists public.package_commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  original_record_id uuid not null references public.package_commission_records(id) on delete cascade,
  adjustment_record_id uuid references public.package_commission_records(id) on delete set null,
  adjustment_type text not null default 'refund'
    check (adjustment_type in ('refund', 'partial_refund', 'reversal', 'bonus', 'correction')),
  amount_cents integer not null,
  refund_percent_bps integer,
  refund_date date,
  reason text not null default '',
  external_reference text,
  created_by uuid references public.admin_users(id) on delete set null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  payroll_period_id uuid references public.package_commission_payroll_periods(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists package_commission_adjustments_original_idx
  on public.package_commission_adjustments (original_record_id);

-- ─── Audit events (immutable) ────────────────────────────────────────────────

create table if not exists public.package_commission_audit_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references public.package_commission_records(id) on delete set null,
  entity_type text not null default 'record',
  entity_id uuid,
  action text not null,
  field_name text,
  old_value text,
  new_value text,
  reason text,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_role text,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists package_commission_audit_events_record_idx
  on public.package_commission_audit_events (record_id, created_at desc);
create index if not exists package_commission_audit_events_created_idx
  on public.package_commission_audit_events (created_at desc);

-- ─── Statement acknowledgements ──────────────────────────────────────────────

create table if not exists public.package_commission_statement_acks (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.package_commission_payroll_periods(id) on delete cascade,
  trainer_user_id uuid not null references public.admin_users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (payroll_period_id, trainer_user_id)
);

-- ─── Triggers + RLS ──────────────────────────────────────────────────────────

drop trigger if exists set_package_commission_rules_updated_at on public.package_commission_rules;
create trigger set_package_commission_rules_updated_at
  before update on public.package_commission_rules
  for each row execute function public.set_updated_at();

drop trigger if exists set_package_commission_payroll_periods_updated_at on public.package_commission_payroll_periods;
create trigger set_package_commission_payroll_periods_updated_at
  before update on public.package_commission_payroll_periods
  for each row execute function public.set_updated_at();

drop trigger if exists set_package_commission_import_batches_updated_at on public.package_commission_import_batches;
create trigger set_package_commission_import_batches_updated_at
  before update on public.package_commission_import_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_package_commission_records_updated_at on public.package_commission_records;
create trigger set_package_commission_records_updated_at
  before update on public.package_commission_records
  for each row execute function public.set_updated_at();

drop trigger if exists set_package_commission_comment_threads_updated_at on public.package_commission_comment_threads;
create trigger set_package_commission_comment_threads_updated_at
  before update on public.package_commission_comment_threads
  for each row execute function public.set_updated_at();

alter table public.package_commission_rules enable row level security;
alter table public.package_commission_payroll_periods enable row level security;
alter table public.package_commission_import_batches enable row level security;
alter table public.package_commission_records enable row level security;
alter table public.package_commission_import_errors enable row level security;
alter table public.package_commission_comment_threads enable row level security;
alter table public.package_commission_comment_replies enable row level security;
alter table public.package_commission_adjustments enable row level security;
alter table public.package_commission_audit_events enable row level security;
alter table public.package_commission_statement_acks enable row level security;

-- Service-role only (matches walk_board / cast_tv patterns). Auth is enforced in Next.js API.

drop policy if exists "No public package_commission_rules" on public.package_commission_rules;
create policy "No public package_commission_rules" on public.package_commission_rules for all using (false);

drop policy if exists "No public package_commission_payroll_periods" on public.package_commission_payroll_periods;
create policy "No public package_commission_payroll_periods" on public.package_commission_payroll_periods for all using (false);

drop policy if exists "No public package_commission_import_batches" on public.package_commission_import_batches;
create policy "No public package_commission_import_batches" on public.package_commission_import_batches for all using (false);

drop policy if exists "No public package_commission_records" on public.package_commission_records;
create policy "No public package_commission_records" on public.package_commission_records for all using (false);

drop policy if exists "No public package_commission_import_errors" on public.package_commission_import_errors;
create policy "No public package_commission_import_errors" on public.package_commission_import_errors for all using (false);

drop policy if exists "No public package_commission_comment_threads" on public.package_commission_comment_threads;
create policy "No public package_commission_comment_threads" on public.package_commission_comment_threads for all using (false);

drop policy if exists "No public package_commission_comment_replies" on public.package_commission_comment_replies;
create policy "No public package_commission_comment_replies" on public.package_commission_comment_replies for all using (false);

drop policy if exists "No public package_commission_adjustments" on public.package_commission_adjustments;
create policy "No public package_commission_adjustments" on public.package_commission_adjustments for all using (false);

drop policy if exists "No public package_commission_audit_events" on public.package_commission_audit_events;
create policy "No public package_commission_audit_events" on public.package_commission_audit_events for all using (false);

drop policy if exists "No public package_commission_statement_acks" on public.package_commission_statement_acks;
create policy "No public package_commission_statement_acks" on public.package_commission_statement_acks for all using (false);
