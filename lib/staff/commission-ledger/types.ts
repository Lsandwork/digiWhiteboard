export type CommissionType =
  | "package_sale"
  | "group_class"
  | "private_session"
  | "evaluation"
  | "add_on"
  | "bonus"
  | "adjustment"
  | "refund_reversal"
  | "other";

export type ReviewStatus = "needs_review" | "reviewed" | "disputed" | "resolved" | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "on_hold";
export type PaymentStatus = "unpaid" | "ready_for_payroll" | "scheduled" | "paid" | "voided";
export type RefundStatus = "none" | "partial" | "full" | "pending";
export type CommissionSource = "manual" | "csv_import" | "adjustment" | "system";
export type CommentThreadStatus = "open" | "waiting_trainer" | "waiting_management" | "resolved";
export type PayrollPeriodStatus =
  | "draft"
  | "open"
  | "under_review"
  | "ready_for_payroll"
  | "paid"
  | "locked";

export type CalculationType =
  | "percentage_of_gross"
  | "percentage_after_discount"
  | "fixed_per_package"
  | "fixed_per_class"
  | "fixed_per_attendee"
  | "fixed_per_session"
  | "tiered_percentage"
  | "manual_amount"
  | "refund_reversal";

export type CommentableField =
  | "trainer"
  | "sale_date"
  | "service_date"
  | "client"
  | "dog"
  | "package_or_class"
  | "quantity"
  | "gross_amount"
  | "commission_rate"
  | "calculated_commission"
  | "final_commission"
  | "refund_status";

export type PackageCommissionRecord = {
  id: string;
  legacy_id: string | null;
  trainer_user_id: string | null;
  trainer_name: string;
  trainer_email: string | null;
  sale_date: string | null;
  service_date: string | null;
  client_name: string;
  dog_name: string;
  commission_type: CommissionType;
  package_or_class: string;
  quantity: number;
  gross_amount_cents: number;
  discount_amount_cents: number;
  refund_amount_cents: number;
  commission_rate_bps: number | null;
  calculated_commission_cents: number;
  final_commission_cents: number;
  review_status: ReviewStatus;
  approval_status: ApprovalStatus;
  payment_status: PaymentStatus;
  refund_status: RefundStatus;
  source: CommissionSource;
  gingr_transaction_url: string;
  external_transaction_id: string | null;
  payroll_period_id: string | null;
  import_batch_id: string | null;
  rule_id: string | null;
  rule_snapshot: Record<string, unknown> | null;
  calculation_input: Record<string, unknown> | null;
  is_manual_override: boolean;
  override_reason: string | null;
  override_by: string | null;
  has_open_comments: boolean;
  is_possible_duplicate: boolean;
  missing_required_info: boolean;
  validation_warnings: unknown[];
  internal_notes: string | null;
  parent_record_id: string | null;
  archived_at: string | null;
  created_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CommissionListFilters = {
  q?: string;
  trainerIds?: string[];
  dateField?: "sale_date" | "service_date" | "created_at" | "confirmed_at" | "paid_at";
  dateFrom?: string;
  dateTo?: string;
  reviewStatus?: ReviewStatus[];
  approvalStatus?: ApprovalStatus[];
  paymentStatus?: PaymentStatus[];
  refundStatus?: RefundStatus[];
  commissionTypes?: CommissionType[];
  client?: string;
  dog?: string;
  packageOrClass?: string;
  importBatchId?: string;
  payrollPeriodId?: string;
  source?: CommissionSource[];
  hasComments?: boolean;
  hasOpenComments?: boolean;
  missingRequired?: boolean;
  possibleDuplicate?: boolean;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export type CommissionListResult = {
  rows: PackageCommissionRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: CommissionSummary;
};

export type CommissionSummary = {
  grossSalesCents: number;
  totalCommissionsCents: number;
  pendingReviewCents: number;
  approvedCents: number;
  readyForPayrollCents: number;
  paidCents: number;
  refundedCents: number;
  openQuestions: number;
};

export type CommissionActor = {
  adminUserId?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  roleKey?: string | null;
};

export type CommissionViewer = {
  role?: string | null;
  roleKey?: string | null;
  email?: string | null;
  adminUserId?: string | null;
  canManage?: boolean;
  canComment?: boolean;
  isSuperAdmin?: boolean;
  isTrainerOnly?: boolean;
};

export const COMMENTABLE_FIELDS: CommentableField[] = [
  "trainer",
  "sale_date",
  "service_date",
  "client",
  "dog",
  "package_or_class",
  "quantity",
  "gross_amount",
  "commission_rate",
  "calculated_commission",
  "final_commission",
  "refund_status"
];

export const RESOLUTION_CODES = [
  "value_corrected",
  "rule_confirmed",
  "duplicate_removed",
  "trainer_reassigned",
  "refund_confirmed",
  "credited_other_period",
  "no_adjustment_required",
  "other"
] as const;

export type ResolutionCode = (typeof RESOLUTION_CODES)[number];
