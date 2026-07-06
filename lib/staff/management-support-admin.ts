type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import type {
  ManagementReport,
  ManagementReportType,
  SupportAdminStatus,
  SupportAuditEntry,
  SupportComment,
  SupportDepartment,
  SupportPriority
} from "@/lib/staff/management-reports";
import {
  getManagementReportById,
  listAllManagementReports,
  updateManagementReport
} from "@/lib/staff/management-reports";
import { dispatchStaffOpsNotificationEvent, listStaffOps, dispatchPersonalStaffEmailNotification } from "@/lib/staff/admin-ops";

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
  "trainer_request"
];

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function detailsText(report: ManagementReport) {
  return report.groomer_submission_details?.description ?? report.summary ?? "";
}

function subjectForReport(report: ManagementReport) {
  if (report.title && report.title !== "Groomer Complaint" && report.title !== "Groomer Request" && report.title !== "Trainer Complaint" && report.title !== "Trainer Request") {
    return report.title;
  }
  const text = detailsText(report);
  return text.slice(0, 80) || report.title;
}

export function mapReportToInboxRow(report: ManagementReport): SupportInboxRow {
  const normalized = report;
  return {
    id: normalized.id,
    date_submitted: normalized.created_at,
    department: normalized.department ?? "Other",
    submitted_by: normalized.submitted_by_name ?? normalized.created_by ?? "Staff",
    role: normalized.submitted_by_role ?? "staff",
    item_type: normalized.item_type === "request" ? "Request" : "Complaint",
    category: normalized.category ?? null,
    subject: subjectForReport(normalized),
    priority: normalized.priority ?? "Normal",
    status: normalized.admin_status ?? "Submitted",
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
  return status !== "Closed" && status !== "Resolved";
}

export function computeSupportHubStats(rows: SupportInboxRow[]): SupportHubStats {
  return {
    new_complaints: rows.filter((row) => row.item_type === "Complaint" && row.status === "Submitted").length,
    new_requests: rows.filter((row) => row.item_type === "Request" && row.status === "Submitted").length,
    needs_review: rows.filter((row) => row.status === "Submitted" || row.status === "In Review" || row.status === "Needs More Info").length,
    urgent_items: rows.filter((row) => row.priority === "Urgent" || row.priority === "High").length,
    open_items: rows.filter((row) => isOpenStatus(row.status)).length,
    closed_this_week: rows.filter((row) => row.status === "Closed" && isClosedThisWeek(row.report.closed_at ?? row.last_updated)).length
  };
}

function matchesCard(row: SupportInboxRow, card?: string) {
  if (!card) return true;
  if (card === "new_complaints") return row.item_type === "Complaint" && row.status === "Submitted";
  if (card === "new_requests") return row.item_type === "Request" && row.status === "Submitted";
  if (card === "needs_review") return row.status === "Submitted" || row.status === "In Review" || row.status === "Needs More Info";
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
    if (filters.status && row.status !== filters.status) return false;
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

function appendAudit(
  report: ManagementReport,
  action: string,
  previousValue: string | null,
  newValue: string | null,
  actor: string
): SupportAuditEntry[] {
  const entry: SupportAuditEntry = {
    id: newId("audit"),
    action,
    previous_value: previousValue,
    new_value: newValue,
    performed_by: actor,
    created_at: new Date().toISOString()
  };
  return [...(report.audit_history ?? []), entry];
}

function responseAlertTitle(report: ManagementReport) {
  if (report.report_type === "employee_write_up") return "Update on your write-up request";
  if (report.item_type === "request") return "Response to your request";
  if (report.item_type === "complaint") return "Response to your complaint";
  if (report.report_type === "owner_complaint_dog_handler") return "Management replied to your submission";
  return "Management responded to your submission";
}

function responseAlertBody(report: ManagementReport, message: string) {
  const preview = message.slice(0, 200);
  if (report.item_type === "request") {
    return `There's a new response on your request. Open it to view and reply.\n\n${preview}`;
  }
  if (report.item_type === "complaint") {
    return `Management responded to your complaint. Open it to review the update.\n\n${preview}`;
  }
  if (report.report_type === "employee_write_up") {
    return `Your write-up request has an update from management.\n\n${preview}`;
  }
  return `There's a new response on your submission. Open it to view and reply.\n\n${preview}`;
}

function statusAlertTitle(report: ManagementReport, status: string) {
  if (report.report_type === "employee_write_up") return "Update on your write-up request";
  if (report.item_type === "request") return "Update on your request";
  if (report.item_type === "complaint") return "Update on your complaint";
  return "Update on your submission";
}

async function notifySubmitter(
  supabase: SupabaseClient,
  report: ManagementReport,
  title: string,
  body: string,
  actor: string
) {
  const email = report.created_by;
  if (!email || !email.includes("@")) return;
  await dispatchPersonalStaffEmailNotification(
    supabase,
    {
      eventType: "reply",
      sourceTable: "management_reports",
      sourceId: report.id,
      sourceTab: "push_notices",
      title,
      body,
      priority: report.priority === "Urgent" ? "Urgent" : report.priority === "High" ? "High" : "Normal",
      actor
    },
    email
  );
}

async function notifyManagementOnSubmitterReply(
  supabase: SupabaseClient,
  report: ManagementReport,
  body: string,
  actor: string
) {
  const itemLabel = report.item_type === "request" ? "request" : report.item_type === "complaint" ? "complaint" : "submission";
  await dispatchStaffOpsNotificationEvent(supabase, {
    eventType: "reply",
    sourceTable: "management_reports",
    sourceId: report.id,
    sourceTab: "push_notices",
    title: `New reply on your ${itemLabel}: ${report.title}`,
    body: `The submitter replied. Open Notifications to review and respond.\n\n${body.slice(0, 200)}`,
    priority: report.priority === "Urgent" ? "Urgent" : report.priority === "High" ? "High" : "Normal",
    urgent: report.priority === "Urgent",
    needsManagementReview: true,
    assignedTo: report.assigned_to ?? undefined,
    actor
  });
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

  const now = new Date().toISOString();
  let patch: Partial<ManagementReport> = { updated_at: now };
  let notifyTitle: string | null = null;
  let notifyBody: string | null = null;

  if (action === "assign") {
    const assigned = String(input.assigned_to ?? "").trim();
    patch = {
      ...patch,
      assigned_to: assigned || null,
      assigned_to_user_id: String(input.assigned_to_user_id ?? "") || null,
      admin_status: "In Review",
      audit_history: appendAudit(report, "assign", report.assigned_to ?? null, assigned || null, actor)
    };
  } else if (action === "change_status") {
    const status = String(input.status ?? "") as SupportAdminStatus;
    patch = {
      ...patch,
      admin_status: status,
      status: status === "Closed" ? "Closed" : status === "Resolved" ? "Reviewed" : "Needs Review",
      closed_at: status === "Closed" ? now : report.closed_at,
      reviewed_by: actor,
      reviewed_at: now,
      audit_history: appendAudit(report, "change_status", report.admin_status ?? null, status, actor)
    };
    notifyTitle = statusAlertTitle(report, status);
    notifyBody = `Your ${report.item_type ?? "submission"} status was updated to ${status}. Open Notifications to view details.`;
  } else if (action === "add_internal_note") {
    const body = String(input.body ?? "").trim();
    if (!body) throw new Error("Internal note is required.");
    const comment: SupportComment = {
      id: newId("comment"),
      user_id: String(input.user_id ?? "") || null,
      user_name: actor,
      user_role: String(input.user_role ?? "admin"),
      body,
      visibility: "internal",
      created_at: now
    };
    patch = {
      ...patch,
      comments: [...(report.comments ?? []), comment],
      audit_history: appendAudit(report, "add_internal_note", null, body.slice(0, 120), actor)
    };
  } else if (action === "add_response") {
    const body = String(input.body ?? "").trim();
    if (!body) throw new Error("Response is required.");
    const comment: SupportComment = {
      id: newId("comment"),
      user_id: String(input.user_id ?? "") || null,
      user_name: actor,
      user_role: String(input.user_role ?? "admin"),
      body,
      visibility: "visible_to_submitter",
      created_at: now
    };
    const nextStatus: SupportAdminStatus =
      input.mark_resolved === true ? "Resolved" : "In Review";
    patch = {
      ...patch,
      management_response: body,
      comments: [...(report.comments ?? []), comment],
      admin_status: input.mark_resolved === true ? "Resolved" : nextStatus,
      status: input.mark_resolved === true ? "Reviewed" : report.status,
      reviewed_by: actor,
      reviewed_at: now,
      audit_history: appendAudit(report, "add_response", null, body.slice(0, 120), actor)
    };
    notifyTitle = responseAlertTitle(report);
    notifyBody = responseAlertBody(report, body);
  } else if (action === "add_submitter_reply") {
    const body = String(input.body ?? "").trim();
    if (!body) throw new Error("Response is required.");
    const submitterEmail = report.created_by?.trim().toLowerCase();
    const actorEmail = actor.trim().toLowerCase();
    if (!submitterEmail || submitterEmail !== actorEmail) {
      throw new Error("You can only reply to your own submissions.");
    }
    const comment: SupportComment = {
      id: newId("comment"),
      user_id: String(input.user_id ?? "") || null,
      user_name: report.submitted_by_name ?? actor,
      user_role: String(input.user_role ?? report.submitted_by_role ?? "staff"),
      body,
      visibility: "visible_to_submitter",
      created_at: now
    };
    patch = {
      ...patch,
      comments: [...(report.comments ?? []), comment],
      admin_status: "Needs More Info",
      status: "Needs Review",
      audit_history: appendAudit(report, "add_submitter_reply", null, body.slice(0, 120), actor)
    };
    await notifyManagementOnSubmitterReply(supabase, report, body, actor);
  } else if (action === "close") {
    patch = {
      ...patch,
      admin_status: "Closed",
      status: "Closed",
      closed_at: now,
      reviewed_by: actor,
      reviewed_at: now,
      audit_history: appendAudit(report, "close", report.admin_status ?? null, "Closed", actor)
    };
    notifyTitle = "Support item closed";
    notifyBody = `Your ${report.item_type ?? "submission"} has been closed.`;
  } else if (action === "reopen") {
    patch = {
      ...patch,
      admin_status: "In Review",
      status: "Needs Review",
      closed_at: null,
      audit_history: appendAudit(report, "reopen", report.admin_status ?? null, "In Review", actor)
    };
    notifyTitle = "Support item reopened";
    notifyBody = `Your ${report.item_type ?? "submission"} has been reopened for review.`;
  } else if (action === "mark_reviewed") {
    patch = {
      ...patch,
      admin_status: "Resolved",
      status: "Reviewed",
      reviewed_by: actor,
      reviewed_at: now,
      audit_history: appendAudit(report, "mark_reviewed", report.admin_status ?? null, "Resolved", actor)
    };
    notifyTitle = "Support item reviewed";
    notifyBody = `Your ${report.item_type ?? "submission"} has been marked reviewed.`;
  } else {
    throw new Error("Unsupported action.");
  }

  const updated = await updateManagementReport(supabase, id, patch);
  if (notifyTitle && notifyBody) {
    await notifySubmitter(supabase, updated, notifyTitle, notifyBody, actor);
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
