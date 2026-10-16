import { getServiceSupabase } from "@/lib/supabase/server";
import { splitOperationsAlerts } from "@/lib/ops-command-center/adapters/staff-ops-feed";
import { loadLiveFloor, type LiveFloor } from "@/lib/ops-command-center/live-floor";
import { listOpenAlerts } from "@/lib/fitdog-ops/store";
import type { OperationsAlert } from "@/lib/fitdog-ops/types";
import {
  listStaffOps,
  type ActiveIssue,
  type CrossoverMessage,
  type OwnerFollowUp,
  type StaffOpsPriority
} from "@/lib/staff/admin-ops";

export type ActionPriority = "critical" | "high" | "attention";
export type ActionCategory =
  | "pickup"
  | "arrival"
  | "body_check"
  | "team_log"
  | "issue"
  | "follow_up"
  | "payment"
  | "system"
  | "notification";

export type CommandAction = {
  id: string;
  priority: ActionPriority;
  category: ActionCategory;
  title: string;
  detail: string | null;
  dogName: string | null;
  at: string | null;
  hrefTab: string | null;
  hrefLabel: string | null;
};

export type BodyCheckFollowUp = {
  id: string;
  dog_name: string;
  owner_name: string | null;
  severity: "routine" | "needs_follow_up" | "urgent";
  follow_up_kinds: string[] | null;
  staff_name: string;
  inspected_at: string;
};

export type OpsNotificationRow = {
  id: string;
  title: string;
  body: string | null;
  priority: string;
  href_tab: string | null;
  created_at: string;
};

export type OwnerActivityItem = {
  id: string;
  ownerName: string;
  dogName: string | null;
  summary: string;
  at: string;
};

export type SourceStatus = { key: string; label: string; ok: boolean; detail: string | null };

export type CommandCenterView = {
  floor: LiveFloor;
  actions: CommandAction[];
  ownerActivity: OwnerActivityItem[];
  staleTeamLogCount: number;
  sources: SourceStatus[];
  generatedAt: string;
};

const CLOSED = new Set(["resolved", "closed", "done", "archived", "completed", "check out"]);
const STALE_TEAM_LOG_DAYS = 14;
const OWNER_ACTIVITY_HOURS = 24;
const NOTIFICATION_HOURS = 24;
const PRIORITY_RANK: Record<ActionPriority, number> = { critical: 0, high: 1, attention: 2 };
const FOLLOW_UP_LABELS: Record<string, string> = {
  bath: "Bath",
  nail_trim: "Nail trim",
  grooming: "Grooming",
  supervisor_review: "Supervisor review",
  owner_communication: "Tell the owner",
  other: "Other"
};

function isOpen(status: string | null | undefined) {
  return !CLOSED.has(String(status || "").toLowerCase());
}

function isPast(value: string | null | undefined, now: number) {
  if (!value) return false;
  const at = Date.parse(value.length === 10 ? `${value}T23:59:59` : value);
  return !Number.isNaN(at) && at < now;
}

function staffRank(priority: StaffOpsPriority | string | null | undefined, urgent?: boolean): ActionPriority | null {
  const token = String(priority || "").toLowerCase();
  if (urgent || token === "critical") return "critical";
  if (token === "urgent" || token === "high") return "high";
  return null;
}

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function clockLabel(value: string | null) {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
}

export function buildActionQueue(input: {
  floor: LiveFloor;
  teamLog: CrossoverMessage[];
  issues: ActiveIssue[];
  followUps: OwnerFollowUp[];
  alerts: OperationsAlert[];
  bodyChecks: BodyCheckFollowUp[];
  notifications: OpsNotificationRow[];
  now: number;
}): { actions: CommandAction[]; ownerActivity: OwnerActivityItem[]; staleTeamLogCount: number } {
  const { floor, now } = input;
  const actions: CommandAction[] = [];

  for (const dog of floor.overduePickups) {
    actions.push({
      id: `pickup:${dog.reservationId}`,
      priority: dog.overstay || dog.minutesLate > 60 ? "critical" : "high",
      category: "pickup",
      title: dog.overstay
        ? `${dog.dogName} is past their checkout date`
        : `${dog.dogName} pickup is ${minutesLabel(dog.minutesLate)} late`,
      detail: [dog.serviceType, dog.ownerName, dog.endsAt ? `Due ${clockLabel(dog.endsAt)}` : null].filter(Boolean).join(" · "),
      dogName: dog.dogName,
      at: dog.endsAt,
      hrefTab: null,
      hrefLabel: "Contact owner in Gingr"
    });
  }

  for (const dog of floor.lateArrivals) {
    actions.push({
      id: `arrival:${dog.reservationId}`,
      priority: "attention",
      category: "arrival",
      title: `${dog.dogName} has not arrived (${minutesLabel(dog.minutesLate)} late)`,
      detail: [dog.serviceType, dog.ownerName, dog.startsAt ? `Expected ${clockLabel(dog.startsAt)}` : null].filter(Boolean).join(" · "),
      dogName: dog.dogName,
      at: dog.startsAt,
      hrefTab: null,
      hrefLabel: "Confirm in Gingr"
    });
  }

  for (const check of input.bodyChecks) {
    const kinds = (check.follow_up_kinds || []).map((kind) => FOLLOW_UP_LABELS[kind] || kind.replace(/_/g, " "));
    actions.push({
      id: `body_check:${check.id}`,
      priority: check.severity === "urgent" ? "high" : "attention",
      category: "body_check",
      title: `Body check follow-up for ${check.dog_name}`,
      detail: [check.severity === "urgent" ? "Urgent" : "Needs follow-up", kinds.join(", ") || null, `by ${check.staff_name}`]
        .filter(Boolean)
        .join(" · "),
      dogName: check.dog_name,
      at: check.inspected_at,
      hrefTab: "body_checks",
      hrefLabel: "Open Body Checks"
    });
  }

  const openLog = input.teamLog.filter((row) => isOpen(row.status) && !row.archived_at);
  for (const row of openLog) {
    const rank = staffRank(row.priority, row.urgent);
    const overdue = isPast(row.due_at, now) || isPast(row.reminder_at, now);
    if (!rank && !overdue && !row.needs_management_review) continue;
    const reasons = [
      rank === "critical" ? "Urgent" : rank === "high" ? "High priority" : null,
      overdue ? "Past due" : null,
      row.needs_management_review ? "Needs manager review" : null
    ].filter(Boolean);
    actions.push({
      id: `team_log:${row.id}`,
      priority: rank ?? (overdue ? "high" : "attention"),
      category: "team_log",
      title: row.subject || row.log_type || "Team Log item",
      detail: [reasons.join(", "), row.log_type, row.assigned_to || row.assigned_team].filter(Boolean).join(" · "),
      dogName: row.related_dog_name,
      at: row.due_at || row.reminder_at || row.created_at,
      hrefTab: "user_interactions",
      hrefLabel: "Open Team Log"
    });
  }
  const staleCutoff = now - STALE_TEAM_LOG_DAYS * 86_400_000;
  const staleTeamLogCount = openLog.filter((row) => Date.parse(row.created_at) < staleCutoff).length;
  if (staleTeamLogCount > 0) {
    actions.push({
      id: "team_log:stale",
      priority: "attention",
      category: "team_log",
      title: `${staleTeamLogCount} Team Log ${staleTeamLogCount === 1 ? "item has" : "items have"} been open over ${STALE_TEAM_LOG_DAYS} days`,
      detail: "Close what is finished so new problems stand out.",
      dogName: null,
      at: null,
      hrefTab: "user_interactions",
      hrefLabel: "Review Team Log"
    });
  }

  for (const issue of input.issues) {
    if (!isOpen(issue.status)) continue;
    const rank = staffRank(issue.priority);
    const overdue = isPast(issue.due_at, now);
    if (!rank && !overdue) continue;
    actions.push({
      id: `issue:${issue.id}`,
      priority: rank ?? "high",
      category: "issue",
      title: issue.title,
      detail: [issue.category, overdue ? "Past due" : null, issue.assigned_to].filter(Boolean).join(" · "),
      dogName: issue.related_dog_name,
      at: issue.due_at || issue.reported_at,
      hrefTab: "active_issues",
      hrefLabel: "Open Active Issues"
    });
  }

  for (const followUp of input.followUps) {
    if (!isOpen(followUp.status)) continue;
    const rank = staffRank(followUp.priority, followUp.urgent);
    const overdue = isPast(followUp.due_date, now);
    if (!rank && !overdue) continue;
    actions.push({
      id: `follow_up:${followUp.id}`,
      priority: rank ?? "high",
      category: "follow_up",
      title: followUp.subject || `Call ${followUp.owner_name}`,
      detail: [followUp.owner_name, followUp.dog_name, overdue ? "Past due" : null].filter(Boolean).join(" · "),
      dogName: followUp.dog_name,
      at: followUp.due_date || followUp.created_at,
      hrefTab: "owner_follow_up",
      hrefLabel: "Open Owner Follow Up"
    });
  }

  const { paymentAlerts, ownerActivity: activityAlerts } = splitOperationsAlerts(input.alerts);
  for (const alert of paymentAlerts) {
    const isSync = alert.alert_type === "FITDOG_SYNC_ERROR";
    if (alert.alert_type === "PAYMENT_RESOLVED") continue;
    const amount = Number(alert.amount_due) > 0 ? `$${Number(alert.amount_due).toFixed(2)} due` : null;
    actions.push({
      id: `payment:${alert.id}`,
      priority: isSync ? "attention" : alert.severity === "critical" ? "critical" : "high",
      category: isSync ? "system" : "payment",
      title: isSync
        ? "Fitdog sync reported an error"
        : `${alert.alert_type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} · ${alert.owner_name || "Owner"}`,
      detail: [alert.dog_name, amount, alert.failure_reason].filter(Boolean).join(" · ") || null,
      dogName: alert.dog_name,
      at: alert.detected_at,
      hrefTab: "fitdog_alerts",
      hrefLabel: "Open Payment Alerts"
    });
  }

  const notificationCutoff = now - NOTIFICATION_HOURS * 3_600_000;
  for (const note of input.notifications) {
    if (note.priority !== "critical" && note.priority !== "high") continue;
    if (Date.parse(note.created_at) < notificationCutoff) continue;
    actions.push({
      id: `notification:${note.id}`,
      priority: note.priority === "critical" ? "critical" : "high",
      category: "notification",
      title: note.title,
      detail: note.body,
      dogName: null,
      at: note.created_at,
      hrefTab: note.href_tab,
      hrefLabel: note.href_tab ? "Open" : null
    });
  }

  actions.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || String(a.at ?? "~").localeCompare(String(b.at ?? "~")));

  const activityCutoff = now - OWNER_ACTIVITY_HOURS * 3_600_000;
  const ownerActivity = activityAlerts
    .filter((alert) => Date.parse(alert.detected_at || alert.created_at) >= activityCutoff)
    .sort((a, b) => String(b.detected_at).localeCompare(String(a.detected_at)))
    .slice(0, 25)
    .map((alert) => ({
      id: alert.id,
      ownerName: alert.owner_name || "Owner",
      dogName: alert.dog_name,
      summary: alert.failure_reason || alert.service_name || "Account activity",
      at: alert.detected_at || alert.created_at
    }));

  return { actions, ownerActivity, staleTeamLogCount };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Unavailable";
}

export async function loadCommandCenterView(options?: { force?: boolean }): Promise<CommandCenterView> {
  const now = Date.now();
  const supabase = getServiceSupabase();
  const sources: SourceStatus[] = [];

  const [floor, staffOps, alerts, bodyChecks, notifications] = await Promise.all([
    loadLiveFloor({ force: options?.force }),
    listStaffOps(supabase).then(
      (value) => ({ value, error: null as string | null }),
      (error: unknown) => ({ value: null, error: errorText(error) })
    ),
    listOpenAlerts(supabase).then(
      (value) => ({ value, error: null as string | null }),
      (error: unknown) => ({ value: [] as OperationsAlert[], error: errorText(error) })
    ),
    Promise.resolve(
      supabase
        .from("body_check_reports")
        .select("id, dog_name, owner_name, severity, follow_up_kinds, staff_name, inspected_at")
        .eq("follow_up_status", "required")
        .order("inspected_at", { ascending: false })
        .limit(50)
    ).then(
      ({ data, error }) => ({ value: (data ?? []) as BodyCheckFollowUp[], error: error?.message ?? null }),
      (error: unknown) => ({ value: [] as BodyCheckFollowUp[], error: errorText(error) })
    ),
    Promise.resolve(
      supabase
        .from("ops_notifications")
        .select("id, title, body, priority, href_tab, created_at")
        .is("resolved_at", null)
        .gte("created_at", new Date(now - NOTIFICATION_HOURS * 3_600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50)
    ).then(
      ({ data, error }) => ({ value: (data ?? []) as OpsNotificationRow[], error: error?.message ?? null }),
      (error: unknown) => ({ value: [] as OpsNotificationRow[], error: errorText(error) })
    )
  ]);

  sources.push({ key: "gingr", label: "Gingr", ok: !floor.error, detail: floor.error });
  sources.push({ key: "staff_ops", label: "Team Log", ok: !staffOps.error, detail: staffOps.error });
  sources.push({ key: "alerts", label: "Payment alerts", ok: !alerts.error, detail: alerts.error });
  sources.push({ key: "body_checks", label: "Body Checks", ok: !bodyChecks.error, detail: bodyChecks.error });

  const queue = buildActionQueue({
    floor,
    teamLog: staffOps.value?.crossover_messages ?? [],
    issues: staffOps.value?.active_issues ?? [],
    followUps: staffOps.value?.owner_follow_ups ?? [],
    alerts: alerts.value,
    bodyChecks: bodyChecks.value,
    notifications: notifications.value,
    now
  });

  return { floor, ...queue, sources, generatedAt: new Date(now).toISOString() };
}
