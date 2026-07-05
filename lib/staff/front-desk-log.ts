import type { CrossoverMessage, StaffOpsPriority, StaffOpsStatus } from "@/lib/staff/admin-ops";

/** Shift log types with badge tone keys for CSS. */
export const SHIFT_LOG_TYPES = [
  "Owner Complaint",
  "Owner Request",
  "Dog Update",
  "New Dog Assessment",
  "Grooming Note",
  "Training Note",
  "Transportation Note",
  "Daycare Note",
  "Boarding / Overnight Note",
  "Medical / Health Note",
  "Lost Belongings",
  "Facility Issue",
  "Staff Issue",
  "Payment / Billing Note",
  "Schedule / Reservation Issue",
  "General Shift Note",
  "Reminder",
  "Management Follow Up Needed"
] as const;

export type ShiftLogType = (typeof SHIFT_LOG_TYPES)[number];

export const SHIFT_LOG_TYPE_TONES: Record<ShiftLogType, string> = {
  "Owner Complaint": "complaint",
  "Owner Request": "request",
  "Dog Update": "dog",
  "New Dog Assessment": "assessment",
  "Grooming Note": "grooming",
  "Training Note": "training",
  "Transportation Note": "transport",
  "Daycare Note": "daycare",
  "Boarding / Overnight Note": "boarding",
  "Medical / Health Note": "medical",
  "Lost Belongings": "lost",
  "Facility Issue": "facility",
  "Staff Issue": "staff",
  "Payment / Billing Note": "billing",
  "Schedule / Reservation Issue": "schedule",
  "General Shift Note": "general",
  Reminder: "reminder",
  "Management Follow Up Needed": "management"
};

export const SHIFT_LOG_PRIORITIES = ["Low", "Normal", "Medium", "High", "Urgent", "Critical"] as const;

export const SHIFT_LOG_STATUSES = [
  "Open",
  "In Progress",
  "Waiting on Owner",
  "Waiting on Staff",
  "Needs Management Review",
  "Scheduled",
  "Completed",
  "Resolved",
  "Archived",
  "Active",
  "Pending Review"
] as const;

export const OPEN_SHIFT_LOG_STATUSES: StaffOpsStatus[] = [
  "Open",
  "Active",
  "In Progress",
  "Waiting on Owner",
  "Waiting on Staff",
  "Needs Management Review",
  "Scheduled",
  "Pending Review"
];

export const ASSIGNMENT_TEAMS = [
  "Front Desk Team",
  "Team Leaders",
  "Management",
  "Grooming Team",
  "Training Team",
  "Daycare Team",
  "Transportation Team",
  "Overnight Team",
  "Maintenance Team"
] as const;

export type ShiftLogTemplate = {
  title: string;
  log_type: ShiftLogType;
  subject: string;
  details: string;
  priority: StaffOpsPriority;
  status: StaffOpsStatus;
  assigned_to: string;
  needs_management_review: boolean;
  urgent: boolean;
};

export const SHIFT_LOG_TEMPLATES: ShiftLogTemplate[] = [
  {
    title: "Owner Complaint",
    log_type: "Owner Complaint",
    subject: "Owner complaint - [Owner/Dog Name]",
    details:
      "Owner concern logged during front desk shift:\n[Add what the owner reported]\n\nWhat front desk already said or did:\n[Add response given]\n\nNext step needed:\n[Add what management or the team needs to do]",
    priority: "High",
    status: "Needs Management Review",
    assigned_to: "Management",
    needs_management_review: true,
    urgent: false
  },
  {
    title: "Owner Request",
    log_type: "Owner Request",
    subject: "Owner request - [Owner/Dog Name]",
    details:
      "Owner requested:\n[Add request]\n\nWhat needs to happen next:\n[Add action needed]\n\nNotes for next coordinator:\n[Add anything the next person should know]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Front Desk Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "New Dog Assessment",
    log_type: "New Dog Assessment",
    subject: "New dog assessment - [Dog Name]",
    details:
      "Assessment note:\n[Add behavior, handling notes, yard fit, owner requests, and anything staff should know]\n\nWhat worked well:\n[Add helpful handling notes]\n\nWhat the next team needs to watch:\n[Add reminders or concerns]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Daycare Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Dog Behavior Update",
    log_type: "Dog Update",
    subject: "Dog behavior update - [Dog Name]",
    details:
      "Behavior observed:\n[Add what happened]\n\nWhat staff tried:\n[Add what helped or did not help]\n\nTeam note:\n[Add what handlers/front desk should know moving forward]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Daycare Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Dog Health Watch",
    log_type: "Medical / Health Note",
    subject: "Health watch - [Dog Name]",
    details:
      "Health concern noticed:\n[Add what was seen]\n\nTime noticed:\n[Add time]\n\nStaff involved:\n[Add staff names]\n\nOwner contacted?\n[Yes/No and details]\n\nNext step:\n[Add what needs to happen next]",
    priority: "High",
    status: "Needs Management Review",
    assigned_to: "Management",
    needs_management_review: true,
    urgent: false
  },
  {
    title: "Lost Belongings",
    log_type: "Lost Belongings",
    subject: "Lost belongings - [Dog/Owner Name]",
    details:
      "Item reported missing:\n[Add item]\n\nLast known location:\n[Add location if known]\n\nWho checked:\n[Add staff/location checked]\n\nNext step:\n[Add who owns the follow-up]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Front Desk Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Facility Issue",
    log_type: "Facility Issue",
    subject: "Facility issue - [Location]",
    details:
      "Issue reported:\n[Add issue]\n\nLocation:\n[Add location]\n\nSafety concern?\n[Add yes/no and details]\n\nTemporary workaround:\n[Add what staff should do until fixed]",
    priority: "High",
    status: "Needs Management Review",
    assigned_to: "Maintenance Team",
    needs_management_review: true,
    urgent: false
  },
  {
    title: "Staff Coverage Note",
    log_type: "Staff Issue",
    subject: "Coverage note - [Department/Time]",
    details:
      "Coverage issue:\n[Add what is happening]\n\nTime window:\n[Add time]\n\nSupport needed:\n[Add what help is needed]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Management",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Reservation / Schedule Issue",
    log_type: "Schedule / Reservation Issue",
    subject: "Reservation or schedule issue - [Owner/Dog Name]",
    details:
      "Issue:\n[Add reservation, service, or schedule problem]\n\nWhat front desk already did:\n[Add action taken]\n\nWhat needs follow-up:\n[Add next step]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Front Desk Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Payment / Billing Note",
    log_type: "Payment / Billing Note",
    subject: "Payment/billing note - [Owner/Dog Name]",
    details:
      "Billing/payment issue:\n[Add details]\n\nWhat was reviewed:\n[Add package, invoice, service, or charge info]\n\nNext step:\n[Add who needs to follow up]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Management",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Grooming Handoff",
    log_type: "Grooming Note",
    subject: "Grooming handoff - [Dog Name]",
    details:
      "Grooming note:\n[Add service, owner request, handling note, or timing concern]\n\nWhat groomer/front desk should know:\n[Add important details]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Grooming Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Training Handoff",
    log_type: "Training Note",
    subject: "Training handoff - [Dog Name]",
    details:
      "Training note:\n[Add behavior, owner request, trainer note, or handling concern]\n\nWhat the team should follow:\n[Add trainer/team guidance]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Training Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Transportation Delay",
    log_type: "Transportation Note",
    subject: "Transportation delay - [Route/Dog Name]",
    details:
      "Delay/update:\n[Add current route issue]\n\nETA or impact:\n[Add timing]\n\nOwner communication needed?\n[Yes/No]",
    priority: "Medium",
    status: "Open",
    assigned_to: "Transportation Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "End of Shift Handoff",
    log_type: "General Shift Note",
    subject: "End of shift handoff - [Date/Time]",
    details:
      "Open items from this shift:\n[Add items]\n\nOwner follow-ups:\n[Add owner calls/emails needed]\n\nDog notes:\n[Add dog-specific reminders]\n\nFacility/staff notes:\n[Add anything the next person needs]",
    priority: "Normal",
    status: "Open",
    assigned_to: "Front Desk Team",
    needs_management_review: false,
    urgent: false
  },
  {
    title: "Management Follow Up Needed",
    log_type: "Management Follow Up Needed",
    subject: "Management follow-up needed - [Owner/Dog/Issue]",
    details:
      "Reason management is needed:\n[Add issue]\n\nWhat front desk already did:\n[Add response/action taken]\n\nRecommended next step:\n[Add what management should review or decide]",
    priority: "High",
    status: "Needs Management Review",
    assigned_to: "Management",
    needs_management_review: true,
    urgent: false
  }
];

export function shiftLogDetails(item: CrossoverMessage) {
  return item.details?.trim() || item.message?.trim() || "";
}

export function shiftLogType(item: CrossoverMessage): ShiftLogType | string {
  return item.log_type?.trim() || "General Shift Note";
}

export function shiftLogSubmittedBy(item: CrossoverMessage) {
  return item.submitted_by?.trim() || item.created_by?.trim() || "Staff";
}

export function shiftLogAssignedTo(item: CrossoverMessage) {
  return item.assigned_to?.trim() || item.assigned_team?.trim() || item.reported_to?.trim() || "Unassigned";
}

export function isOpenShiftLogStatus(status: StaffOpsStatus) {
  return OPEN_SHIFT_LOG_STATUSES.includes(status);
}

export function shouldAlertManagement(priority: StaffOpsPriority, urgent?: boolean, needsReview?: boolean) {
  if (needsReview) return true;
  if (urgent) return true;
  return priority === "High" || priority === "Urgent" || priority === "Critical";
}

export function priorityRank(priority: StaffOpsPriority) {
  const order: StaffOpsPriority[] = ["Low", "Normal", "Medium", "High", "Urgent", "Critical"];
  return order.indexOf(priority);
}

export function isDueToday(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function isLoggedToday(value: string | null | undefined) {
  return isDueToday(value);
}

export function formatShiftLogDayLabel(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function normalizeShiftLogRecord(item: CrossoverMessage): CrossoverMessage {
  return {
    ...item,
    log_type: item.log_type ?? "General Shift Note",
    details: item.details ?? item.message,
    message: item.details ?? item.message,
    submitted_by: item.submitted_by ?? item.created_by,
    created_by: item.submitted_by ?? item.created_by,
    status: item.status === "Active" && !item.log_type ? "Open" : item.status,
    needs_management_review: item.needs_management_review ?? item.status === "Needs Management Review"
  };
}
