import type { StaffOpsPriority, StaffOpsStatus } from "@/lib/staff/admin-ops";
import type { ShiftLogType } from "@/lib/staff/front-desk-log";

export type TemplateFieldType =
  | "text"
  | "textarea"
  | "select"
  | "date"
  | "datetime"
  | "time"
  | "number"
  | "checkbox"
  | "multiSelect"
  | "yesNo";

export type TemplateAction =
  | "needs_management_review"
  | "urgent"
  | "create_owner_follow_up"
  | "create_active_issue";

export type TemplateField = {
  key: string;
  label: string;
  type: TemplateFieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  helperText?: string;
  colSpan?: 1 | 2;
};

export type LogTemplateConfig = {
  id: string;
  label: string;
  description: string;
  logType: ShiftLogType;
  priority: StaffOpsPriority;
  status: StaffOpsStatus;
  assignedTo: string;
  departmentArea?: string;
  subjectTemplate: string;
  detailsTemplate: string;
  fields: TemplateField[];
  actions: TemplateAction[];
  actionDefaults?: Partial<Record<TemplateAction, boolean>>;
  /** Top-level fields — only used by Custom Log preset */
  showDogName?: boolean;
  showOwnerName?: boolean;
  showDueDate?: boolean;
  showReminderDateTime?: boolean;
  buildSubject?: (fields: TemplateFieldValues) => string;
};

export type TemplateFieldValues = Record<string, string | string[]>;

const yn = (key: string, label: string, required = false, helperText?: string): TemplateField => ({
  key,
  label,
  type: "yesNo",
  required,
  helperText
});

const sel = (key: string, label: string, options: string[], required = false): TemplateField => ({
  key,
  label,
  type: "select",
  options,
  required
});

const txt = (key: string, label: string, required = false, placeholder?: string, colSpan?: 1 | 2): TemplateField => ({
  key,
  label,
  type: "text",
  required,
  placeholder,
  colSpan
});

const area = (key: string, label: string, required = false, placeholder?: string): TemplateField => ({
  key,
  label,
  type: "textarea",
  required,
  placeholder,
  colSpan: 2
});

const dt = (key: string, label: string, required = false): TemplateField => ({
  key,
  label,
  type: "datetime",
  required
});

const date = (key: string, label: string, required = false): TemplateField => ({
  key,
  label,
  type: "date",
  required
});

const multi = (key: string, label: string, options: string[], required = false): TemplateField => ({
  key,
  label,
  type: "multiSelect",
  options,
  required
});

function fieldText(fields: TemplateFieldValues, key: string) {
  const value = fields[key];
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value ?? "").trim();
}

function subjectDogOwner(fields: TemplateFieldValues, prefix: string) {
  const dog = fieldText(fields, "dogName");
  const owner = fieldText(fields, "ownerName");
  const parts = [dog, owner].filter(Boolean);
  return parts.length ? `${prefix}${parts.join(" / ")}` : prefix.replace(/[-–]\s*$/, "").trim();
}

export const CUSTOM_LOG_TEMPLATE: LogTemplateConfig = {
  id: "custom",
  label: "Custom Log",
  description: "General shift note with standard fields.",
  logType: "General Shift Note",
  priority: "Normal",
  status: "Open",
  assignedTo: "Front Desk Team",
  departmentArea: "Front Desk",
  subjectTemplate: "[Subject]",
  detailsTemplate: "[Add shift notes]",
  fields: [],
  actions: ["needs_management_review", "urgent", "create_owner_follow_up", "create_active_issue"],
  showDogName: true,
  showOwnerName: true,
  showDueDate: true,
  showReminderDateTime: true
};

export const LOG_TEMPLATES: LogTemplateConfig[] = [
  {
    id: "owner_complaint",
    label: "Owner Complaint",
    description: "Document owner concern and follow-up.",
    logType: "Owner Complaint",
    priority: "High",
    status: "Needs Management Review",
    assignedTo: "Management",
    departmentArea: "Front Desk",
    subjectTemplate: "Owner complaint - [Owner/Dog]",
    detailsTemplate:
      "Owner complaint:\n[What owner reported]\n\nDog / owner:\n[Dog name / Owner name]\n\nImmediate action taken:\n[Add action taken]\n\nFollow-up needed:\n[Yes/No and by who]",
    fields: [
      txt("ownerName", "Owner Name", true),
      txt("dogName", "Dog Name"),
      sel("complaintType", "Complaint Type", ["Staff communication", "Dog care concern", "Grooming concern", "Training concern", "Billing concern", "Webcam concern", "Taxi / transportation concern", "Other"], true),
      sel("complaintSource", "Complaint Source", ["Phone", "Email", "In person", "Gingr message", "Other"]),
      area("whatHappened", "What Happened", true, "What the owner reported"),
      area("ownerRequestedResolution", "Owner Requested Resolution"),
      area("immediateActionTaken", "Immediate Action Taken"),
      yn("managerNotified", "Manager Notified"),
      yn("followUpNeeded", "Follow-Up Needed")
    ],
    actions: ["needs_management_review", "urgent", "create_owner_follow_up", "create_active_issue"],
    actionDefaults: { needs_management_review: true, create_owner_follow_up: true },
    buildSubject: (f) => subjectDogOwner(f, "Owner complaint - ")
  },
  {
    id: "owner_request",
    label: "Owner Request",
    description: "Track owner requests and next steps.",
    logType: "Owner Request",
    priority: "Medium",
    status: "Open",
    assignedTo: "Front Desk Team",
    departmentArea: "Front Desk",
    subjectTemplate: "Owner request - [Owner/Dog]",
    detailsTemplate:
      "Owner request:\n[Request details]\n\nDog / owner:\n[Dog name / Owner name]\n\nDue date:\n[Add date/time if needed]\n\nFollow-up:\n[Add next step]",
    fields: [
      txt("ownerName", "Owner Name", true),
      txt("dogName", "Dog Name"),
      sel("requestType", "Request Type", ["Schedule change", "Package/pricing question", "Grooming request", "Training request", "Boarding request", "Taxi request", "Special handling note", "Other"], true),
      area("requestDetails", "Request Details", true),
      dt("dueDate", "Due Date"),
      yn("followUpNeeded", "Follow-Up Needed"),
      yn("managerReviewNeeded", "Manager Review Needed")
    ],
    actions: ["create_owner_follow_up", "needs_management_review", "urgent"],
    actionDefaults: { create_owner_follow_up: true },
    buildSubject: (f) => subjectDogOwner(f, "Owner request - ")
  },
  {
    id: "new_dog_assessment",
    label: "New Dog Assessment",
    description: "Document assessment notes for a new dog.",
    logType: "New Dog Assessment",
    priority: "Medium",
    status: "Open",
    assignedTo: "Daycare Team",
    departmentArea: "Assessments",
    subjectTemplate: "New dog assessment - [Dog Name]",
    detailsTemplate:
      "New dog assessment:\n[Dog name / Owner name]\n\nObserved behavior:\n[Add notes]\n\nHandling notes:\n[Add notes]\n\nRecommended next step:\n[Add recommendation]",
    fields: [
      txt("dogName", "Dog Name", true),
      txt("ownerName", "Owner Name", true),
      dt("assessmentDate", "Assessment Date/Time", true),
      txt("dogAge", "Dog Age"),
      txt("breed", "Breed"),
      sel("temperament", "Temperament", ["Social", "Nervous", "High energy", "Reactive", "Shy", "Unknown"]),
      area("behaviorNotes", "Behavior Notes", true),
      area("handlingNotes", "Handling Notes"),
      sel("recommendedYard", "Recommended Yard", ["Small yard", "Big yard", "Third yard", "Private space", "Trainer review needed"]),
      yn("followUpNeeded", "Follow-Up Needed")
    ],
    actions: ["create_owner_follow_up", "needs_management_review"],
    buildSubject: (f) => `New dog assessment - ${fieldText(f, "dogName") || "[Dog Name]"}`
  },
  {
    id: "dog_behavior_update",
    label: "Dog Behavior Update",
    description: "Log behavior observed on shift.",
    logType: "Dog Update",
    priority: "Medium",
    status: "Open",
    assignedTo: "Team Leaders",
    departmentArea: "Daycare",
    subjectTemplate: "Dog behavior update - [Dog Name]",
    detailsTemplate:
      "Dog behavior update:\n[Dog name]\n\nWhat happened:\n[Add clear details]\n\nAction taken:\n[Add staff response]\n\nWatch note:\n[Add anything next shift should know]",
    fields: [
      txt("dogName", "Dog Name", true),
      txt("ownerName", "Owner Name"),
      sel("behaviorType", "Behavior Type", ["Great play", "Nervous behavior", "Mounting", "Snapping", "Resource guarding", "Overstimulation", "Not social", "Needs break", "Other"], true),
      sel("location", "Location", ["Small yard", "Big yard", "Third yard", "Room", "Lobby", "Grooming", "Transport"]),
      area("whatHappened", "What Happened", true),
      area("staffActionTaken", "Staff Action Taken", true),
      txt("dogsInvolved", "Other Dogs Involved"),
      yn("teamLeadNotified", "Team Lead Notified")
    ],
    actions: ["create_active_issue", "needs_management_review", "urgent"],
    buildSubject: (f) => `Dog behavior update - ${fieldText(f, "dogName") || "[Dog Name]"}`
  },
  {
    id: "dog_health_watch",
    label: "Dog Health Watch",
    description: "Document observed health concerns without diagnosing.",
    logType: "Medical / Health Note",
    priority: "High",
    status: "Needs Management Review",
    assignedTo: "Team Leaders",
    departmentArea: "Front Desk",
    subjectTemplate: "Health watch - [Dog Name] - [Concern]",
    detailsTemplate:
      "Dog health watch:\n[Dog name]\n\nConcern observed:\n[Add symptoms/what staff saw]\n\nAction taken:\n[Activity reduced / manager notified / owner contacted]\n\nNext check:\n[Add reminder]",
    fields: [
      txt("dogName", "Dog Name", true),
      txt("ownerName", "Owner Name"),
      sel("healthConcern", "Health Concern Observed", ["Limping", "Vomiting", "Diarrhea", "Coughing", "Not eating", "Lethargic", "Injury/mark", "Medication concern", "Other"], true),
      area("symptomsObserved", "Symptoms Observed", true, "Describe what staff observed — do not diagnose"),
      dt("timeFirstSeen", "Time First Seen"),
      yn("activityReduced", "Activity Reduced"),
      yn("managerNotified", "Manager Notified", true),
      yn("ownerContacted", "Owner Contacted"),
      yn("vetRecommended", "Vet Visit Recommended")
    ],
    actions: ["needs_management_review", "urgent", "create_owner_follow_up", "create_active_issue"],
    actionDefaults: { needs_management_review: true, urgent: true },
    buildSubject: (f) => {
      const dog = fieldText(f, "dogName") || "[Dog Name]";
      const concern = fieldText(f, "healthConcern") || "[Health Concern]";
      return `Health watch - ${dog} - ${concern}`;
    }
  },
  {
    id: "lost_belongings",
    label: "Lost Belongings",
    description: "Track missing items and owner updates.",
    logType: "Lost Belongings",
    priority: "Medium",
    status: "Open",
    assignedTo: "Front Desk Team",
    departmentArea: "Front Desk",
    subjectTemplate: "Lost belongings - [Dog/Owner]",
    detailsTemplate:
      "Item reported missing:\n[Add item]\n\nDog / owner:\n[Dog name / Owner name]\n\nLast known location:\n[Add location]\n\nWho checked:\n[Add staff/location checked]\n\nNext step:\n[Add owner follow-up or continued search]",
    fields: [
      txt("dogName", "Dog Name", true),
      txt("ownerName", "Owner Name", true),
      txt("missingItem", "Missing Item", true),
      area("itemDescription", "Item Description"),
      txt("lastKnownLocation", "Last Known Location", true),
      dt("lastSeenTime", "Last Seen Time"),
      txt("whoChecked", "Who Checked", true),
      multi("areasChecked", "Areas Checked", ["Lobby", "Dog room", "Yard", "Grooming", "Taxi", "Laundry", "Lost and found", "Owner bag/cubby"]),
      yn("ownerFollowUpNeeded", "Owner Follow-Up Needed"),
      dt("dueDate", "Due Date"),
      dt("reminderDateTime", "Reminder Date / Time")
    ],
    actions: ["create_owner_follow_up", "urgent", "needs_management_review"],
    actionDefaults: { create_owner_follow_up: true },
    buildSubject: (f) => subjectDogOwner(f, "Lost belongings - ")
  },
  {
    id: "facility_issue",
    label: "Facility Issue",
    description: "Flag maintenance or safety concerns.",
    logType: "Facility Issue",
    priority: "High",
    status: "Needs Management Review",
    assignedTo: "Maintenance Team",
    departmentArea: "Facility",
    subjectTemplate: "Facility issue - [Location] - [Issue Type]",
    detailsTemplate:
      "Facility issue:\n[Location]\n\nIssue:\n[Describe issue]\n\nSafety impact:\n[Add risk level]\n\nAction taken:\n[Add what was done / who was notified]",
    fields: [
      sel("location", "Location", ["Lobby", "Small yard", "Big yard", "Third yard", "Blue room", "Green room", "Orange room", "Grooming", "Kitchen", "Laundry", "Taxi area", "Other"], true),
      sel("issueType", "Issue Type", ["Cleaning issue", "Broken item", "Gate/door issue", "Plumbing", "Electrical", "Pest concern", "HVAC/temperature", "Safety hazard", "Other"], true),
      area("issueDetails", "Issue Details", true),
      sel("safetyRisk", "Safety Risk", ["No immediate risk", "Low", "Medium", "High", "Urgent"]),
      area("actionTaken", "Action Taken"),
      yn("managerNotified", "Manager Notified"),
      txt("relatedDog", "Related Dog (optional)")
    ],
    actions: ["needs_management_review", "urgent", "create_active_issue"],
    actionDefaults: { needs_management_review: true },
    buildSubject: (f) => {
      const loc = fieldText(f, "location") || "[Location]";
      const issue = fieldText(f, "issueType") || "[Issue Type]";
      return `Facility issue - ${loc} - ${issue}`;
    }
  },
  {
    id: "staff_coverage_note",
    label: "Staff Coverage Note",
    description: "Document staffing gaps and coverage plans.",
    logType: "Staff Issue",
    priority: "Medium",
    status: "Open",
    assignedTo: "Management",
    departmentArea: "Management",
    subjectTemplate: "Staff coverage note - [Shift/Area]",
    detailsTemplate:
      "Staff coverage note:\n[Shift / area]\n\nIssue:\n[Add issue]\n\nCoverage plan:\n[Add who is covering and what still needs help]\n\nManager notified:\n[Yes/No]",
    fields: [
      sel("shift", "Shift", ["AM", "Midday", "PM", "Overnight"], true),
      date("date", "Date", true),
      sel("areaAffected", "Area Affected", ["Front Desk", "Small yard", "Big yard", "Third yard", "Grooming", "Training", "Transport", "Boarding"], true),
      sel("coverageIssue", "Coverage Issue", ["Late arrival", "Call out", "Short staffed", "Break coverage needed", "Role coverage gap", "Other"], true),
      txt("staffInvolved", "Staff Involved"),
      area("coveragePlan", "Coverage Plan", true),
      yn("managerNotified", "Manager Notified")
    ],
    actions: ["needs_management_review", "urgent"],
    buildSubject: (f) => {
      const shift = fieldText(f, "shift") || "[Shift]";
      const areaName = fieldText(f, "areaAffected") || "[Area]";
      return `Coverage note - ${shift} - ${areaName}`;
    }
  },
  {
    id: "reservation_schedule_issue",
    label: "Reservation / Schedule Issue",
    description: "Track Gingr reservation or schedule problems.",
    logType: "Schedule / Reservation Issue",
    priority: "Medium",
    status: "Open",
    assignedTo: "Front Desk Team",
    departmentArea: "Front Desk",
    subjectTemplate: "Reservation / schedule issue - [Dog/Owner]",
    detailsTemplate:
      "Reservation / schedule issue:\n[Dog / Owner]\n\nReservation date:\n[Date]\n\nIssue:\n[Describe issue]\n\nCorrection needed:\n[Add correction]\n\nOwner follow-up:\n[Yes/No]",
    fields: [
      txt("ownerName", "Owner Name", true),
      txt("dogName", "Dog Name", true),
      date("reservationDate", "Reservation Date", true),
      sel("issueType", "Issue Type", ["Wrong date", "Missing reservation", "Duplicate reservation", "Wrong service", "Capacity concern", "Boarding issue", "Daycare issue", "Training issue", "Grooming issue", "Taxi issue", "Other"], true),
      txt("gingrReference", "Gingr Reference"),
      area("issueDetails", "Issue Details", true),
      area("correctionNeeded", "Correction Needed", true),
      yn("ownerFollowUpNeeded", "Owner Follow-Up Needed")
    ],
    actions: ["create_owner_follow_up", "needs_management_review"],
    buildSubject: (f) => subjectDogOwner(f, "Reservation / schedule issue - ")
  },
  {
    id: "payment_billing_note",
    label: "Payment / Billing Note",
    description: "Document billing or payment issues.",
    logType: "Payment / Billing Note",
    priority: "Medium",
    status: "Open",
    assignedTo: "Management",
    departmentArea: "Front Desk",
    subjectTemplate: "Payment / billing note - [Owner/Dog]",
    detailsTemplate:
      "Payment / billing note:\n[Owner / Dog]\n\nIssue:\n[Describe billing issue]\n\nAmount / invoice:\n[Add if known]\n\nAction taken:\n[Add what was done]\n\nNext step:\n[Add follow-up needed]",
    fields: [
      txt("ownerName", "Owner Name", true),
      txt("dogName", "Dog Name"),
      sel("billingIssueType", "Billing Issue Type", ["Incorrect charge", "Duplicate charge", "Missing payment", "Package issue", "Refund request", "Store credit", "Klarna/payment plan", "Other"], true),
      { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
      txt("gingrInvoice", "Gingr Invoice / Reference"),
      area("issueDetails", "Issue Details", true),
      area("actionTaken", "Action Taken"),
      yn("managementReviewNeeded", "Management Review Needed")
    ],
    actions: ["needs_management_review", "create_owner_follow_up"],
    actionDefaults: { needs_management_review: true },
    buildSubject: (f) => {
      const owner = fieldText(f, "ownerName") || "[Owner Name]";
      const issue = fieldText(f, "billingIssueType") || "[Billing Issue Type]";
      return `Billing note - ${owner} - ${issue}`;
    }
  },
  {
    id: "grooming_handoff",
    label: "Grooming Handoff",
    description: "Pass grooming details to the team.",
    logType: "Grooming Note",
    priority: "High",
    status: "Open",
    assignedTo: "Grooming Team",
    departmentArea: "Grooming",
    subjectTemplate: "Grooming handoff - [Dog Name]",
    detailsTemplate:
      "Grooming handoff:\n[Dog / Owner]\n\nService:\n[Add service]\n\nHandling notes:\n[Add notes]\n\nInstructions:\n[Catch needed? Slip lead?]\n\nOwner requests:\n[Add request]",
    fields: [
      txt("dogName", "Dog Name", true),
      txt("ownerName", "Owner Name", true),
      txt("groomerName", "Groomer Name"),
      sel("groomingService", "Grooming Service", ["Bath", "Brush", "Nail trim", "Ear cleaning", "Full groom", "Ultimate Spa", "Add-on service", "Other"]),
      dt("appointmentTime", "Appointment Time"),
      area("handlingNotes", "Handling Notes"),
      yn("catchNeeded", "Catch Needed"),
      yn("slipLeadNeeded", "Slip Lead Needed"),
      area("healthOrBehaviorNotes", "Health or Behavior Notes"),
      area("ownerRequests", "Owner Requests")
    ],
    actions: ["create_active_issue", "urgent", "needs_management_review"],
    buildSubject: (f) => `Grooming handoff - ${fieldText(f, "dogName") || "[Dog Name]"}`
  },
  {
    id: "training_handoff",
    label: "Training Handoff",
    description: "Pass training session notes to the team.",
    logType: "Training Note",
    priority: "Medium",
    status: "Open",
    assignedTo: "Training Team",
    departmentArea: "Training",
    subjectTemplate: "Training handoff - [Dog Name]",
    detailsTemplate:
      "Training handoff:\n[Dog / Owner]\n\nTraining focus:\n[Add goal]\n\nBehavior notes:\n[Add notes]\n\nOwner notes:\n[Add owner request or update]\n\nFollow-up:\n[Add next step]",
    fields: [
      txt("dogName", "Dog Name", true),
      txt("ownerName", "Owner Name", true),
      txt("trainerName", "Trainer Name"),
      sel("trainingService", "Training Service", ["Foundations", "Leash manners", "Recall", "Scent work", "Canine conditioning", "Private training", "Assessment", "Other"]),
      dt("sessionTime", "Session Time"),
      area("trainingGoal", "Training Goal", true),
      area("behaviorNotes", "Behavior Notes"),
      area("ownerNotes", "Owner Notes"),
      yn("followUpNeeded", "Follow-Up Needed")
    ],
    actions: ["create_owner_follow_up", "needs_management_review"],
    buildSubject: (f) => `Training handoff - ${fieldText(f, "dogName") || "[Dog Name]"}`
  },
  {
    id: "transportation_delay",
    label: "Transportation Delay",
    description: "Log route delays and owner communication.",
    logType: "Transportation Note",
    priority: "High",
    status: "Open",
    assignedTo: "Transportation Team",
    departmentArea: "Transportation",
    subjectTemplate: "Transportation delay - [Route]",
    detailsTemplate:
      "Transportation delay:\n[Pickup/drop-off/route]\n\nReason:\n[Add reason]\n\nETA:\n[Add ETA]\n\nOwner notified:\n[Yes/No]\n\nNotes:\n[Add details]",
    fields: [
      txt("dogName", "Dog Name"),
      txt("ownerName", "Owner Name"),
      txt("driverName", "Driver Name"),
      sel("routeType", "Route Type", ["Pickup", "Drop-off", "Hike transport", "Beach transport", "Other"]),
      sel("delayReason", "Delay Reason", ["Traffic", "Owner not home", "Dog not ready", "Route change", "Vehicle issue", "Safety issue", "Other"], true),
      { key: "eta", label: "ETA", type: "time" },
      yn("ownerNotified", "Owner Notified"),
      area("notes", "Notes", true)
    ],
    actions: ["create_owner_follow_up", "urgent", "needs_management_review"],
    buildSubject: (f) => {
      const route = fieldText(f, "routeType") || "Route";
      const dog = fieldText(f, "dogName");
      return dog ? `Transportation delay - ${route} - ${dog}` : `Transportation delay - ${route}`;
    }
  },
  {
    id: "end_of_shift_handoff",
    label: "End of Shift Handoff",
    description: "Pass key notes to the next shift.",
    logType: "General Shift Note",
    priority: "Normal",
    status: "Open",
    assignedTo: "Front Desk Team",
    departmentArea: "Front Desk",
    subjectTemplate: "End of shift handoff - [Shift] - [Date]",
    detailsTemplate:
      "End of shift handoff:\n[Shift]\n\nDogs to watch:\n[Add names/notes]\n\nOwner follow-ups:\n[Add follow-ups]\n\nFacility/staffing notes:\n[Add notes]\n\nUnresolved issues:\n[Add open items]\n\nReminders for next shift:\n[Add reminders]",
    fields: [
      sel("shift", "Shift", ["AM", "Midday", "PM", "Overnight"], true),
      date("handoffDate", "Handoff Date"),
      txt("handoffTo", "Handoff To"),
      area("unresolvedIssues", "Unresolved Issues"),
      area("dogsToWatch", "Dogs to Watch"),
      area("ownerFollowUps", "Owner Follow-Ups"),
      area("facilityNotes", "Facility Notes"),
      area("staffingNotes", "Staffing Notes"),
      area("reminders", "Reminders for Next Shift")
    ],
    actions: ["create_active_issue", "needs_management_review"],
    buildSubject: (f) => {
      const shift = fieldText(f, "shift") || "[Shift]";
      const dateVal = fieldText(f, "handoffDate") || new Date().toLocaleDateString();
      return `End of shift handoff - ${shift} - ${dateVal}`;
    }
  },
  {
    id: "management_follow_up",
    label: "Management Follow Up Needed",
    description: "Escalate issues that need management review.",
    logType: "Management Follow Up Needed",
    priority: "High",
    status: "Needs Management Review",
    assignedTo: "Management",
    departmentArea: "Management",
    subjectTemplate: "Management follow-up needed - [Issue Type]",
    detailsTemplate:
      "Management follow-up needed:\n[Issue type]\n\nSummary:\n[Add issue]\n\nWhat has been done:\n[Add action taken]\n\nManagement action requested:\n[Add what needs review/decision]\n\nDeadline:\n[Add urgency]",
    fields: [
      sel("followUpType", "Follow-Up Type", ["Owner issue", "Staff issue", "Dog safety issue", "Facility issue", "Billing issue", "Schedule issue", "Policy/protocol issue", "Other"], true),
      txt("relatedDog", "Related Dog"),
      txt("relatedOwner", "Related Owner"),
      txt("relatedStaff", "Related Staff"),
      area("issueSummary", "Issue Summary", true),
      area("whatHasBeenDone", "What Has Been Done"),
      area("requestedManagementAction", "Management Action Requested", true),
      sel("urgency", "Deadline / Urgency", ["Today", "Within 24 hours", "This week", "No deadline"])
    ],
    actions: ["needs_management_review", "create_active_issue", "urgent"],
    actionDefaults: { needs_management_review: true, create_active_issue: true },
    buildSubject: (f) => {
      const type = fieldText(f, "followUpType") || "[Issue Type]";
      return `Management follow-up needed - ${type}`;
    }
  }
];

export function getLogTemplateById(id: string | null | undefined): LogTemplateConfig | null {
  if (!id) return null;
  if (id === "custom") return CUSTOM_LOG_TEMPLATE;
  return LOG_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function getLogTemplateByLabel(label: string) {
  return LOG_TEMPLATES.find((template) => template.label === label) ?? null;
}

export function formatTemplateFieldValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value ?? "").trim();
}

export function validateTemplateFields(template: LogTemplateConfig, fields: TemplateFieldValues) {
  const errors: Record<string, string> = {};
  for (const field of template.fields) {
    if (!field.required) continue;
    const value = formatTemplateFieldValue(fields[field.key]);
    if (!value) errors[field.key] = `${field.label} is required.`;
  }
  return errors;
}

export function serializeTemplateFieldValues(fields: TemplateFieldValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      const joined = value.filter(Boolean).join(", ");
      if (joined) out[key] = joined;
    } else if (String(value ?? "").trim()) {
      out[key] = String(value).trim();
    }
  }
  return out;
}

const ACTION_LABELS: Record<TemplateAction, string> = {
  needs_management_review: "Needs Management Review",
  urgent: "Urgent",
  create_owner_follow_up: "Create Owner Follow Up",
  create_active_issue: "Create Active Issue"
};

export function templateActionLabel(action: TemplateAction) {
  return ACTION_LABELS[action];
}

export function compileTemplateDetails(template: LogTemplateConfig, fields: TemplateFieldValues) {
  let text = template.detailsTemplate;
  const replacements: Array<[RegExp, string]> = [
    [/\[What owner reported\]/gi, fieldText(fields, "whatHappened") || fieldText(fields, "requestDetails") || fieldText(fields, "issueSummary")],
    [/\[Dog name \/ Owner name\]/gi, [fieldText(fields, "dogName"), fieldText(fields, "ownerName")].filter(Boolean).join(" / ") || "[Dog name / Owner name]"],
    [/\[Dog \/ Owner\]/gi, [fieldText(fields, "dogName"), fieldText(fields, "ownerName")].filter(Boolean).join(" / ") || "[Dog / Owner]"],
    [/\[Owner \/ Dog\]/gi, [fieldText(fields, "ownerName"), fieldText(fields, "dogName")].filter(Boolean).join(" / ") || "[Owner / Dog]"],
    [/\[Dog name\]/gi, fieldText(fields, "dogName") || "[Dog name]"],
    [/\[Dog Name\]/g, fieldText(fields, "dogName") || "[Dog Name]"],
    [/\[Add action taken\]/gi, fieldText(fields, "immediateActionTaken") || fieldText(fields, "actionTaken") || fieldText(fields, "whatHasBeenDone") || "[Add action taken]"],
    [/\[Yes\/No and by who\]/gi, fieldText(fields, "followUpNeeded") || "[Yes/No and by who]"],
    [/\[Request details\]/gi, fieldText(fields, "requestDetails") || "[Request details]"],
    [/\[Add date\/time if needed\]/gi, fieldText(fields, "dueDate") || "[Add date/time if needed]"],
    [/\[Add next step\]/gi, fieldText(fields, "followUpNeeded") || fieldText(fields, "requestedManagementAction") || "[Add next step]"],
    [/\[Add notes\]/gi, fieldText(fields, "behaviorNotes") || fieldText(fields, "handlingNotes") || "[Add notes]"],
    [/\[Add recommendation\]/gi, fieldText(fields, "recommendedYard") || fieldText(fields, "trainingGoal") || "[Add recommendation]"],
    [/\[Add clear details\]/gi, fieldText(fields, "whatHappened") || "[Add clear details]"],
    [/\[Add staff response\]/gi, fieldText(fields, "staffActionTaken") || "[Add staff response]"],
    [/\[Add anything next shift should know\]/gi, fieldText(fields, "dogsToWatch") || "[Add anything next shift should know]"],
    [/\[Add symptoms\/what staff saw\]/gi, fieldText(fields, "symptomsObserved") || "[Add symptoms/what staff saw]"],
    [/\[Activity reduced \/ manager notified \/ owner contacted\]/gi, [
      fieldText(fields, "activityReduced") ? `Activity reduced: ${fieldText(fields, "activityReduced")}` : "",
      fieldText(fields, "managerNotified") ? `Manager notified: ${fieldText(fields, "managerNotified")}` : "",
      fieldText(fields, "ownerContacted") ? `Owner contacted: ${fieldText(fields, "ownerContacted")}` : ""
    ].filter(Boolean).join(" / ") || "[Activity reduced / manager notified / owner contacted]"],
    [/\[Add reminder\]/gi, fieldText(fields, "reminders") || "[Add reminder]"],
    [/\[Add item\]/gi, fieldText(fields, "missingItem") || "[Add item]"],
    [/\[Add location\]/gi, fieldText(fields, "lastKnownLocation") || fieldText(fields, "location") || "[Add location]"],
    [/\[Add staff\/location checked\]/gi, fieldText(fields, "whoChecked") || "[Add staff/location checked]"],
    [/\[Add owner follow-up or continued search\]/gi, fieldText(fields, "ownerFollowUpNeeded") || "[Add owner follow-up or continued search]"],
    [/\[Location\]/g, fieldText(fields, "location") || "[Location]"],
    [/\[Describe issue\]/gi, fieldText(fields, "issueDetails") || "[Describe issue]"],
    [/\[Add risk level\]/gi, fieldText(fields, "safetyRisk") || "[Add risk level]"],
    [/\[Add what was done \/ who was notified\]/gi, fieldText(fields, "actionTaken") || fieldText(fields, "managerNotified") || "[Add what was done / who was notified]"],
    [/\[Shift \/ area\]/gi, `${fieldText(fields, "shift") || "[Shift]"} / ${fieldText(fields, "areaAffected") || "[Area]"}`],
    [/\[Add issue\]/gi, fieldText(fields, "coverageIssue") || fieldText(fields, "issueSummary") || "[Add issue]"],
    [/\[Add who is covering and what still needs help\]/gi, fieldText(fields, "coveragePlan") || "[Add who is covering and what still needs help]"],
    [/\[Yes\/No\]/gi, fieldText(fields, "managerNotified") || fieldText(fields, "ownerFollowUpNeeded") || "[Yes/No]"],
    [/\[Date\]/g, fieldText(fields, "reservationDate") || fieldText(fields, "date") || "[Date]"],
    [/\[Add correction\]/gi, fieldText(fields, "correctionNeeded") || "[Add correction]"],
    [/\[Describe billing issue\]/gi, fieldText(fields, "issueDetails") || "[Describe billing issue]"],
    [/\[Add if known\]/gi, [fieldText(fields, "amount"), fieldText(fields, "gingrInvoice")].filter(Boolean).join(" / ") || "[Add if known]"],
    [/\[Add what was done\]/gi, fieldText(fields, "actionTaken") || "[Add what was done]"],
    [/\[Add follow-up needed\]/gi, fieldText(fields, "managementReviewNeeded") || fieldText(fields, "followUpNeeded") || "[Add follow-up needed]"],
    [/\[Add service\]/gi, fieldText(fields, "groomingService") || fieldText(fields, "trainingService") || "[Add service]"],
    [/\[Catch needed\? Slip lead\?\]/gi, `Catch: ${fieldText(fields, "catchNeeded") || "—"} / Slip lead: ${fieldText(fields, "slipLeadNeeded") || "—"}`],
    [/\[Add request\]/gi, fieldText(fields, "ownerRequests") || "[Add request]"],
    [/\[Add goal\]/gi, fieldText(fields, "trainingGoal") || "[Add goal]"],
    [/\[Add owner request or update\]/gi, fieldText(fields, "ownerNotes") || "[Add owner request or update]"],
    [/\[Pickup\/drop-off\/route\]/gi, fieldText(fields, "routeType") || "[Pickup/drop-off/route]"],
    [/\[Add reason\]/gi, fieldText(fields, "delayReason") || "[Add reason]"],
    [/\[Add ETA\]/gi, fieldText(fields, "eta") || "[Add ETA]"],
    [/\[Add details\]/gi, fieldText(fields, "notes") || "[Add details]"],
    [/\[Shift\]/g, fieldText(fields, "shift") || "[Shift]"],
    [/\[Add names\/notes\]/gi, fieldText(fields, "dogsToWatch") || "[Add names/notes]"],
    [/\[Add follow-ups\]/gi, fieldText(fields, "ownerFollowUps") || "[Add follow-ups]"],
    [/\[Add notes\]/gi, fieldText(fields, "facilityNotes") || fieldText(fields, "staffingNotes") || "[Add notes]"],
    [/\[Add open items\]/gi, fieldText(fields, "unresolvedIssues") || "[Add open items]"],
    [/\[Add reminders\]/gi, fieldText(fields, "reminders") || "[Add reminders]"],
    [/\[Issue type\]/gi, fieldText(fields, "followUpType") || "[Issue type]"],
    [/\[Add what needs review\/decision\]/gi, fieldText(fields, "requestedManagementAction") || "[Add what needs review/decision]"],
    [/\[Add urgency\]/gi, fieldText(fields, "urgency") || "[Add urgency]"]
  ];
  for (const [pattern, value] of replacements) text = text.replace(pattern, value);

  const detailLines = template.fields
    .map((field) => {
      const value = formatTemplateFieldValue(fields[field.key]);
      if (!value) return null;
      return `${field.label}: ${value}`;
    })
    .filter(Boolean);

  if (detailLines.length) {
    text += `\n\n--- Template Details ---\n${detailLines.join("\n")}`;
  }
  return text.trim();
}

export function compileTemplateSubject(template: LogTemplateConfig, fields: TemplateFieldValues) {
  if (template.buildSubject) return template.buildSubject(fields);
  return template.subjectTemplate;
}

export function compileGeneratedPreview(
  template: LogTemplateConfig,
  form: {
    subject: string;
    details: string;
    log_type: string;
    priority: string;
    status: string;
    assigned_to: string;
    department_area: string;
    template_fields: TemplateFieldValues;
    needs_management_review: boolean;
    urgent: boolean;
    create_owner_follow_up: boolean;
    create_active_issue: boolean;
    due_at?: string;
    reminder_at?: string;
  }
) {
  const lines = [
    `Template: ${template.label}`,
    `Log Type: ${form.log_type}`,
    `Priority: ${form.priority}${form.urgent ? " (URGENT)" : ""}`,
    `Status: ${form.status}`,
    `Assigned To: ${form.assigned_to || "—"}`,
    form.department_area ? `Department / Area: ${form.department_area}` : null,
    `Subject: ${form.subject}`,
    "",
    form.details
  ].filter((line) => line !== null);

  const due = form.due_at || fieldText(form.template_fields, "dueDate");
  const reminder = form.reminder_at || fieldText(form.template_fields, "reminderDateTime");
  if (due) lines.push("", `Due: ${due}`);
  if (reminder) lines.push(`Reminder: ${reminder}`);

  const actions = [
    form.needs_management_review ? "Needs Management Review" : null,
    form.urgent ? "Urgent" : null,
    form.create_owner_follow_up ? "Create Owner Follow Up" : null,
    form.create_active_issue ? "Create Active Issue" : null
  ].filter(Boolean);
  if (actions.length) {
    lines.push("", `Actions: ${actions.join(" • ")}`);
  }
  return lines.join("\n");
}

export function buildFormFromTemplate(
  template: LogTemplateConfig,
  preserved?: TemplateFieldValues
): {
  template_id: string;
  template_title: string;
  log_type: ShiftLogType;
  priority: StaffOpsPriority;
  status: StaffOpsStatus;
  assigned_to: string;
  department_area: string;
  subject: string;
  details: string;
  template_fields: TemplateFieldValues;
  needs_management_review: boolean;
  urgent: boolean;
  create_owner_follow_up: boolean;
  create_active_issue: boolean;
  related_dog_name: string;
  related_owner_name: string;
  due_at: string;
  reminder_at: string;
  field_errors: Record<string, string>;
} {
  const allowedKeys = new Set(template.fields.map((field) => field.key));
  const template_fields: TemplateFieldValues = {};
  for (const field of template.fields) {
    const prev = preserved && allowedKeys.has(field.key) ? preserved[field.key] : undefined;
    if (prev !== undefined) {
      template_fields[field.key] = prev;
      continue;
    }
    if (field.key === "ownerFollowUpNeeded" && template.id === "lost_belongings") {
      template_fields[field.key] = "Yes";
    } else if (field.key === "slipLeadNeeded" && template.id === "grooming_handoff") {
      template_fields[field.key] = "Yes";
    } else {
      template_fields[field.key] = field.type === "multiSelect" ? [] : "";
    }
  }

  const related_dog_name = fieldText(template_fields, "dogName") || fieldText(template_fields, "relatedDog");
  const related_owner_name = fieldText(template_fields, "ownerName") || fieldText(template_fields, "relatedOwner");
  const due_at = fieldText(template_fields, "dueDate");
  const reminder_at = fieldText(template_fields, "reminderDateTime");

  const subject = compileTemplateSubject(template, template_fields);
  const details = compileTemplateDetails(template, template_fields);

  return {
    template_id: template.id,
    template_title: template.label,
    log_type: template.logType,
    priority: template.priority,
    status: template.status,
    assigned_to: template.assignedTo,
    department_area: template.departmentArea ?? "",
    subject,
    details,
    template_fields,
    needs_management_review: Boolean(template.actionDefaults?.needs_management_review),
    urgent: Boolean(template.actionDefaults?.urgent),
    create_owner_follow_up: Boolean(template.actionDefaults?.create_owner_follow_up),
    create_active_issue: Boolean(template.actionDefaults?.create_active_issue),
    related_dog_name,
    related_owner_name,
    due_at,
    reminder_at,
    field_errors: {}
  };
}

export function syncTemplateDrivenForm<T extends {
  template_id: string | null;
  template_fields: TemplateFieldValues;
  subject: string;
  details: string;
  related_dog_name: string;
  related_owner_name: string;
  due_at: string;
  reminder_at: string;
  field_errors: Record<string, string>;
}>(form: T): T {
  const template = getLogTemplateById(form.template_id);
  if (!template || template.id === "custom") return form;
  const subject = compileTemplateSubject(template, form.template_fields);
  const details = compileTemplateDetails(template, form.template_fields);
  return {
    ...form,
    subject,
    details,
    related_dog_name: fieldText(form.template_fields, "dogName") || fieldText(form.template_fields, "relatedDog"),
    related_owner_name: fieldText(form.template_fields, "ownerName") || fieldText(form.template_fields, "relatedOwner"),
    due_at: fieldText(form.template_fields, "dueDate"),
    reminder_at: fieldText(form.template_fields, "reminderDateTime"),
    field_errors: validateTemplateFields(template, form.template_fields)
  };
}

/** Backward-compatible simple templates for legacy imports. */
export const SHIFT_LOG_TEMPLATES = LOG_TEMPLATES.map((template) => ({
  title: template.label,
  log_type: template.logType,
  subject: template.subjectTemplate,
  details: template.detailsTemplate,
  priority: template.priority,
  status: template.status,
  assigned_to: template.assignedTo,
  needs_management_review: Boolean(template.actionDefaults?.needs_management_review),
  urgent: Boolean(template.actionDefaults?.urgent)
}));
