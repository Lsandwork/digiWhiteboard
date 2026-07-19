type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import type { OwnerComplaintCategory } from "@/lib/staff/push-notices";
import { getOwnerComplaintCategoryLabel } from "@/lib/staff/push-notices";

export type ManagementReportStatus = "Open" | "Needs Review" | "Reviewed" | "Closed";

export type ManagementReportType =
  | "owner_complaint_dog_handler"
  | "employee_write_up"
  | "groomer_complaint"
  | "groomer_request"
  | "trainer_complaint"
  | "trainer_request"
  | "team_lead_request";

import type { PreviousWarningRow, WarningNoticeViolationType } from "@/lib/staff/warning-notice-constants";

export type EmployeeWriteUpDetails = {
  employee_name: string;
  employee_department: string;
  violation_date: string;
  violation_time: string | null;
  documented_by: string | null;
  violation_types: WarningNoticeViolationType[];
  violation_other: string | null;
  statement_of_violation: string;
  employee_statement: string | null;
  date_of_warning: string | null;
  type_of_warning: string | null;
  employee_number: string | null;
  previous_warnings: PreviousWarningRow[];
  action_to_be_taken: string | null;
  employee_signature: string | null;
  employee_signature_date: string | null;
  manager_signature: string | null;
  manager_signature_date: string | null;
  text_report: string | null;
  pdf_filename: string | null;
  pdf_generated_at: string | null;
  hr_tracked: boolean;
  /** Legacy fields retained for older records. */
  incident_date?: string;
  incident_time?: string | null;
  shift_location?: string | null;
  policy_violated?: string | null;
  incident_description?: string;
  witnesses?: string | null;
  prior_discussion?: string | null;
  corrective_action?: string | null;
  team_lead_signature?: string | null;
};

export type GroomerSubmissionDetails = {
  description: string;
};

export type SupportPriority = "Normal" | "High" | "Urgent";

export type SupportAdminStatus = "Submitted" | "In Review" | "Needs More Info" | "Resolved" | "Closed";

export type SupportDepartment = "Grooming" | "Training" | "Front Desk" | "Other";

export type SupportComment = {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  body: string;
  visibility: "internal" | "visible_to_submitter";
  created_at: string;
};

export type SupportAuditEntry = {
  id: string;
  action: string;
  previous_value: string | null;
  new_value: string | null;
  performed_by: string;
  created_at: string;
};

export type ManagementReport = {
  id: string;
  report_type: ManagementReportType;
  title: string;
  dog_handler_name: string | null;
  complaint_category: OwnerComplaintCategory | null;
  employee_name: string | null;
  summary: string;
  write_up_details: EmployeeWriteUpDetails | null;
  groomer_submission_details: GroomerSubmissionDetails | null;
  source: "push_notice" | "team_lead_form" | "groomer_form" | "trainer_form";
  status: ManagementReportStatus;
  visibility: "admin_management" | "submitter_review";
  push_notice_id: string | null;
  related_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  priority?: SupportPriority;
  admin_status?: SupportAdminStatus;
  department?: SupportDepartment;
  category?: string | null;
  item_type?: "complaint" | "request";
  assigned_to?: string | null;
  assigned_to_user_id?: string | null;
  management_response?: string | null;
  related_dog_name?: string | null;
  related_owner_name?: string | null;
  related_staff_name?: string | null;
  needed_by?: string | null;
  submitted_by_name?: string | null;
  submitted_by_role?: string | null;
  comments?: SupportComment[];
  audit_history?: SupportAuditEntry[];
  closed_at?: string | null;
  /** Soft-hide from HR Records hub without deleting the underlying write-up/complaint. */
  hr_hub_hidden?: boolean;
  hr_hub_hidden_at?: string | null;
  hr_hub_hidden_by?: string | null;
  /** Support Command Center acknowledgment / escalation timestamps. */
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  escalated_at?: string | null;
  escalated_by?: string | null;
  escalation_destination?: string | null;
};

const SETTINGS_STORE_KEY = "management_reports";
const MAX_NAME_LENGTH = 80;
const MAX_SUMMARY_LENGTH = 600;
const MAX_FIELD_LENGTH = 1200;

type ManagementReportState = {
  reports: ManagementReport[];
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `mgmt-report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

function sortNewest(reports: ManagementReport[]) {
  return [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function emptyState(): ManagementReportState {
  return { reports: [] };
}

function normalizeWriteUpDetails(details: EmployeeWriteUpDetails | null): EmployeeWriteUpDetails | null {
  if (!details) return null;
  const violation_date = details.violation_date ?? details.incident_date ?? "";
  const statement = details.statement_of_violation ?? details.incident_description ?? "";
  return {
    ...details,
    violation_date,
    violation_time: details.violation_time ?? details.incident_time ?? null,
    documented_by: details.documented_by ?? details.team_lead_signature ?? null,
    violation_types: details.violation_types ?? [],
    violation_other: details.violation_other ?? null,
    statement_of_violation: statement,
    employee_statement: details.employee_statement ?? null,
    date_of_warning: details.date_of_warning ?? null,
    type_of_warning: details.type_of_warning ?? null,
    employee_number: details.employee_number ?? null,
    previous_warnings: details.previous_warnings ?? [],
    action_to_be_taken: details.action_to_be_taken ?? details.corrective_action ?? null,
    employee_signature: details.employee_signature ?? null,
    employee_signature_date: details.employee_signature_date ?? null,
    manager_signature: details.manager_signature ?? details.team_lead_signature ?? null,
    manager_signature_date: details.manager_signature_date ?? null,
    text_report: details.text_report ?? null,
    pdf_filename: details.pdf_filename ?? null,
    pdf_generated_at: details.pdf_generated_at ?? null,
    hr_tracked: details.hr_tracked ?? false
  };
}

function normalizeReport(report: ManagementReport): ManagementReport {
  return {
    ...report,
    dog_handler_name: report.dog_handler_name ?? null,
    complaint_category: report.complaint_category ?? null,
    employee_name: report.employee_name ?? (report.write_up_details?.employee_name ?? null),
    write_up_details: normalizeWriteUpDetails(report.write_up_details),
    groomer_submission_details: report.groomer_submission_details ?? null,
    priority: report.priority ?? "Normal",
    admin_status: report.admin_status ?? legacyStatusToAdminStatus(report.status),
    department: report.department ?? departmentForReportType(report.report_type),
    category: report.category ?? report.complaint_category ?? null,
    item_type: report.item_type ?? itemTypeForReportType(report.report_type),
    assigned_to: report.assigned_to ?? null,
    assigned_to_user_id: report.assigned_to_user_id ?? null,
    management_response: report.management_response ?? null,
    related_dog_name: report.related_dog_name ?? null,
    related_owner_name: report.related_owner_name ?? null,
    related_staff_name: report.related_staff_name ?? null,
    needed_by: report.needed_by ?? null,
    submitted_by_name: report.submitted_by_name ?? report.created_by ?? null,
    submitted_by_role: report.submitted_by_role ?? roleForReportType(report.report_type),
    comments: report.comments ?? [],
    audit_history: report.audit_history ?? [],
    closed_at: report.closed_at ?? null,
    hr_hub_hidden: Boolean(report.hr_hub_hidden),
    hr_hub_hidden_at: report.hr_hub_hidden_at ?? null,
    hr_hub_hidden_by: report.hr_hub_hidden_by ?? null,
    acknowledged_at: report.acknowledged_at ?? null,
    acknowledged_by: report.acknowledged_by ?? null,
    escalated_at: report.escalated_at ?? null,
    escalated_by: report.escalated_by ?? null,
    escalation_destination: report.escalation_destination ?? null
  };
}

function legacyStatusToAdminStatus(status: ManagementReportStatus): SupportAdminStatus {
  if (status === "Closed") return "Closed";
  if (status === "Reviewed") return "Resolved";
  if (status === "Needs Review") return "Submitted";
  return "In Review";
}

function departmentForReportType(reportType: ManagementReportType): SupportDepartment {
  if (reportType.startsWith("groomer")) return "Grooming";
  if (reportType.startsWith("trainer")) return "Training";
  if (reportType === "owner_complaint_dog_handler") return "Front Desk";
  if (reportType.startsWith("team_lead")) return "Front Desk";
  return "Other";
}

function itemTypeForReportType(reportType: ManagementReportType): "complaint" | "request" | undefined {
  if (reportType.endsWith("_complaint")) return "complaint";
  if (reportType.endsWith("_request")) return "request";
  return undefined;
}

function roleForReportType(reportType: ManagementReportType): string | null {
  if (reportType.startsWith("groomer")) return "groomer";
  if (reportType.startsWith("trainer")) return "trainer";
  if (reportType.startsWith("team_lead")) return "team_leader";
  if (reportType === "employee_write_up") return "team_leader";
  return null;
}

function parseState(value: unknown): ManagementReportState {
  if (!value || typeof value !== "object") return emptyState();
  const reports = Array.isArray((value as { reports?: unknown }).reports)
    ? ((value as { reports: ManagementReport[] }).reports).map(normalizeReport)
    : [];
  return { reports: sortNewest(reports) };
}

async function loadStateFromAdminSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseState(settings[SETTINGS_STORE_KEY]);
}

async function saveStateToAdminSettings(supabase: SupabaseClient, state: ManagementReportState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: { reports: sortNewest(state.reports) }
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) {
    if (isMissingRelation(saveError)) return false;
    throw saveError;
  }
  return true;
}

async function loadState(supabase: SupabaseClient) {
  return (await loadStateFromAdminSettings(supabase)) ?? emptyState();
}

async function saveState(supabase: SupabaseClient, state: ManagementReportState) {
  if (await saveStateToAdminSettings(supabase, state)) return;
  throw new Error("Management report storage is not available.");
}

function trimField(value: unknown, max = MAX_FIELD_LENGTH) {
  return String(value ?? "").trim().slice(0, max);
}

function matchesCreator(report: ManagementReport, actor?: string | null) {
  if (!actor) return false;
  const normalized = actor.trim().toLowerCase();
  return (report.created_by ?? "").trim().toLowerCase() === normalized;
}

export async function listManagementReports(supabase: SupabaseClient, limit = 50): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports).slice(0, limit);
}

export async function listAllManagementReports(supabase: SupabaseClient): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports);
}

export async function getManagementReportById(supabase: SupabaseClient, id: string) {
  const state = await loadState(supabase);
  return state.reports.find((report) => report.id === id) ?? null;
}

export async function updateManagementReport(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ManagementReport>
) {
  const state = await loadState(supabase);
  let updated: ManagementReport | null = null;
  const next = state.reports.map((report) => {
    if (report.id !== id) return report;
    updated = normalizeReport({ ...report, ...patch, updated_at: new Date().toISOString() });
    return updated;
  });
  if (!updated) throw new Error("Management support item not found.");
  await saveState(supabase, { reports: sortNewest(next) });
  return updated;
}

export async function listWriteUpsForCreator(supabase: SupabaseClient, actor: string, limit = 50): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports)
    .filter((report) => report.report_type === "employee_write_up" && matchesCreator(report, actor))
    .slice(0, limit);
}

export async function listGroomerSubmissionsForCreator(
  supabase: SupabaseClient,
  actor: string,
  reportType: "groomer_complaint" | "groomer_request",
  limit = 50
): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports)
    .filter((report) => report.report_type === reportType && matchesCreator(report, actor))
    .slice(0, limit);
}

async function createGroomerSubmissionReport(
  supabase: SupabaseClient,
  input: {
    reportType: "groomer_complaint" | "groomer_request";
    title: string;
    description: string;
    actor: string | null;
  }
): Promise<ManagementReport> {
  const description = trimField(input.description, MAX_FIELD_LENGTH);
  if (!description) throw new Error("Please enter details before submitting.");

  const now = new Date().toISOString();
  const report: ManagementReport = {
    id: newId(),
    report_type: input.reportType,
    title: input.title,
    dog_handler_name: null,
    complaint_category: null,
    employee_name: null,
    summary: description.slice(0, MAX_SUMMARY_LENGTH),
    write_up_details: null,
    groomer_submission_details: { description },
    source: "groomer_form",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: null,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: input.actor,
    created_at: now,
    updated_at: now
  };

  const state = await loadState(supabase);
  await saveState(supabase, { reports: sortNewest([report, ...state.reports]) });
  return report;
}

export async function createGroomerComplaintReport(
  supabase: SupabaseClient,
  description: string,
  actor: string | null
) {
  return createGroomerSubmissionReport(supabase, {
    reportType: "groomer_complaint",
    title: "Groomer Complaint",
    description,
    actor
  });
}

export async function createGroomerRequestReport(
  supabase: SupabaseClient,
  description: string,
  actor: string | null
) {
  return createGroomerSubmissionReport(supabase, {
    reportType: "groomer_request",
    title: "Groomer Request",
    description,
    actor
  });
}

async function createTrainerSubmissionReport(
  supabase: SupabaseClient,
  input: {
    reportType: "trainer_complaint" | "trainer_request";
    title: string;
    description: string;
    actor: string | null;
  }
): Promise<ManagementReport> {
  const description = trimField(input.description, MAX_FIELD_LENGTH);
  if (!description) throw new Error("Please enter details before submitting.");

  const now = new Date().toISOString();
  const report: ManagementReport = {
    id: newId(),
    report_type: input.reportType,
    title: input.title,
    dog_handler_name: null,
    complaint_category: null,
    employee_name: null,
    summary: description.slice(0, MAX_SUMMARY_LENGTH),
    write_up_details: null,
    groomer_submission_details: { description },
    source: "trainer_form",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: null,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: input.actor,
    created_at: now,
    updated_at: now
  };

  const state = await loadState(supabase);
  await saveState(supabase, { reports: sortNewest([report, ...state.reports]) });
  return report;
}

export async function listTrainerSubmissionsForCreator(
  supabase: SupabaseClient,
  actor: string,
  reportType: "trainer_complaint" | "trainer_request",
  limit = 50
): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports)
    .filter((report) => report.report_type === reportType && matchesCreator(report, actor))
    .slice(0, limit);
}

export async function createTrainerComplaintReport(
  supabase: SupabaseClient,
  description: string,
  actor: string | null
) {
  return createTrainerSubmissionReport(supabase, {
    reportType: "trainer_complaint",
    title: "Trainer Complaint",
    description,
    actor
  });
}

export async function createTrainerRequestReport(
  supabase: SupabaseClient,
  description: string,
  actor: string | null
) {
  return createTrainerSubmissionReport(supabase, {
    reportType: "trainer_request",
    title: "Trainer Request",
    description,
    actor
  });
}

export async function listTeamLeadSubmissionsForCreator(
  supabase: SupabaseClient,
  actor: string,
  reportType: "team_lead_request",
  limit = 50
): Promise<ManagementReport[]> {
  const state = await loadState(supabase);
  return sortNewest(state.reports)
    .filter((report) => report.report_type === reportType && matchesCreator(report, actor))
    .slice(0, limit);
}

export async function createTeamLeadRequestReport(
  supabase: SupabaseClient,
  description: string,
  actor: string | null
): Promise<ManagementReport> {
  const trimmed = trimField(description, MAX_FIELD_LENGTH);
  if (!trimmed) throw new Error("Please enter details before submitting.");

  const now = new Date().toISOString();
  const report: ManagementReport = {
    id: newId(),
    report_type: "team_lead_request",
    title: "Team Lead Request",
    dog_handler_name: null,
    complaint_category: null,
    employee_name: null,
    summary: trimmed.slice(0, MAX_SUMMARY_LENGTH),
    write_up_details: null,
    groomer_submission_details: { description: trimmed },
    source: "team_lead_form",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: null,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: actor,
    created_at: now,
    updated_at: now
  };

  const state = await loadState(supabase);
  await saveState(supabase, { reports: sortNewest([report, ...state.reports]) });
  return report;
}

export async function createDogHandlerComplaintReport(
  supabase: SupabaseClient,
  input: {
    dogHandlerName: string;
    complaintCategory: OwnerComplaintCategory;
    summary: string;
    pushNoticeId: string;
    actor: string | null;
  }
): Promise<ManagementReport> {
  const dog_handler_name = input.dogHandlerName.trim().slice(0, MAX_NAME_LENGTH);
  const summary = input.summary.trim().slice(0, MAX_SUMMARY_LENGTH);
  const categoryLabel = getOwnerComplaintCategoryLabel(input.complaintCategory) ?? "Owner Complaint";
  if (!dog_handler_name) throw new Error("Dog handler name is required.");

  const now = new Date().toISOString();
  const report: ManagementReport = {
    id: newId(),
    report_type: "owner_complaint_dog_handler",
    title: `Owner Complaint — ${categoryLabel}`,
    dog_handler_name,
    complaint_category: input.complaintCategory,
    employee_name: null,
    summary,
    write_up_details: null,
    groomer_submission_details: null,
    source: "push_notice",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: input.pushNoticeId,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: input.actor,
    created_at: now,
    updated_at: now
  };

  const state = await loadState(supabase);
  await saveState(supabase, { reports: sortNewest([report, ...state.reports]) });
  return report;
}

export type CreateEmployeeWriteUpInput = {
  employee_name: string;
  employee_department: string;
  violation_date: string;
  violation_time?: string | null;
  documented_by?: string | null;
  violation_types?: WarningNoticeViolationType[];
  violation_other?: string | null;
  statement_of_violation: string;
  employee_statement?: string | null;
  date_of_warning?: string | null;
  type_of_warning?: string | null;
  employee_number?: string | null;
  previous_warnings?: PreviousWarningRow[];
  action_to_be_taken?: string | null;
  employee_signature?: string | null;
  employee_signature_date?: string | null;
  manager_signature?: string | null;
  manager_signature_date?: string | null;
  text_report?: string | null;
  pdf_filename?: string | null;
  pdf_generated_at?: string | null;
};

export async function createEmployeeWriteUpReport(
  supabase: SupabaseClient,
  input: CreateEmployeeWriteUpInput,
  actor: string | null
): Promise<ManagementReport> {
  const employee_name = trimField(input.employee_name, MAX_NAME_LENGTH);
  const employee_department = trimField(input.employee_department, 80);
  const violation_date = trimField(input.violation_date, 32);
  const statement_of_violation = trimField(input.statement_of_violation, MAX_FIELD_LENGTH);
  const violation_types = Array.isArray(input.violation_types)
    ? input.violation_types.filter((type): type is WarningNoticeViolationType => typeof type === "string").slice(0, 9)
    : [];

  if (!employee_name) throw new Error("Employee name is required.");
  if (!employee_department) throw new Error("Employee department is required.");
  if (!violation_date) throw new Error("Date of violation is required.");
  if (!statement_of_violation) throw new Error("Statement of violation is required.");
  if (!violation_types.length) throw new Error("Select at least one type of violation.");

  const previous_warnings = (input.previous_warnings ?? []).slice(0, 3).map((row) => ({
    date: trimField(row.date, 32),
    verbal: Boolean(row.verbal),
    written: Boolean(row.written),
    by_whom: trimField(row.by_whom, 80),
    violation_details: trimField(row.violation_details, 240)
  }));

  const write_up_details: EmployeeWriteUpDetails = {
    employee_name,
    employee_department,
    violation_date,
    violation_time: trimField(input.violation_time, 40) || null,
    documented_by: trimField(input.documented_by, 120) || actor,
    violation_types,
    violation_other: trimField(input.violation_other, 120) || null,
    statement_of_violation,
    employee_statement: trimField(input.employee_statement, MAX_FIELD_LENGTH) || null,
    date_of_warning: trimField(input.date_of_warning, 32) || null,
    type_of_warning: trimField(input.type_of_warning, 80) || null,
    employee_number: trimField(input.employee_number, 40) || null,
    previous_warnings,
    action_to_be_taken: trimField(input.action_to_be_taken, 600) || null,
    employee_signature: trimField(input.employee_signature, 120) || null,
    employee_signature_date: trimField(input.employee_signature_date, 32) || null,
    manager_signature: trimField(input.manager_signature, 120) || null,
    manager_signature_date: trimField(input.manager_signature_date, 32) || null,
    text_report: trimField(input.text_report, 8000) || null,
    pdf_filename: trimField(input.pdf_filename, 160) || null,
    pdf_generated_at: input.pdf_generated_at ?? null,
    hr_tracked: true,
    incident_date: violation_date,
    incident_time: trimField(input.violation_time, 40) || null,
    incident_description: statement_of_violation,
    corrective_action: trimField(input.action_to_be_taken, 600) || null,
    team_lead_signature: trimField(input.manager_signature, 120) || actor
  };

  const summary = `${employee_name} (${employee_department}) — ${statement_of_violation.slice(0, 180)}`;
  const now = new Date().toISOString();
  const report: ManagementReport = {
    id: newId(),
    report_type: "employee_write_up",
    title: `Employee Write-Up — ${employee_name}`,
    dog_handler_name: null,
    complaint_category: null,
    employee_name,
    summary: summary.slice(0, MAX_SUMMARY_LENGTH),
    write_up_details,
    groomer_submission_details: null,
    source: "team_lead_form",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: null,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: actor,
    created_at: now,
    updated_at: now
  };

  const state = await loadState(supabase);
  await saveState(supabase, { reports: sortNewest([report, ...state.reports]) });
  return report;
}
