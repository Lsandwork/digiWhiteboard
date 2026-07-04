import type { AdminUserRole } from "@/lib/admin/users";
import { syncStaffDirectoryLoginAccount } from "@/lib/staff/directory-login";
import {
  dispatchStaffOpsNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type StaffNotification,
  type StaffOpsNotificationEvent
} from "@/lib/staff/notifications";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type StaffOpsPriority = "Low" | "Normal" | "Medium" | "High" | "Critical";
export type StaffOpsStatus = "Active" | "Open" | "In Progress" | "Scheduled" | "Pending Review" | "Resolved" | "Archived";
export type IssueCategory =
  | "Lost Belongings"
  | "Facility Issue"
  | "Staff Issue"
  | "Owner Issue"
  | "Dog Issue"
  | "Medical / Health"
  | "Route / Transport"
  | "Grooming"
  | "Daycare"
  | "General";
export type IssueSource = "Front Desk" | "Crossover Communication" | "Owner Follow Up" | "Push Notice" | "Manual" | "Other";

export type CrossoverMessage = {
  id: string;
  subject: string;
  message: string;
  from_department: string;
  to_department: string;
  priority: StaffOpsPriority;
  status: StaffOpsStatus;
  related_dog_name: string | null;
  related_owner_name: string | null;
  related_route: string | null;
  created_by: string | null;
  assigned_to: string | null;
  urgent: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type CrossoverReply = {
  id: string;
  crossover_message_id: string;
  message: string;
  created_by: string | null;
  created_at: string;
};

export type OwnerFollowUp = {
  id: string;
  subject: string;
  owner_name: string;
  dog_name: string | null;
  logged_by: string | null;
  assigned_to: string | null;
  department: string | null;
  priority: StaffOpsPriority;
  due_date: string | null;
  status: StaffOpsStatus;
  follow_up_notes: string | null;
  source: string;
  source_id: string | null;
  urgent: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type ActiveIssue = {
  id: string;
  title: string;
  category: IssueCategory;
  source: IssueSource;
  source_id: string | null;
  source_table: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  priority: StaffOpsPriority;
  reported_at: string;
  due_at: string | null;
  status: StaffOpsStatus;
  notes: string | null;
  resolution_notes: string | null;
  related_owner_name: string | null;
  related_dog_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type StaffActivityLog = {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  source_table: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type StaffDirectoryMember = {
  id: string;
  name: string;
  role: string | null;
  department: string;
  email: string | null;
  phone: string | null;
  status: "Active" | "Inactive";
  notes: string | null;
  admin_user_id: string | null;
  dashboard_role: AdminUserRole | null;
  created_at: string;
  updated_at: string;
};

export type StaffOpsState = {
  crossover_messages: CrossoverMessage[];
  crossover_message_replies: CrossoverReply[];
  owner_follow_ups: OwnerFollowUp[];
  active_issues: ActiveIssue[];
  activity_logs: StaffActivityLog[];
  staff_directory: StaffDirectoryMember[];
  notifications: StaffNotification[];
};

export type StaffOpsEntity = "crossover" | "follow_up" | "issue";

export type StaffOpsPayload = StaffOpsState & {
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

const SETTINGS_STORE_KEY = "staff_admin_ops";
const ACTIVITY_LOG_ACTION = "staff_admin_ops_state";
const ACTIVITY_LOG_SOURCE = "staff_admin_ops";
const MAX_TEXT = 1200;

export const STAFF_DEPARTMENTS = [
  "Front Desk",
  "Daycare",
  "Hikers",
  "Grooming",
  "Training",
  "Management",
  "Maintenance",
  "Transportation"
] as const;

export const STAFF_MEMBERS = [
  "Front Desk Team",
  "Management Team",
  "Brian",
  "Amanda",
  "Bernard",
  "Halle",
  "Lonnie",
  "Michael",
  "Rebecca"
] as const;

export const DEFAULT_STAFF_DIRECTORY: StaffDirectoryMember[] = STAFF_MEMBERS.map((name, index) => ({
  id: `default-staff-${index + 1}`,
  name,
  role: name.includes("Team") ? "Team" : "Staff Member",
  department: name === "Management Team" ? "Management" : "Front Desk",
  email: null,
  phone: null,
  status: "Active",
  notes: null,
  admin_user_id: null,
  dashboard_role: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
}));

export const CROSSOVER_TEMPLATES = [
  {
    title: "Route Running Late",
    message:
      "Heads up — [Route/Handler] is about [X] min behind because of [traffic/weather/issue]. Pickups done: [list or none]. Still out: [list]. Yard + front desk — adjust timing and flag any owners we might cut close on."
  },
  {
    title: "Dog Needs Extra Eyes",
    message:
      "[Dog] had a [tense/rough/overstimulated] moment on yard at [time]. Trigger was [what happened]. Best approach: [handling tip]. Next team — reply once you've got eyes on them so we're not duplicating effort."
  },
  {
    title: "Pickup or Drop-off Change",
    message:
      "Schedule change for [dog/owner]: pickup now [new time], was [old time]. Drop-off to [department]. Front desk — confirm with owner if we haven't already. Transport — update the route sheet before wheels up."
  },
  {
    title: "Health Watch",
    message:
      "Flagging [dog] for the shift: [symptom/behavior] noticed at [time]. Owner [aware / not called yet]. Not an emergency unless [X]. Whoever has them next — log it and keep watching. Tag management if it gets worse."
  },
  {
    title: "Shift Handoff",
    message:
      "Passing to [department]: [what happened / what's still open]. Action needed from [who] before [time]. If this sits longer than [X], escalate here — don't let it drift."
  },
  {
    title: "Yard or Facility Issue",
    message:
      "[Area/gate/equipment] is [down/needs attention] — use [workaround] until fixed. Dogs should stay out of [area] for now. Maintenance [notified / needs a ping]. Reply when it's cleared so the next shift isn't guessing."
  },
  {
    title: "Coverage Gap Today",
    message:
      "[Name/role] is out — [department] is short until [time]. [Who] is covering. If you're slammed, post here and tag management. Let's split the load instead of everyone silently absorbing it."
  },
  {
    title: "Owner Called — Needs Follow-up",
    message:
      "[Owner] called about [issue] for [dog]. They want [callback/update] by [time]. Who's taking this? Reply when it's handled so front desk can close the loop with the owner."
  },
  {
    title: "Route Back — Dogs Incoming",
    message:
      "[Route/Handler] is [X] min out with [dog list]. [Department] — start staging space and any meds/gear they need on arrival. Flag conflicts early so we're not scrambling at the gate."
  },
  {
    title: "Good Catch — Pass It On",
    message:
      "Worth sharing with [department]: [what you noticed / what worked]. Helps the next handler stay consistent on [dog/owner/process]. Quick read, no action needed unless you see the same thing."
  }
] as const;

export const ISSUE_CATEGORIES: IssueCategory[] = [
  "Lost Belongings",
  "Facility Issue",
  "Staff Issue",
  "Owner Issue",
  "Dog Issue",
  "Medical / Health",
  "Route / Transport",
  "Grooming",
  "Daycare",
  "General"
];

export const ISSUE_SOURCES: IssueSource[] = ["Front Desk", "Crossover Communication", "Owner Follow Up", "Push Notice", "Manual", "Other"];
export const STAFF_PRIORITIES: StaffOpsPriority[] = ["Low", "Normal", "Medium", "High", "Critical"];
export const STAFF_STATUSES: StaffOpsStatus[] = ["Active", "Open", "In Progress", "Scheduled", "Pending Review", "Resolved", "Archived"];

function emptyState(): StaffOpsState {
  return {
    crossover_messages: [],
    crossover_message_replies: [],
    owner_follow_ups: [],
    active_issues: [],
    activity_logs: [],
    staff_directory: DEFAULT_STAFF_DIRECTORY,
    notifications: []
  };
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `staff-ops-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim().slice(0, MAX_TEXT);
}

function optionalString(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function normalizePriority(value: unknown): StaffOpsPriority {
  return STAFF_PRIORITIES.includes(value as StaffOpsPriority) ? (value as StaffOpsPriority) : "Normal";
}

function normalizeStatus(value: unknown, fallback: StaffOpsStatus): StaffOpsStatus {
  return STAFF_STATUSES.includes(value as StaffOpsStatus) ? (value as StaffOpsStatus) : fallback;
}

function normalizeCategory(value: unknown): IssueCategory {
  return ISSUE_CATEGORIES.includes(value as IssueCategory) ? (value as IssueCategory) : "General";
}

function normalizeSource(value: unknown): IssueSource {
  return ISSUE_SOURCES.includes(value as IssueSource) ? (value as IssueSource) : "Manual";
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isUrgent(priority: StaffOpsPriority, urgent?: boolean) {
  return urgent || priority === "High" || priority === "Critical";
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

function sortNewest<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function parseState(value: unknown): StaffOpsState {
  if (!value || typeof value !== "object") return emptyState();
  const state = value as Partial<StaffOpsState>;
  const directory = Array.isArray(state.staff_directory) ? state.staff_directory : DEFAULT_STAFF_DIRECTORY;
  return {
    crossover_messages: sortNewest(Array.isArray(state.crossover_messages) ? state.crossover_messages : []),
    crossover_message_replies: sortNewest(Array.isArray(state.crossover_message_replies) ? state.crossover_message_replies : []),
    owner_follow_ups: sortNewest(Array.isArray(state.owner_follow_ups) ? state.owner_follow_ups : []),
    active_issues: sortNewest(Array.isArray(state.active_issues) ? state.active_issues : []),
    activity_logs: sortNewest(Array.isArray(state.activity_logs) ? state.activity_logs : []).slice(0, 100),
    staff_directory: directory,
    notifications: sortNewest(Array.isArray(state.notifications) ? state.notifications : [])
  };
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

async function saveStateToAdminSettings(supabase: SupabaseClient, state: StaffOpsState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: parseState(state)
  };
  const { error: saveError } = await supabase.from("admin_settings").upsert({ id: "default", settings, updated_at: nowIso() });
  if (saveError) {
    if (isMissingRelation(saveError)) return false;
    throw saveError;
  }
  return true;
}

async function loadStateFromActivityLog(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("board_activity_log")
    .select("details")
    .eq("action", ACTIVITY_LOG_ACTION)
    .eq("source", ACTIVITY_LOG_SOURCE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  return parseState(data?.details);
}

async function saveStateToActivityLog(supabase: SupabaseClient, state: StaffOpsState) {
  const { error } = await supabase.from("board_activity_log").insert({
    action: ACTIVITY_LOG_ACTION,
    source: ACTIVITY_LOG_SOURCE,
    details: parseState(state)
  });
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  return true;
}

async function loadState(supabase: SupabaseClient) {
  return (await loadStateFromAdminSettings(supabase))
    ?? (await loadStateFromActivityLog(supabase))
    ?? emptyState();
}

async function saveState(supabase: SupabaseClient, state: StaffOpsState) {
  if (await saveStateToAdminSettings(supabase, state)) return;
  if (await saveStateToActivityLog(supabase, state)) return;
  throw new Error("Staff admin storage is not available.");
}

export async function listStaffOps(supabase: SupabaseClient): Promise<StaffOpsState> {
  return parseState(await loadState(supabase));
}

export function createActivityLog(state: StaffOpsState, input: Omit<StaffActivityLog, "id" | "created_at">) {
  return {
    ...state,
    activity_logs: sortNewest([
      {
        id: newId(),
        created_at: nowIso(),
        ...input
      },
      ...state.activity_logs
    ]).slice(0, 100)
  };
}

function notifyState(state: StaffOpsState, event: StaffOpsNotificationEvent) {
  return dispatchStaffOpsNotifications(state, event);
}

function crossoverTab(): StaffOpsNotificationEvent["sourceTab"] {
  return "crossover_communication";
}

function followUpTab(): StaffOpsNotificationEvent["sourceTab"] {
  return "owner_follow_up";
}

function issueTab(): StaffOpsNotificationEvent["sourceTab"] {
  return "active_issues";
}

function maybeCreateActiveIssueFromCrossover(state: StaffOpsState, message: CrossoverMessage, actor: string | null) {
  if (!isUrgent(message.priority, message.urgent)) return state;
  if (state.active_issues.some((issue) => issue.source_table === "crossover_messages" && issue.source_id === message.id && issue.status !== "Archived")) return state;
  const now = nowIso();
  const issue: ActiveIssue = {
    id: newId(),
    title: message.subject,
    category: message.related_dog_name ? "Dog Issue" : "General",
    source: "Crossover Communication",
    source_id: message.id,
    source_table: "crossover_messages",
    reported_by: actor,
    assigned_to: message.assigned_to,
    priority: message.priority,
    reported_at: now,
    due_at: null,
    status: "Open",
    notes: message.message,
    resolution_notes: null,
    related_owner_name: message.related_owner_name,
    related_dog_name: message.related_dog_name,
    created_at: now,
    updated_at: now,
    resolved_at: null
  };
  let next = createActivityLog(
    { ...state, active_issues: sortNewest([issue, ...state.active_issues]) },
    {
      activity_type: "issue.auto_created",
      title: `Auto-created issue: ${issue.title}`,
      description: "Created from urgent crossover communication.",
      source_table: "active_issues",
      source_id: issue.id,
      created_by: actor
    }
  );
  return notifyState(next, {
    eventType: "auto_issue",
    sourceTable: "active_issues",
    sourceId: issue.id,
    sourceTab: issueTab(),
    title: `Urgent issue opened: ${issue.title}`,
    body: issue.notes,
    priority: issue.priority,
    urgent: true,
    assignedTo: issue.assigned_to,
    mentionText: issue.notes,
    actor
  });
}

function maybeCreateActiveIssueFromOwnerFollowUp(state: StaffOpsState, followUp: OwnerFollowUp, actor: string | null) {
  if (!isUrgent(followUp.priority, followUp.urgent)) return state;
  if (state.active_issues.some((issue) => issue.source_table === "owner_follow_ups" && issue.source_id === followUp.id && issue.status !== "Archived")) return state;
  const now = nowIso();
  const issue: ActiveIssue = {
    id: newId(),
    title: followUp.subject,
    category: "Owner Issue",
    source: "Owner Follow Up",
    source_id: followUp.id,
    source_table: "owner_follow_ups",
    reported_by: actor,
    assigned_to: followUp.assigned_to,
    priority: followUp.priority,
    reported_at: now,
    due_at: followUp.due_date,
    status: "Open",
    notes: followUp.follow_up_notes,
    resolution_notes: null,
    related_owner_name: followUp.owner_name,
    related_dog_name: followUp.dog_name,
    created_at: now,
    updated_at: now,
    resolved_at: null
  };
  let next = createActivityLog(
    { ...state, active_issues: sortNewest([issue, ...state.active_issues]) },
    {
      activity_type: "issue.auto_created",
      title: `Auto-created issue: ${issue.title}`,
      description: "Created from urgent owner follow up.",
      source_table: "active_issues",
      source_id: issue.id,
      created_by: actor
    }
  );
  return notifyState(next, {
    eventType: "auto_issue",
    sourceTable: "active_issues",
    sourceId: issue.id,
    sourceTab: issueTab(),
    title: `Urgent issue opened: ${issue.title}`,
    body: issue.notes,
    priority: issue.priority,
    urgent: true,
    assignedTo: issue.assigned_to,
    mentionText: issue.notes,
    actor
  });
}

function markLinkedIssuePendingReview(state: StaffOpsState, sourceTable: "crossover_messages" | "owner_follow_ups", sourceId: string, actor: string | null) {
  const now = nowIso();
  return {
    ...state,
    active_issues: state.active_issues.map((issue) => {
      if (issue.source_table !== sourceTable || issue.source_id !== sourceId || issue.status === "Resolved" || issue.status === "Archived") return issue;
      return { ...issue, status: "Pending Review" as StaffOpsStatus, updated_at: now, resolution_notes: issue.resolution_notes ?? "Source item was resolved. Review before closing issue." };
    }),
    activity_logs: sortNewest([
      {
        id: newId(),
        activity_type: "issue.pending_review",
        title: "Linked active issue moved to Pending Review",
        description: "Source item was resolved.",
        source_table: sourceTable,
        source_id: sourceId,
        created_by: actor,
        created_at: now
      },
      ...state.activity_logs
    ]).slice(0, 100)
  };
}

export async function createCrossoverMessage(supabase: SupabaseClient, input: Record<string, unknown>, actor: string | null) {
  const subject = cleanString(input.subject);
  const message = cleanString(input.message);
  const from = cleanString(input.from_department);
  const to = cleanString(input.to_department);
  if (!subject || !message || !from || !to) throw new Error("Subject, message, from department, and to department are required.");
  const now = nowIso();
  const record: CrossoverMessage = {
    id: newId(),
    subject,
    message,
    from_department: from,
    to_department: to,
    priority: normalizePriority(input.priority),
    status: "Active",
    related_dog_name: optionalString(input.related_dog_name),
    related_owner_name: optionalString(input.related_owner_name),
    related_route: optionalString(input.related_route),
    created_by: actor,
    assigned_to: optionalString(input.assigned_to),
    urgent: Boolean(input.urgent),
    created_at: now,
    updated_at: now,
    resolved_at: null
  };
  let state = await loadState(supabase);
  state = createActivityLog({ ...state, crossover_messages: sortNewest([record, ...state.crossover_messages]) }, {
    activity_type: "crossover.created",
    title: `New message: ${record.subject}`,
    description: `${record.from_department} to ${record.to_department}`,
    source_table: "crossover_messages",
    source_id: record.id,
    created_by: actor
  });
  state = maybeCreateActiveIssueFromCrossover(state, record, actor);
  state = notifyState(state, {
    eventType: "created",
    sourceTable: "crossover_messages",
    sourceId: record.id,
    sourceTab: crossoverTab(),
    title: `New crossover: ${record.subject}`,
    body: record.message,
    priority: record.priority,
    urgent: record.urgent,
    assignedTo: record.assigned_to,
    mentionText: record.message,
    actor
  });
  await saveState(supabase, state);
  return record;
}

export async function replyToCrossoverMessage(supabase: SupabaseClient, id: string, message: unknown, actor: string | null) {
  const text = cleanString(message);
  if (!text) throw new Error("Reply message is required.");
  const state = await loadState(supabase);
  if (!state.crossover_messages.some((item) => item.id === id)) throw new Error("Crossover message not found.");
  const reply: CrossoverReply = { id: newId(), crossover_message_id: id, message: text, created_by: actor, created_at: nowIso() };
  const next = notifyState(
    createActivityLog({ ...state, crossover_message_replies: sortNewest([reply, ...state.crossover_message_replies]) }, {
      activity_type: "crossover.reply",
      title: "Reply added to crossover message",
      description: text,
      source_table: "crossover_messages",
      source_id: id,
      created_by: actor
    }),
    {
      eventType: "reply",
      sourceTable: "crossover_messages",
      sourceId: id,
      sourceTab: crossoverTab(),
      title: "New crossover reply",
      body: text,
      priority: "Medium",
      mentionText: text,
      actor
    }
  );
  await saveState(supabase, next);
  return reply;
}

export async function updateCrossoverMessage(supabase: SupabaseClient, id: string, patch: Record<string, unknown>, actor: string | null) {
  const now = nowIso();
  const state = await loadState(supabase);
  let updated: CrossoverMessage | null = null;
  let next: StaffOpsState = {
    ...state,
    crossover_messages: state.crossover_messages.map((item) => {
      if (item.id !== id) return item;
      const status = normalizeStatus(patch.status, item.status);
      updated = {
        ...item,
        subject: patch.subject !== undefined ? cleanString(patch.subject) : item.subject,
        message: patch.message !== undefined ? cleanString(patch.message) : item.message,
        from_department: patch.from_department !== undefined ? cleanString(patch.from_department) : item.from_department,
        to_department: patch.to_department !== undefined ? cleanString(patch.to_department) : item.to_department,
        priority: patch.priority !== undefined ? normalizePriority(patch.priority) : item.priority,
        status,
        related_dog_name: patch.related_dog_name !== undefined ? optionalString(patch.related_dog_name) : item.related_dog_name,
        related_owner_name: patch.related_owner_name !== undefined ? optionalString(patch.related_owner_name) : item.related_owner_name,
        related_route: patch.related_route !== undefined ? optionalString(patch.related_route) : item.related_route,
        assigned_to: patch.assigned_to !== undefined ? optionalString(patch.assigned_to) : item.assigned_to,
        urgent: patch.urgent !== undefined ? Boolean(patch.urgent) : item.urgent,
        updated_at: now,
        resolved_at: status === "Resolved" ? item.resolved_at ?? now : status === "Archived" ? item.resolved_at : null
      };
      return updated;
    })
  };
  if (!updated) throw new Error("Crossover message not found.");
  const updatedRecord = updated as CrossoverMessage;
  if (updatedRecord.status === "Resolved") next = markLinkedIssuePendingReview(next, "crossover_messages", updatedRecord.id, actor);
  next = maybeCreateActiveIssueFromCrossover(next, updatedRecord, actor);
  next = createActivityLog(next, {
    activity_type: "crossover.updated",
    title: `Updated message: ${updatedRecord.subject}`,
    description: `Status: ${updatedRecord.status}`,
    source_table: "crossover_messages",
    source_id: updatedRecord.id,
    created_by: actor
  });
  next = notifyState(next, {
    eventType: "updated",
    sourceTable: "crossover_messages",
    sourceId: updatedRecord.id,
    sourceTab: crossoverTab(),
    title: `Crossover updated: ${updatedRecord.subject}`,
    body: updatedRecord.message,
    priority: updatedRecord.priority,
    urgent: updatedRecord.urgent,
    assignedTo: updatedRecord.assigned_to,
    mentionText: updatedRecord.message,
    actor
  });
  await saveState(supabase, next);
  return updatedRecord;
}

export async function createOwnerFollowUp(supabase: SupabaseClient, input: Record<string, unknown>, actor: string | null) {
  const subject = cleanString(input.subject);
  const owner = cleanString(input.owner_name);
  const assignedTo = cleanString(input.assigned_to);
  if (!subject || !owner || !assignedTo) throw new Error("Subject, owner, and assigned to are required.");
  const now = nowIso();
  const record: OwnerFollowUp = {
    id: newId(),
    subject,
    owner_name: owner,
    dog_name: optionalString(input.dog_name),
    logged_by: actor,
    assigned_to: assignedTo,
    department: optionalString(input.department),
    priority: normalizePriority(input.priority),
    due_date: normalizeDate(input.due_date),
    status: "Open",
    follow_up_notes: optionalString(input.follow_up_notes),
    source: cleanString(input.source, "Manual") || "Manual",
    source_id: optionalString(input.source_id),
    urgent: Boolean(input.urgent),
    created_at: now,
    updated_at: now,
    resolved_at: null
  };
  let state = await loadState(supabase);
  state = createActivityLog({ ...state, owner_follow_ups: sortNewest([record, ...state.owner_follow_ups]) }, {
    activity_type: "follow_up.created",
    title: `New follow up: ${record.subject}`,
    description: `Assigned to ${record.assigned_to}`,
    source_table: "owner_follow_ups",
    source_id: record.id,
    created_by: actor
  });
  state = maybeCreateActiveIssueFromOwnerFollowUp(state, record, actor);
  state = notifyState(state, {
    eventType: "created",
    sourceTable: "owner_follow_ups",
    sourceId: record.id,
    sourceTab: followUpTab(),
    title: `New follow-up: ${record.subject}`,
    body: record.follow_up_notes,
    priority: record.priority,
    urgent: record.urgent,
    assignedTo: record.assigned_to,
    mentionText: record.follow_up_notes,
    actor
  });
  await saveState(supabase, state);
  return record;
}

export async function updateOwnerFollowUp(supabase: SupabaseClient, id: string, patch: Record<string, unknown>, actor: string | null) {
  const now = nowIso();
  const state = await loadState(supabase);
  let updated: OwnerFollowUp | null = null;
  let next: StaffOpsState = {
    ...state,
    owner_follow_ups: state.owner_follow_ups.map((item) => {
      if (item.id !== id) return item;
      const status = normalizeStatus(patch.status, item.status);
      updated = {
        ...item,
        subject: patch.subject !== undefined ? cleanString(patch.subject) : item.subject,
        owner_name: patch.owner_name !== undefined ? cleanString(patch.owner_name) : item.owner_name,
        dog_name: patch.dog_name !== undefined ? optionalString(patch.dog_name) : item.dog_name,
        assigned_to: patch.assigned_to !== undefined ? optionalString(patch.assigned_to) : item.assigned_to,
        department: patch.department !== undefined ? optionalString(patch.department) : item.department,
        priority: patch.priority !== undefined ? normalizePriority(patch.priority) : item.priority,
        due_date: patch.due_date !== undefined ? normalizeDate(patch.due_date) : item.due_date,
        status,
        follow_up_notes: patch.follow_up_notes !== undefined ? optionalString(patch.follow_up_notes) : item.follow_up_notes,
        source: patch.source !== undefined ? cleanString(patch.source, "Manual") : item.source,
        urgent: patch.urgent !== undefined ? Boolean(patch.urgent) : item.urgent,
        updated_at: now,
        resolved_at: status === "Resolved" ? item.resolved_at ?? now : status === "Archived" ? item.resolved_at : null
      };
      return updated;
    })
  };
  if (!updated) throw new Error("Owner follow up not found.");
  const updatedRecord = updated as OwnerFollowUp;
  if (updatedRecord.status === "Resolved") next = markLinkedIssuePendingReview(next, "owner_follow_ups", updatedRecord.id, actor);
  next = maybeCreateActiveIssueFromOwnerFollowUp(next, updatedRecord, actor);
  next = createActivityLog(next, {
    activity_type: "follow_up.updated",
    title: `Updated follow up: ${updatedRecord.subject}`,
    description: `Status: ${updatedRecord.status}`,
    source_table: "owner_follow_ups",
    source_id: updatedRecord.id,
    created_by: actor
  });
  next = notifyState(next, {
    eventType: "updated",
    sourceTable: "owner_follow_ups",
    sourceId: updatedRecord.id,
    sourceTab: followUpTab(),
    title: `Follow-up updated: ${updatedRecord.subject}`,
    body: updatedRecord.follow_up_notes,
    priority: updatedRecord.priority,
    urgent: updatedRecord.urgent,
    assignedTo: updatedRecord.assigned_to,
    mentionText: updatedRecord.follow_up_notes,
    actor
  });
  await saveState(supabase, next);
  return updatedRecord;
}

export async function createActiveIssue(supabase: SupabaseClient, input: Record<string, unknown>, actor: string | null) {
  const title = cleanString(input.title);
  if (!title) throw new Error("Issue title is required.");
  const now = nowIso();
  const record: ActiveIssue = {
    id: newId(),
    title,
    category: normalizeCategory(input.category),
    source: normalizeSource(input.source),
    source_id: optionalString(input.source_id),
    source_table: optionalString(input.source_table),
    reported_by: actor,
    assigned_to: optionalString(input.assigned_to),
    priority: normalizePriority(input.priority),
    reported_at: now,
    due_at: normalizeDate(input.due_at),
    status: "Open",
    notes: optionalString(input.notes),
    resolution_notes: optionalString(input.resolution_notes),
    related_owner_name: optionalString(input.related_owner_name),
    related_dog_name: optionalString(input.related_dog_name),
    created_at: now,
    updated_at: now,
    resolved_at: null
  };
  const state = await loadState(supabase);
  const next = notifyState(
    createActivityLog({ ...state, active_issues: sortNewest([record, ...state.active_issues]) }, {
      activity_type: "issue.created",
      title: `New issue: ${record.title}`,
      description: `${record.category} • ${record.priority}`,
      source_table: "active_issues",
      source_id: record.id,
      created_by: actor
    }),
    {
      eventType: "created",
      sourceTable: "active_issues",
      sourceId: record.id,
      sourceTab: issueTab(),
      title: `New active issue: ${record.title}`,
      body: record.notes,
      priority: record.priority,
      assignedTo: record.assigned_to,
      mentionText: record.notes,
      actor
    }
  );
  await saveState(supabase, next);
  return record;
}

export async function updateActiveIssue(supabase: SupabaseClient, id: string, patch: Record<string, unknown>, actor: string | null) {
  const now = nowIso();
  const state = await loadState(supabase);
  let updated: ActiveIssue | null = null;
  const updatedState = {
    ...state,
    active_issues: state.active_issues.map((item) => {
      if (item.id !== id) return item;
      const status = normalizeStatus(patch.status, item.status);
      updated = {
        ...item,
        title: patch.title !== undefined ? cleanString(patch.title) : item.title,
        category: patch.category !== undefined ? normalizeCategory(patch.category) : item.category,
        source: patch.source !== undefined ? normalizeSource(patch.source) : item.source,
        assigned_to: patch.assigned_to !== undefined ? optionalString(patch.assigned_to) : item.assigned_to,
        priority: patch.priority !== undefined ? normalizePriority(patch.priority) : item.priority,
        due_at: patch.due_at !== undefined ? normalizeDate(patch.due_at) : item.due_at,
        status,
        notes: patch.notes !== undefined ? optionalString(patch.notes) : item.notes,
        resolution_notes: patch.resolution_notes !== undefined ? optionalString(patch.resolution_notes) : item.resolution_notes,
        related_owner_name: patch.related_owner_name !== undefined ? optionalString(patch.related_owner_name) : item.related_owner_name,
        related_dog_name: patch.related_dog_name !== undefined ? optionalString(patch.related_dog_name) : item.related_dog_name,
        updated_at: now,
        resolved_at: status === "Resolved" ? item.resolved_at ?? now : status === "Archived" ? item.resolved_at : null
      };
      return updated;
    })
  };
  if (!updated) throw new Error("Active issue not found.");
  const updatedRecord = updated as ActiveIssue;
  const next = notifyState(
    createActivityLog(updatedState, {
      activity_type: "issue.updated",
      title: `Updated issue: ${updatedRecord.title}`,
      description: `Status: ${updatedRecord.status}`,
      source_table: "active_issues",
      source_id: id,
      created_by: actor
    }),
    {
      eventType: "updated",
      sourceTable: "active_issues",
      sourceId: id,
      sourceTab: issueTab(),
      title: `Active issue updated: ${updatedRecord.title}`,
      body: updatedRecord.notes,
      priority: updatedRecord.priority,
      assignedTo: updatedRecord.assigned_to,
      mentionText: updatedRecord.notes,
      actor
    }
  );
  await saveState(supabase, next);
  return updatedRecord;
}

export async function createStaffDirectoryMember(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  actor: string | null,
  actorAdminId?: string | null
) {
  const name = cleanString(input.name);
  if (!name) throw new Error("Staff member name is required.");
  const now = nowIso();
  const email = optionalString(input.email);
  const login = await syncStaffDirectoryLoginAccount(
    supabase,
    {
      name,
      email,
      dashboard_role: (input.dashboard_role as AdminUserRole | null | undefined) ?? null,
      temp_password: optionalString(input.temp_password),
      confirm_password: optionalString(input.confirm_password)
    },
    actorAdminId ?? null
  );
  const member: StaffDirectoryMember = {
    id: newId(),
    name,
    role: optionalString(input.role),
    department: cleanString(input.department, "Front Desk") || "Front Desk",
    email,
    phone: optionalString(input.phone),
    status: input.status === "Inactive" ? "Inactive" : "Active",
    notes: optionalString(input.notes),
    admin_user_id: login.admin_user_id,
    dashboard_role: login.dashboard_role,
    created_at: now,
    updated_at: now
  };
  const state = await loadState(supabase);
  const next = createActivityLog({ ...state, staff_directory: sortNewest([member, ...state.staff_directory]) }, {
    activity_type: "staff_directory.created",
    title: `Added staff member: ${member.name}`,
    description: member.department,
    source_table: "staff_directory",
    source_id: member.id,
    created_by: actor
  });
  await saveState(supabase, next);
  return member;
}

export async function updateStaffDirectoryMember(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  actor: string | null,
  actorAdminId?: string | null
) {
  const now = nowIso();
  const state = await loadState(supabase);
  const existing = state.staff_directory.find((member) => member.id === id);
  if (!existing) throw new Error("Staff member not found.");

  const nextName = patch.name !== undefined ? cleanString(patch.name) : existing.name;
  const nextEmail = patch.email !== undefined ? optionalString(patch.email) : existing.email;
  const nextDashboardRole =
    patch.dashboard_role !== undefined ? ((patch.dashboard_role as AdminUserRole | null) ?? null) : existing.dashboard_role;

  const login = await syncStaffDirectoryLoginAccount(
    supabase,
    {
      name: nextName,
      email: nextEmail,
      admin_user_id: existing.admin_user_id,
      dashboard_role: nextDashboardRole,
      temp_password: optionalString(patch.temp_password),
      confirm_password: optionalString(patch.confirm_password)
    },
    actorAdminId ?? null
  );

  let updated: StaffDirectoryMember | null = null;
  const updatedState: StaffOpsState = {
    ...state,
    staff_directory: state.staff_directory.map((member) => {
      if (member.id !== id) return member;
      updated = {
        ...member,
        name: nextName,
        role: patch.role !== undefined ? optionalString(patch.role) : member.role,
        department: patch.department !== undefined ? cleanString(patch.department, "Front Desk") : member.department,
        email: nextEmail,
        phone: patch.phone !== undefined ? optionalString(patch.phone) : member.phone,
        status: patch.status === "Inactive" ? "Inactive" : patch.status === "Active" ? "Active" : member.status,
        notes: patch.notes !== undefined ? optionalString(patch.notes) : member.notes,
        admin_user_id: login.admin_user_id,
        dashboard_role: login.dashboard_role,
        updated_at: now
      };
      return updated;
    })
  };
  if (!updated) throw new Error("Staff member not found.");
  const updatedRecord = updated as StaffDirectoryMember;
  if (!updatedRecord.name) throw new Error("Staff member name is required.");
  const next = createActivityLog(updatedState, {
    activity_type: "staff_directory.updated",
    title: `Updated staff member: ${updatedRecord.name}`,
    description: updatedRecord.status,
    source_table: "staff_directory",
    source_id: updatedRecord.id,
    created_by: actor
  });
  await saveState(supabase, next);
  return updatedRecord;
}

export async function deleteStaffDirectoryMember(supabase: SupabaseClient, id: string, actor: string | null) {
  const state = await loadState(supabase);
  const existing = state.staff_directory.find((member) => member.id === id);
  if (!existing) throw new Error("Staff member not found.");
  const next = createActivityLog({ ...state, staff_directory: state.staff_directory.filter((member) => member.id !== id) }, {
    activity_type: "staff_directory.deleted",
    title: `Deleted staff member: ${existing.name}`,
    description: existing.department,
    source_table: "staff_directory",
    source_id: existing.id,
    created_by: actor
  });
  await saveState(supabase, next);
}

export async function markStaffNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
  readerKey: string
) {
  const state = await loadState(supabase);
  const next = markNotificationRead(state, notificationId, readerKey);
  await saveState(supabase, next);
  return next.notifications.find((notification) => notification.id === notificationId) ?? null;
}

export async function markAllStaffNotificationsRead(
  supabase: SupabaseClient,
  readerKey: string,
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  const state = await loadState(supabase);
  const next = markAllNotificationsRead(state, readerKey, session);
  await saveState(supabase, next);
  return next;
}
