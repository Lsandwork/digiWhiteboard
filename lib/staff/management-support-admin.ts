type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import type {
  ManagementReport,
  ManagementReportType,
  SupportAdminStatus,
  SupportDepartment,
  SupportPriority
} from "@/lib/staff/management-reports";
import {
  getManagementReportById,
  listAllManagementReports,
  updateManagementReport
} from "@/lib/staff/management-reports";
import { dispatchStaffOpsNotificationEvent, listStaffOps, dispatchPersonalStaffEmailNotification } from "@/lib/staff/admin-ops";
import { caseDisplayTitle, caseSubjectLine, effectiveCategory } from "@/lib/staff/support-case-display";
import {
  canonicalSupportStatus,
  isOpenWorkflowStatus,
  managementAlertForNewSubmission,
  planSupportAction,
  redactSupportForSubmitter,
  type SupportNotifyPlan
} from "@/lib/staff/support-workflow";

export { redactSupportForSubmitter };

export type SupportInboxFilter = {
  query?: string;
  department?: string;
  item_type?: string;
  priority?: string;
  status?: string;
  assigned_to?: string;
  submitted_by?: string;
  report_type?: ManagementReportType | ManagementReportType[];
  card?: string;
  date_from?: string;
  date_to?: string;
};

export type SupportInboxRow = {
  id: string;
  date_submitted: string;
  department: SupportDepartment;
  submitted_by: string;
  role: string;
  item_type: string;
  category: string | null;
  subject: string;
  priority: SupportPriority;
  status: SupportAdminStatus;
  assigned_to: string | null;
  last_updated: string;
  report_type: ManagementReportType;
  details_preview: string;
  related_dog_name: string | null;
  related_owner_name: string | null;
  related_staff_name: string | null;
  needed_by: string | null;
  report: ManagementReport;
};

export type SupportHubStats = {
  new_complaints: number;
  new_requests: number;
  needs_review: number;
  urgent_items: number;
  open_items: number;
  closed_this_week: number;
};

const STAFF_SUPPORT_TYPES: ManagementReportType[] = [
  "groomer_complaint",
  "groomer_request",
  "trainer_complaint",
  "trainer_request",
  "team_lead_request"
];

function detailsText(report: ManagementReport) {
  return report.groomer_submission_details?.description ?? report.summary ?? "";
}

function subjectForReport(report: ManagementReport) {
  return caseSubjectLine(report);
}

export { caseDisplayTitle, caseSubjectLine };

export function mapReportToInboxRow(report: ManagementReport): SupportInboxRow {
  const normalized = report;
  return {
    id: normalized.id,
    date_submitted: normalized.created_at,
    department: normalized.department ?? "Other",
    submitted_by: normalized.submitted_by_name ?? "Staff",
    role: normalized.submitted_by_role ?? "staff",
    item_type: normalized.item_type === "request" ? "Request" : "Complaint",
    category: normalized.category ?? effectiveCategory(normalized),
    subject: subjectForReport(normalized),
    priority: normalized.priority ?? "Normal",
    status: canonicalSupportStatus(normalized.admin_status ?? normalized.status),
    assigned_to: normalized.assigned_to ?? null,
    last_updated: normalized.updated_at,
    report_type: normalized.report_type,
    details_preview: detailsText(normalized).slice(0, 160),
    related_dog_name: normalized.related_dog_name ?? null,
    related_owner_name: normalized.related_owner_name ?? null,
    related_staff_name: normalized.related_staff_name ?? null,
    needed_by: normalized.needed_by ?? null,
    report: normalized
  };
}

function isClosedThisWeek(iso: string | null | undefined) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return date.getTime() >= weekAgo;
}

function isOpenStatus(status: SupportAdminStatus) {
  return isOpenWorkflowStatus(canonicalSupportStatus(status));
}

export function computeSupportHubStats(rows: SupportInboxRow[]): SupportHubStats {
  return {
    new_complaints: rows.filter((row) => row.item_type === "Complaint" && row.status === "New").length,
    new_requests: rows.filter((row) => row.item_type === "Request" && row.status === "New").length,
    needs_review: rows.filter((row) => row.status === "New" || row.status === "Acknowledged" || row.status === "In Progress").length,
    urgent_items: rows.filter((row) => (row.priority === "Urgent" || row.priority === "High") && isOpenStatus(row.status)).length,
    open_items: rows.filter((row) => isOpenStatus(row.status)).length,
    closed_this_week: rows.filter((row) => (row.status === "Resolved" || row.status === "Closed") && isClosedThisWeek(row.report.resolved_at ?? row.report.closed_at ?? row.last_updated)).length
  };
}

function matchesCard(row: SupportInboxRow, card?: string) {
  if (!card) return true;
  if (card === "new_complaints") return row.item_type === "Complaint" && row.status === "New";
  if (card === "new_requests") return row.item_type === "Request" && row.status === "New";
  if (card === "needs_review") return row.status === "New" || row.status === "Acknowledged" || row.status === "In Progress";
  if (card === "urgent_items") return row.priority === "Urgent" || row.priority === "High";
  if (card === "open_items") return isOpenStatus(row.status);
  if (card === "closed_this_week") return row.status === "Closed" && isClosedThisWeek(row.report.closed_at ?? row.last_updated);
  return true;
}

export function filterSupportInbox(rows: SupportInboxRow[], filters: SupportInboxFilter) {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const types = filters.report_type
    ? Array.isArray(filters.report_type)
      ? filters.report_type
      : [filters.report_type]
    : null;

  return rows.filter((row) => {
    if (types && !types.includes(row.report_type)) return false;
    if (!matchesCard(row, filters.card)) return false;
    if (filters.department && row.department !== filters.department) return false;
    if (filters.item_type && row.item_type.toLowerCase() !== filters.item_type.toLowerCase()) return false;
    if (filters.priority && row.priority !== filters.priority) return false;
    if (filters.status && canonicalSupportStatus(row.status) !== canonicalSupportStatus(filters.status)) return false;
    if (filters.assigned_to && (row.assigned_to ?? "") !== filters.assigned_to) return false;
    if (filters.submitted_by && !row.submitted_by.toLowerCase().includes(filters.submitted_by.toLowerCase())) return false;
    if (filters.date_from && new Date(row.date_submitted) < new Date(filters.date_from)) return false;
    if (filters.date_to && new Date(row.date_submitted) > new Date(filters.date_to)) return false;
    if (!query) return true;
    const haystack = [
      row.subject,
      row.details_preview,
      row.related_dog_name,
      row.related_owner_name,
      row.related_staff_name,
      row.submitted_by
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export async function loadStaffSupportInbox(supabase: SupabaseClient, filters: SupportInboxFilter = {}) {
  const reports = await listAllManagementReports(supabase);
  const rows = reports
    .filter((report) => STAFF_SUPPORT_TYPES.includes(report.report_type))
    .map(mapReportToInboxRow);
  const stats = computeSupportHubStats(rows);
  const items = filterSupportInbox(rows, filters);
  return { stats, items, allItems: rows };
}

export class SupportNotificationError extends Error {
  report: ManagementReport;

  constructor(message: string, report: ManagementReport) {
    super(message);
    this.name = "SupportNotificationError";
    this.report = report;
  }
}

async function deliverNotification(run: () => Promise<unknown>) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await run();
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  console.error("Support notification failed", lastError);
  return false;
}

async function sendSupportNotice(
  supabase: SupabaseClient,
  report: ManagementReport,
  notice: SupportNotifyPlan,
  actor: string
) {
  const email = report.created_by?.trim().toLowerCase() ?? "";
  if (notice.audience === "submitter" && !email.includes("@")) {
    throw new SupportNotificationError("The submission was saved, but the employee has no email address for a notification.", report);
  }
  const event = {
    eventType: notice.audience === "management" ? ("auto_issue" as const) : ("reply" as const),
    sourceTable: "management_reports",
    sourceId: report.id,
    sourceTab: "management_support" as const,
    title: notice.title,
    body: notice.body,
    priority: notice.priority,
    urgent: notice.urgent,
    needsManagementReview: notice.audience === "management",
    actor,
    dedupeKey: notice.dedupeKey,
    adminPoolOnly: notice.audience === "management"
  };
  const delivered = await deliverNotification(() =>
    notice.audience === "management"
      ? dispatchStaffOpsNotificationEvent(supabase, event)
      : dispatchPersonalStaffEmailNotification(supabase, event, email)
  );
  if (!delivered) {
    throw new SupportNotificationError(
      notice.audience === "management"
        ? "The submission was saved, but the management alert did not send. Use Retry alert."
        : "The update was saved, but the employee notification did not send. Use Resend notice.",
      report
    );
  }
  if (notice.audience === "management" && notice.dedupeKey.endsWith(":created")) {
    await updateManagementReport(supabase, report.id, { management_notified_at: new Date().toISOString() });
  }
}

export async function alertManagersOfNewSubmission(
  supabase: SupabaseClient,
  report: ManagementReport,
  actor: string
) {
  const notice = managementAlertForNewSubmission(report, actor);
  await sendSupportNotice(supabase, report, notice, actor);
  return { ...(await getManagementReportById(supabase, report.id))! };
}

export async function applySubmitterSupportReply(
  supabase: SupabaseClient,
  id: string,
  body: string,
  actor: string,
  userRole: string
) {
  return applySupportItemAction(supabase, id, "add_submitter_reply", { body, user_role: userRole }, actor);
}

export async function applySupportItemAction(
  supabase: SupabaseClient,
  id: string,
  action: string,
  input: Record<string, unknown>,
  actor: string
): Promise<ManagementReport> {
  const report = await getManagementReportById(supabase, id);
  if (!report) throw new Error("Support item not found.");

  const plan = planSupportAction(report, action, input, actor);
  let updated = report;
  if (!plan.unchanged && Object.keys(plan.patch).length) {
    updated = await updateManagementReport(supabase, id, plan.patch);
  }
  if (plan.notify) {
    try {
      await sendSupportNotice(supabase, updated, plan.notify, actor);
    } catch (error) {
      if (error instanceof SupportNotificationError) {
        throw new SupportNotificationError(error.message, updated);
      }
      throw error;
    }
    const refreshed = await getManagementReportById(supabase, id);
    if (refreshed) updated = refreshed;
  }
  return updated;
}

export function visibleCommentsForSubmitter(report: ManagementReport) {
  return (report.comments ?? []).filter((comment) => comment.visibility === "visible_to_submitter");
}

export function visibleResponseForSubmitter(report: ManagementReport) {
  const visible = visibleCommentsForSubmitter(report);
  if (report.management_response) return report.management_response;
  return visible.at(-1)?.body ?? null;
}

export type TrainerEntryAdminRow = {
  id: string;
  date_submitted: string;
  trainer_name: string;
  entry_type: string;
  dog_name: string | null;
  owner_name: string | null;
  subject: string;
  details_preview: string;
  priority: string;
  follow_up_needed: boolean;
  status: string;
  last_updated: string;
  urgent: boolean;
  crossover_id: string;
};

export async function listTrainerEntriesForAdmin(supabase: SupabaseClient): Promise<TrainerEntryAdminRow[]> {
  const state = await listStaffOps(supabase);
  return (state.crossover_messages ?? [])
    .filter((item) => {
      const logType = item.log_type ?? "";
      const dept = item.department_area ?? "";
      return logType === "Training Note" || dept.toLowerCase().includes("training");
    })
    .map((item) => {
      const priority = item.priority ?? "Normal";
      const urgent = item.urgent || priority === "High" || priority === "Urgent" || priority === "Critical";
      return {
        id: item.id,
        crossover_id: item.id,
        date_submitted: item.created_at,
        trainer_name: item.submitted_by ?? item.created_by ?? "Trainer",
        entry_type: item.log_type ?? "Training Note",
        dog_name: item.related_dog_name ?? null,
        owner_name: item.related_owner_name ?? null,
        subject: item.subject ?? "Trainer Entry",
        details_preview: (item.details ?? item.message ?? "").slice(0, 160),
        priority,
        follow_up_needed: Boolean(item.needs_management_review),
        status: item.status ?? "Submitted",
        last_updated: item.updated_at ?? item.created_at,
        urgent
      };
    })
    .sort((a, b) => new Date(b.date_submitted).getTime() - new Date(a.date_submitted).getTime());
}
