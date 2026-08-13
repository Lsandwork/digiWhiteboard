/**
 * Best-effort feed of live staff-ops + Fitdog payment alerts into Ops Command Center.
 * Does not mutate source systems — read-only aggregation for dashboard boxes.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import {
  listStaffOps,
  type ActiveIssue,
  type CrossoverMessage,
  type OwnerFollowUp,
  type StaffDirectoryMember,
  type StaffOpsPriority
} from "@/lib/staff/admin-ops";
import { listOpenAlerts } from "@/lib/fitdog-ops/store";
import type { OperationsAlert } from "@/lib/fitdog-ops/types";

const CLOSED_STATUSES = new Set([
  "resolved",
  "closed",
  "done",
  "archived",
  "completed",
  "check out"
]);

export type OpsWorkItem = {
  id: string;
  kind:
    | "ops_task"
    | "owner_follow_up"
    | "active_issue"
    | "payment_alert"
    | "ops_notification"
    | "open_log"
    | "facility_service"
    | "birthday";
  title: string;
  detail: string | null;
  priority: "critical" | "high" | "attention" | "informational";
  statusLabel: string;
  dueAt: string | null;
  dogName?: string | null;
  ownerName?: string | null;
  hrefTab: string | null;
  /** Only true for real ops_tasks rows that support Done. */
  completable: boolean;
  taskId?: string | null;
};

export type BoardLaneDog = {
  id: string;
  name: string;
  ownerName: string | null;
  room: string | null;
  gingrAnimalId?: string | null;
  displayStatus?: string | null;
};

function isOpenStatus(status: string | null | undefined) {
  return !CLOSED_STATUSES.has(String(status || "").toLowerCase());
}

function mapStaffPriority(priority: StaffOpsPriority | string | null | undefined, urgent?: boolean): OpsWorkItem["priority"] {
  const token = String(priority || "").toLowerCase();
  if (urgent || token === "critical") return "critical";
  if (token === "urgent" || token === "high") return "high";
  if (token === "medium" || token === "normal") return "attention";
  if (token === "low") return "informational";
  return "attention";
}

function mapAlertSeverity(severity: string | null | undefined): OpsWorkItem["priority"] {
  const token = String(severity || "").toLowerCase();
  if (token === "critical") return "critical";
  if (token === "high") return "high";
  if (token === "medium") return "attention";
  return "informational";
}

function openFollowUps(rows: OwnerFollowUp[]) {
  return rows.filter((row) => isOpenStatus(row.status));
}

function openIssues(rows: ActiveIssue[]) {
  return rows.filter((row) => isOpenStatus(row.status) && String(row.status).toLowerCase() !== "archived");
}

export function followUpToWorkItem(row: OwnerFollowUp): OpsWorkItem {
  return {
    id: `followup:${row.id}`,
    kind: "owner_follow_up",
    title: row.subject || `Owner follow-up · ${row.owner_name}`,
    detail: [row.owner_name, row.dog_name, row.follow_up_notes].filter(Boolean).join(" · ") || null,
    priority: mapStaffPriority(row.priority, row.urgent),
    statusLabel: row.status,
    dueAt: row.due_date,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    hrefTab: "owner_follow_up",
    completable: false
  };
}

export function issueToWorkItem(row: ActiveIssue): OpsWorkItem {
  return {
    id: `issue:${row.id}`,
    kind: "active_issue",
    title: row.title,
    detail: [row.category, row.related_owner_name, row.related_dog_name, row.notes].filter(Boolean).join(" · ") || null,
    priority: mapStaffPriority(row.priority),
    statusLabel: row.status,
    dueAt: row.due_at,
    dogName: row.related_dog_name,
    ownerName: row.related_owner_name,
    hrefTab: "active_issues",
    completable: false
  };
}

export function openLogToWorkItem(row: CrossoverMessage): OpsWorkItem {
  const detail = [row.log_type, row.assigned_to || row.assigned_team, String(row.details || row.message || "").trim()]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `openlog:${row.id}`,
    kind: "open_log",
    title: row.subject || row.log_type || "Open log",
    detail: detail || null,
    priority: mapStaffPriority(row.priority, row.urgent),
    statusLabel: row.status,
    dueAt: row.due_at ?? null,
    dogName: row.related_dog_name,
    ownerName: row.related_owner_name,
    hrefTab: "crossover_communication",
    completable: false
  };
}

export function alertToWorkItem(row: OperationsAlert): OpsWorkItem {
  const amount =
    row.amount_due != null && Number(row.amount_due) > 0 ? `$${Number(row.amount_due).toFixed(2)} due` : null;
  return {
    id: `payment:${row.id}`,
    kind: "payment_alert",
    title: `${String(row.alert_type || "PAYMENT").replace(/_/g, " ")} · ${row.owner_name || "Owner"}`,
    detail: [row.dog_name, amount, row.failure_reason].filter(Boolean).join(" · ") || null,
    priority: mapAlertSeverity(row.severity),
    statusLabel: row.status,
    dueAt: null,
    dogName: row.dog_name,
    ownerName: row.owner_name,
    hrefTab: "fitdog_alerts",
    completable: false
  };
}

export async function loadStaffOpsFeed() {
  const supabase = getServiceSupabase();
  const [ops, alerts] = await Promise.all([
    listStaffOps(supabase).catch(() => null),
    listOpenAlerts(supabase).catch(() => [] as OperationsAlert[])
  ]);

  const followUps = openFollowUps(ops?.owner_follow_ups || []);
  const issues = openIssues(ops?.active_issues || []);
  const paymentAlerts = alerts || [];

  const followUpItems = followUps.map(followUpToWorkItem);
  const issueItems = issues.map(issueToWorkItem);
  const alertItems = paymentAlerts.map(alertToWorkItem);

  const activityEvents = (ops?.activity_logs || []).slice(0, 20).map((log) => ({
    id: `activity:${log.id}`,
    category: "status" as const,
    title: log.title,
    summary: log.description,
    sourceModule: log.source_table || "staff_ops",
    actorName: log.created_by,
    occurredAt: log.created_at
  }));

  return {
    followUps,
    issues,
    paymentAlerts,
    crossoverMessages: ops?.crossover_messages || ([] as CrossoverMessage[]),
    staffDirectory: ops?.staff_directory || ([] as StaffDirectoryMember[]),
    followUpItems,
    issueItems,
    alertItems,
    activityEvents,
    ownerFollowUpCount: followUps.length,
    criticalPaymentCount: paymentAlerts.filter((a) => String(a.severity).toLowerCase() === "critical").length,
    openIssueCount: issues.length
  };
}

export async function loadBoardLaneSamples(limit = 6): Promise<{
  arriving: BoardLaneDog[];
  leaving: BoardLaneDog[];
}> {
  const supabase = getServiceSupabase();
  const mapRow = (row: Record<string, unknown>): BoardLaneDog => ({
    id: String(row.id),
    name: String(row.animal_name || "Dog"),
    ownerName: row.owner_name ? String(row.owner_name) : null,
    room: row.room ? String(row.room) : null
  });

  const [arriving, leaving] = await Promise.all([
    supabase
      .from("live_transition_dogs")
      .select("id, animal_name, owner_name, room")
      .eq("display_status", "checking_in")
      .eq("hidden", false)
      .order("status_started_at", { ascending: false })
      .limit(limit),
    supabase
      .from("live_transition_dogs")
      .select("id, animal_name, owner_name, room")
      .eq("display_status", "checking_out")
      .eq("hidden", false)
      .order("status_started_at", { ascending: false })
      .limit(limit)
  ]);

  return {
    arriving: (arriving.data || []).map((row) => mapRow(row as Record<string, unknown>)),
    leaving: (leaving.data || []).map((row) => mapRow(row as Record<string, unknown>))
  };
}

/** Search live board rows when ops_dogs is still thin. */
export async function searchBoardDogs(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [] as BoardLaneDog[];
  const supabase = getServiceSupabase();
  const like = `%${q}%`;
  const { data } = await supabase
    .from("live_transition_dogs")
    .select("id, animal_name, owner_name, room, gingr_animal_id, display_status")
    .eq("hidden", false)
    .or(`animal_name.ilike.${like},owner_name.ilike.${like},gingr_animal_id.eq.${q}`)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 40));

  return (data || []).map((row) => ({
    id: `board:${row.id}`,
    name: String(row.animal_name || "Dog"),
    ownerName: row.owner_name ? String(row.owner_name) : null,
    room: row.room ? String(row.room) : null,
    gingrAnimalId: row.gingr_animal_id ? String(row.gingr_animal_id) : null,
    displayStatus: row.display_status ? String(row.display_status) : null
  }));
}
