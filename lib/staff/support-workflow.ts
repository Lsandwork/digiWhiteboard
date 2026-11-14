import type {
  ManagementReport,
  ManagementReportStatus,
  SupportAdminStatus,
  SupportAuditEntry,
  SupportComment,
  SupportPriority
} from "@/lib/staff/management-reports";
import { caseSubjectLine } from "@/lib/staff/support-case-display";

export const SUPPORT_WORKFLOW_STATUSES = ["New", "Acknowledged", "In Progress", "Resolved", "Closed"] as const;
export type SupportWorkflowStatus = (typeof SUPPORT_WORKFLOW_STATUSES)[number];

export const SUPPORT_PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;

export const SUPPORT_MANAGEMENT_PATH = "/admin?board=staff&tab=complaint_review";
export const SUPPORT_EMPLOYEE_PATH = "/admin?board=staff&tab=management_support";

const UNACKNOWLEDGED_HOURS = 4;
const UNRESOLVED_HOURS = 72;

export type SupportNotifyPlan = {
  audience: "submitter" | "management";
  title: string;
  body: string;
  dedupeKey: string;
  urgent: boolean;
  priority: SupportPriority;
};

export type SupportActionPlan = {
  unchanged: boolean;
  patch: Partial<ManagementReport>;
  notify: SupportNotifyPlan | null;
};

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function canonicalSupportStatus(status?: string | null): SupportWorkflowStatus {
  switch (status) {
    case "Acknowledged":
      return "Acknowledged";
    case "In Progress":
    case "In Review":
    case "Needs More Info":
    case "Open":
      return "In Progress";
    case "Resolved":
    case "Reviewed":
      return "Resolved";
    case "Closed":
      return "Closed";
    case "New":
    case "Submitted":
    case "Needs Review":
    default:
      return "New";
  }
}

export function isSupportPriority(value: string): value is SupportPriority {
  return (SUPPORT_PRIORITIES as readonly string[]).includes(value);
}

export function workflowStatusToLegacy(status: SupportWorkflowStatus): ManagementReportStatus {
  if (status === "Closed") return "Closed";
  if (status === "Resolved") return "Reviewed";
  if (status === "New") return "Needs Review";
  return "Open";
}

export function isOpenWorkflowStatus(status: SupportWorkflowStatus) {
  return status !== "Resolved" && status !== "Closed";
}

export function formatSupportWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date)} PT`;
}

export function plainSupportText(value: string | null | undefined) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function supportItemLabel(report: ManagementReport) {
  if (report.item_type === "request" || report.report_type.endsWith("_request")) return "request";
  if (report.item_type === "complaint" || report.report_type.endsWith("_complaint")) return "complaint";
  return "submission";
}

export function supportSubject(report: ManagementReport) {
  return plainSupportText(caseSubjectLine(report)) || "Submission";
}

export function supportSubmitterName(report: ManagementReport) {
  return report.submitted_by_name?.trim() || "An employee";
}

function minuteKey(iso: string) {
  return iso.slice(0, 16);
}

function appendAudit(
  report: ManagementReport,
  action: string,
  previousValue: string | null,
  newValue: string | null,
  actor: string,
  now: string
): SupportAuditEntry[] {
  const entry: SupportAuditEntry = {
    id: newId("audit"),
    action,
    previous_value: previousValue,
    new_value: newValue,
    performed_by: actor,
    created_at: now
  };
  return [...(report.audit_history ?? []), entry];
}

function comment(
  body: string,
  actor: string,
  role: string,
  visibility: SupportComment["visibility"],
  now: string,
  userId?: string | null
): SupportComment {
  return {
    id: newId("comment"),
    user_id: userId || null,
    user_name: actor,
    user_role: role,
    body,
    visibility,
    created_at: now
  };
}

function statusTimestamps(report: ManagementReport, status: SupportWorkflowStatus, actor: string, now: string) {
  return {
    acknowledged_at: status === "Acknowledged" ? report.acknowledged_at ?? now : report.acknowledged_at ?? null,
    acknowledged_by: status === "Acknowledged" ? report.acknowledged_by ?? actor : report.acknowledged_by ?? null,
    in_progress_at: status === "In Progress" ? now : report.in_progress_at ?? null,
    in_progress_by: status === "In Progress" ? actor : report.in_progress_by ?? null,
    resolved_at: status === "Resolved" ? now : status === "Closed" ? report.resolved_at ?? null : null,
    resolved_by: status === "Resolved" ? actor : status === "Closed" ? report.resolved_by ?? null : null,
    closed_at: status === "Closed" ? now : null,
    reviewed_by: actor,
    reviewed_at: now
  };
}

export function employeeStatusNotice(
  report: ManagementReport,
  status: SupportWorkflowStatus,
  actor: string,
  now: string,
  resolution?: string | null
): SupportNotifyPlan {
  const label = supportItemLabel(report);
  const subject = supportSubject(report);
  const when = formatSupportWhen(now);
  const priority = report.priority === "Low" || report.priority === "High" || report.priority === "Urgent" ? report.priority : "Normal";
  const link = `Open your submissions: ${SUPPORT_EMPLOYEE_PATH}`;
  if (status === "Acknowledged") {
    return {
      audience: "submitter",
      title: `Management acknowledged your ${label}`,
      body: `${actor} received and acknowledged your ${label} "${subject}" on ${when}.\n\n${link}`,
      dedupeKey: `support-employee:${report.id}:acknowledged:${minuteKey(now)}`,
      urgent: report.priority === "Urgent",
      priority
    };
  }
  if (status === "In Progress") {
    return {
      audience: "submitter",
      title: `Management is working on your ${label}`,
      body: `${actor} is actively reviewing your ${label} "${subject}". Updated ${when}.\n\n${link}`,
      dedupeKey: `support-employee:${report.id}:in-progress:${minuteKey(now)}`,
      urgent: report.priority === "Urgent",
      priority
    };
  }
  if (status === "Resolved") {
    const details = plainSupportText(resolution || report.management_response || "");
    return {
      audience: "submitter",
      title: `Your ${label} was resolved`,
      body: `${actor} marked your ${label} "${subject}" resolved on ${when}.${details ? `\n\n${details}` : ""}\n\n${link}`,
      dedupeKey: `support-employee:${report.id}:resolved:${minuteKey(now)}`,
      urgent: false,
      priority
    };
  }
  return {
    audience: "submitter",
    title: `Update on your ${label}`,
    body: `${actor} updated your ${label} "${subject}" to ${status} on ${when}.\n\n${link}`,
    dedupeKey: `support-employee:${report.id}:${status}:${minuteKey(now)}`,
    urgent: false,
    priority
  };
}

export function managementAlertForNewSubmission(report: ManagementReport, actor: string): SupportNotifyPlan {
  const label = supportItemLabel(report);
  const subject = supportSubject(report);
  const who = supportSubmitterName(report);
  const when = formatSupportWhen(report.created_at);
  const priorityLabel = report.priority ?? "Normal";
  return {
    audience: "management",
    title: `New ${label} needs attention: ${subject}`,
    body: `${who} filed a ${label}.\nSubject: ${subject}\nSubmitted: ${when}\nPriority: ${priorityLabel}\nManagement attention is required.\nOpen it: ${SUPPORT_MANAGEMENT_PATH}`,
    dedupeKey: `support-management:${report.id}:created`,
    urgent: true,
    priority: "Urgent"
  };
}

export function attentionFlag(report: ManagementReport, now = Date.now()) {
  const status = canonicalSupportStatus(report.admin_status ?? report.status);
  if (!isOpenWorkflowStatus(status)) return null;
  const anchor = status === "New" ? report.created_at : report.updated_at || report.created_at;
  const hours = (now - new Date(anchor).getTime()) / 36e5;
  if (!Number.isFinite(hours)) return null;
  if (status === "New" && hours >= UNACKNOWLEDGED_HOURS) return "Unacknowledged";
  if (hours >= UNRESOLVED_HOURS) return "Unresolved";
  return null;
}

export function hasVisibleManagementReply(report: ManagementReport) {
  if (plainSupportText(report.management_response)) return true;
  return (report.comments ?? []).some(
    (entry) => entry.visibility === "visible_to_submitter" && entry.user_role !== "staff" && entry.user_role !== report.submitted_by_role
  );
}

export function redactSupportForSubmitter(report: ManagementReport): ManagementReport {
  return {
    ...report,
    comments: (report.comments ?? []).filter((entry) => entry.visibility === "visible_to_submitter"),
    audit_history: [],
    related_notes: null
  };
}

function statusPatch(
  report: ManagementReport,
  status: SupportWorkflowStatus,
  actor: string,
  now: string,
  extra: Partial<ManagementReport> = {}
): Partial<ManagementReport> {
  return {
    ...extra,
    admin_status: status as SupportAdminStatus,
    status: workflowStatusToLegacy(status),
    ...statusTimestamps(report, status, actor, now),
    updated_at: now,
    audit_history: appendAudit(report, "change_status", canonicalSupportStatus(report.admin_status), status, actor, now)
  };
}

export function planSupportAction(
  report: ManagementReport,
  action: string,
  input: Record<string, unknown>,
  actor: string,
  now = new Date().toISOString()
): SupportActionPlan {
  const current = canonicalSupportStatus(report.admin_status ?? report.status);
  const role = String(input.user_role ?? "admin");
  const userId = String(input.user_id ?? "") || null;

  if (action === "acknowledge" || (action === "change_status" && canonicalSupportStatus(String(input.status ?? "")) === "Acknowledged" && current === "New")) {
    if (current !== "New" && action === "acknowledge") return { unchanged: true, patch: {}, notify: null };
    const patch = statusPatch(report, "Acknowledged", actor, now);
    return { unchanged: false, patch, notify: employeeStatusNotice(report, "Acknowledged", actor, now) };
  }

  if (action === "mark_in_progress" || (action === "change_status" && canonicalSupportStatus(String(input.status ?? "")) === "In Progress")) {
    if (current === "In Progress") return { unchanged: true, patch: {}, notify: null };
    return {
      unchanged: false,
      patch: statusPatch(report, "In Progress", actor, now),
      notify: employeeStatusNotice(report, "In Progress", actor, now)
    };
  }

  if (action === "change_status" || action === "close" || action === "reopen" || action === "mark_reviewed") {
    const requested =
      action === "close"
        ? "Closed"
        : action === "reopen"
          ? "In Progress"
          : action === "mark_reviewed"
            ? "Resolved"
            : canonicalSupportStatus(String(input.status ?? ""));
    if (requested === current) return { unchanged: true, patch: {}, notify: null };
    const resolution = plainSupportText(String(input.resolution ?? input.body ?? ""));
    const patch = statusPatch(report, requested, actor, now, resolution ? { management_response: resolution } : {});
    return {
      unchanged: false,
      patch,
      notify: employeeStatusNotice(report, requested, actor, now, resolution)
    };
  }

  if (action === "assign") {
    const assigned = String(input.assigned_to ?? "").trim();
    const acknowledging = current === "New";
    const stamped = acknowledging ? statusPatch(report, "Acknowledged", actor, now) : { updated_at: now };
    return {
      unchanged: false,
      patch: {
        ...stamped,
        assigned_to: assigned || null,
        assigned_to_user_id: String(input.assigned_to_user_id ?? "") || null,
        audit_history: appendAudit(
          { ...report, audit_history: (stamped.audit_history as SupportAuditEntry[] | undefined) ?? report.audit_history },
          "assign",
          report.assigned_to ?? null,
          assigned || null,
          actor,
          now
        )
      },
      notify: acknowledging ? employeeStatusNotice(report, "Acknowledged", actor, now) : null
    };
  }

  if (action === "change_priority") {
    const priority = String(input.priority ?? "");
    if (!isSupportPriority(priority)) throw new Error("Choose Urgent, High, Normal, or Low.");
    if ((report.priority ?? "Normal") === priority) return { unchanged: true, patch: {}, notify: null };
    return {
      unchanged: false,
      patch: {
        priority,
        updated_at: now,
        audit_history: appendAudit(report, "change_priority", report.priority ?? "Normal", priority, actor, now)
      },
      notify: null
    };
  }

  if (action === "add_internal_note") {
    const body = plainSupportText(String(input.body ?? ""));
    if (!body) throw new Error("Internal note is required.");
    const entry = comment(body, actor, role, "internal", now, userId);
    return {
      unchanged: false,
      patch: {
        comments: [...(report.comments ?? []), entry],
        updated_at: now,
        audit_history: appendAudit(report, "add_internal_note", null, body.slice(0, 120), actor, now)
      },
      notify: null
    };
  }

  if (action === "add_response") {
    const body = plainSupportText(String(input.body ?? ""));
    if (!body) throw new Error("Response is required.");
    const entry = comment(body, actor, role, "visible_to_submitter", now, userId);
    const resolve = input.mark_resolved === true;
    const nextStatus: SupportWorkflowStatus = resolve ? "Resolved" : current === "New" || current === "Acknowledged" ? "In Progress" : current;
    const stamped = nextStatus === current ? {} : statusPatch(report, nextStatus, actor, now);
    return {
      unchanged: false,
      patch: {
        ...stamped,
        management_response: body,
        comments: [...(report.comments ?? []), entry],
        updated_at: now,
        audit_history: appendAudit(
          { ...report, audit_history: (stamped.audit_history as SupportAuditEntry[] | undefined) ?? report.audit_history },
          "add_response",
          null,
          body.slice(0, 120),
          actor,
          now
        )
      },
      notify: {
        audience: "submitter",
        title: resolve ? `Your ${supportItemLabel(report)} was resolved` : `Response to your ${supportItemLabel(report)}`,
        body: `${actor} sent a message about "${supportSubject(report)}" on ${formatSupportWhen(now)}.\n\n${body}\n\nOpen your submissions: ${SUPPORT_EMPLOYEE_PATH}`,
        dedupeKey: `support-employee:${report.id}:response:${entry.id}`,
        urgent: report.priority === "Urgent",
        priority: report.priority === "Low" || report.priority === "High" || report.priority === "Urgent" ? report.priority : "Normal"
      }
    };
  }

  if (action === "add_submitter_reply") {
    const body = plainSupportText(String(input.body ?? ""));
    if (!body) throw new Error("Response is required.");
    const submitterEmail = report.created_by?.trim().toLowerCase();
    const actorEmail = actor.trim().toLowerCase();
    if (!submitterEmail || submitterEmail !== actorEmail) {
      throw new Error("You can only reply to your own submissions.");
    }
    const entry = comment(body, report.submitted_by_name ?? actor, String(input.user_role ?? report.submitted_by_role ?? "staff"), "visible_to_submitter", now, userId);
    return {
      unchanged: false,
      patch: {
        admin_status: "In Progress",
        status: "Open",
        in_progress_at: report.in_progress_at ?? now,
        closed_at: null,
        comments: [...(report.comments ?? []), entry],
        updated_at: now,
        audit_history: appendAudit(report, "add_submitter_reply", current, "In Progress", actor, now)
      },
      notify: {
        audience: "management",
        title: `Reply on a ${supportItemLabel(report)}: ${supportSubject(report)}`,
        body: `${supportSubmitterName(report)} replied. Management attention is required.\n\n${body.slice(0, 280)}\n\nOpen it: ${SUPPORT_MANAGEMENT_PATH}`,
        dedupeKey: `support-management:${report.id}:reply:${entry.id}`,
        urgent: true,
        priority: "Urgent"
      }
    };
  }

  if (action === "escalate") {
    const destination = String(input.escalation_destination ?? "HR / Owner").trim() || "HR / Owner";
    const next = current === "New" ? "Acknowledged" : current === "Resolved" || current === "Closed" ? "In Progress" : current;
    const stamped = next === current ? { updated_at: now } : statusPatch(report, next, actor, now);
    return {
      unchanged: false,
      patch: {
        ...stamped,
        escalated_at: now,
        escalated_by: actor,
        escalation_destination: destination,
        priority: "Urgent",
        audit_history: appendAudit(
          { ...report, audit_history: (stamped.audit_history as SupportAuditEntry[] | undefined) ?? report.audit_history },
          "escalate",
          report.escalation_destination ?? null,
          destination,
          actor,
          now
        )
      },
      notify: {
        audience: "management",
        title: `Escalated ${supportItemLabel(report)}: ${supportSubject(report)}`,
        body: `${actor} escalated this ${supportItemLabel(report)} to ${destination}. Management attention is required.\n\nOpen it: ${SUPPORT_MANAGEMENT_PATH}`,
        dedupeKey: `support-management:${report.id}:escalate:${minuteKey(now)}`,
        urgent: true,
        priority: "Urgent"
      }
    };
  }

  if (action === "resend_employee_notice") {
    return {
      unchanged: true,
      patch: {},
      notify: employeeStatusNotice(report, current, actor, now, report.management_response)
    };
  }

  if (action === "retry_management_alert") {
    return {
      unchanged: false,
      patch: {},
      notify: managementAlertForNewSubmission(report, actor)
    };
  }

  throw new Error("Unsupported action.");
}
