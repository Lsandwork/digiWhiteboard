export const FITDOG_ALERT_TYPES = [
  "PAYMENT_FAILED",
  "PAYMENT_MISSED",
  "CARD_DECLINED",
  "CARD_EXPIRED",
  "CARD_MISSING",
  "PAYMENT_PROCESSING_ERROR",
  "PAYMENT_RETRY_FAILED",
  "OUTSTANDING_BALANCE",
  "PAYMENT_RESOLVED",
  "FITDOG_SYNC_ERROR"
] as const;

export type FitdogAlertType = (typeof FITDOG_ALERT_TYPES)[number];

export const FITDOG_ALERT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type FitdogAlertSeverity = (typeof FITDOG_ALERT_SEVERITIES)[number];

export const OPERATIONS_ALERT_STATUSES = [
  "new",
  "acknowledged",
  "assigned",
  "owner_contacted",
  "awaiting_payment",
  "follow_up_scheduled",
  "paid",
  "waived",
  "false_positive",
  "resolved",
  "reopened"
] as const;
export type OperationsAlertStatus = (typeof OPERATIONS_ALERT_STATUSES)[number];

export const OPEN_ALERT_STATUSES: OperationsAlertStatus[] = [
  "new",
  "acknowledged",
  "assigned",
  "owner_contacted",
  "awaiting_payment",
  "follow_up_scheduled",
  "reopened"
];

export type FitdogIntegrationMode = "api" | "webhook" | "playwright";

export type FitdogSyncTrigger = "cron" | "manual" | "webhook" | "backfill" | "reconciliation" | "resume";
export type FitdogSyncMode = "incremental" | "backfill" | "reconciliation" | "webhook";
export type FitdogSyncStatus = "running" | "completed" | "failed" | "skipped" | "interrupted";

export type FitdogIntegrationSettings = {
  id: string;
  integration_mode: FitdogIntegrationMode;
  sync_enabled: boolean;
  missed_payment_grace_minutes: number;
  backfill_days: number;
  reconciliation_days: number;
  incremental_interval_minutes: number;
  encrypted_session: Record<string, unknown>;
  last_successful_sync_at: string | null;
  last_backfill_at: string | null;
  last_reconciliation_at: string | null;
  cursor: Record<string, unknown>;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type FitdogSyncRun = {
  id: string;
  trigger: FitdogSyncTrigger;
  mode: FitdogSyncMode;
  status: FitdogSyncStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  records_scanned: number;
  alerts_created: number;
  alerts_updated: number;
  alerts_resolved: number;
  error_count: number;
  retry_count: number;
  message: string | null;
  error_details: string | null;
  checkpoint: Record<string, unknown>;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
};

export type OperationsAlert = {
  id: string;
  source: string;
  source_event_id: string | null;
  source_record_id: string | null;
  idempotency_key: string;
  alert_type: FitdogAlertType;
  severity: FitdogAlertSeverity;
  owner_id: string | null;
  owner_name: string;
  dog_id: string | null;
  dog_name: string | null;
  reservation_id: string | null;
  invoice_id: string | null;
  transaction_id: string | null;
  service_name: string | null;
  service_date: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  failure_reason: string | null;
  payment_attempt_count: number;
  payment_method_brand: string | null;
  payment_method_last_four: string | null;
  status: OperationsAlertStatus;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  follow_up_at: string | null;
  resolution_type: string | null;
  resolution_notes: string | null;
  package_credit_check: Record<string, unknown>;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationsAlertActivity = {
  id: string;
  alert_id: string;
  activity_type: string;
  message: string;
  metadata: Record<string, unknown>;
  actor_user_id: string | null;
  actor_name: string | null;
  created_at: string;
};

export type OperationsAlertAssignment = {
  id: string;
  alert_id: string;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_by_user_id: string | null;
  assigned_by_name: string | null;
  note: string | null;
  created_at: string;
};

export type FitdogPaymentTransaction = {
  id?: string;
  fitdog_transaction_id: string;
  fitdog_owner_id?: string | null;
  fitdog_dog_id?: string | null;
  fitdog_reservation_id?: string | null;
  fitdog_invoice_id?: string | null;
  status: string;
  amount: number;
  currency?: string;
  failure_reason?: string | null;
  payment_method_brand?: string | null;
  payment_method_last_four?: string | null;
  attempt_number?: number;
  attempted_at?: string | null;
  succeeded_at?: string | null;
  source_url?: string | null;
  raw?: Record<string, unknown>;
};

export type FitdogServiceRecord = {
  id?: string;
  fitdog_service_id: string;
  fitdog_reservation_id?: string | null;
  fitdog_owner_id?: string | null;
  fitdog_dog_id?: string | null;
  owner_name?: string | null;
  dog_name?: string | null;
  service_name: string;
  service_date?: string | null;
  completed_at?: string | null;
  attended?: boolean;
  amount_due?: number;
  currency?: string;
  covered_by_package?: boolean;
  covered_by_credit?: boolean;
  complimentary?: boolean;
  discounted?: boolean;
  waived?: boolean;
  adjustment_notes?: string | null;
  source_url?: string | null;
  raw?: Record<string, unknown>;
};

export type FitdogInvoiceRecord = {
  fitdog_invoice_id: string;
  fitdog_owner_id?: string | null;
  fitdog_dog_id?: string | null;
  fitdog_reservation_id?: string | null;
  status?: string | null;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  due_at?: string | null;
  paid_at?: string | null;
  source_url?: string | null;
  raw?: Record<string, unknown>;
};

export type NormalizedFitdogEvent = {
  source_event_id?: string | null;
  event_type: string;
  owner_id?: string | null;
  owner_name?: string | null;
  dog_id?: string | null;
  dog_name?: string | null;
  reservation_id?: string | null;
  invoice_id?: string | null;
  transaction_id?: string | null;
  service_name?: string | null;
  service_date?: string | null;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  failure_reason?: string | null;
  payment_attempt_count?: number;
  payment_method_brand?: string | null;
  payment_method_last_four?: string | null;
  status?: string | null;
  source_url?: string | null;
  covered_by_package?: boolean;
  covered_by_credit?: boolean;
  complimentary?: boolean;
  waived?: boolean;
  discounted?: boolean;
  attended?: boolean;
  completed_at?: string | null;
  raw?: Record<string, unknown>;
};

export type FitdogSyncSnapshot = {
  customers?: Array<{
    fitdog_owner_id: string;
    owner_name: string;
    email?: string | null;
    phone?: string | null;
    source_url?: string | null;
    raw?: Record<string, unknown>;
  }>;
  dogs?: Array<{
    fitdog_dog_id: string;
    fitdog_owner_id?: string | null;
    dog_name: string;
    breed?: string | null;
    source_url?: string | null;
    raw?: Record<string, unknown>;
  }>;
  reservations?: Array<{
    fitdog_reservation_id: string;
    fitdog_owner_id?: string | null;
    fitdog_dog_id?: string | null;
    service_name?: string | null;
    service_date?: string | null;
    status?: string | null;
    attendance_status?: string | null;
    completed_at?: string | null;
    amount_due?: number | null;
    currency?: string;
    covered_by_package?: boolean;
    covered_by_credit?: boolean;
    complimentary?: boolean;
    waived?: boolean;
    source_url?: string | null;
    raw?: Record<string, unknown>;
  }>;
  services?: FitdogServiceRecord[];
  invoices?: FitdogInvoiceRecord[];
  payments?: FitdogPaymentTransaction[];
  events?: NormalizedFitdogEvent[];
  checkpoint?: Record<string, unknown>;
  records_scanned?: number;
  parse_failures?: Array<{ source_url?: string | null; error: string; sanitized?: Record<string, unknown> }>;
};

export type OperationsAlertSummary = {
  new_alerts: number;
  failed_payments: number;
  missed_payments: number;
  outstanding_amount: number;
  resolved_today: number;
  unacknowledged: number;
  last_successful_sync_at: string | null;
};

export type OperationsAlertListFilters = {
  view?: "payment" | "all" | "resolved";
  q?: string;
  alertType?: FitdogAlertType | "all";
  status?: OperationsAlertStatus | "all";
  assignedUserId?: string | "all" | "unassigned";
  dateFrom?: string | null;
  dateTo?: string | null;
  owner?: string;
  dog?: string;
  service?: string;
  minAmount?: number | null;
  unassignedOnly?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};
