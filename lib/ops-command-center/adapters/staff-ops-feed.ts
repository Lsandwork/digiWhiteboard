/**
 * Best-effort feed of live staff-ops + Fitdog payment alerts into Ops Command Center.
 * Does not mutate source systems — read-only aggregation for dashboard boxes.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { isInfrastructureError } from "@/lib/safe-url";
import { getOrLoadTtlCache } from "@/lib/server-ttl-cache";
import {
  STAFF_OPS_LIST_CACHE_KEY,
  STAFF_OPS_LIST_CACHE_TTL_MS
} from "@/lib/ops-command-center/constants";

type SupabaseClient = ReturnType<typeof getServiceSupabase>;
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
    hrefTab: "user_interactions",
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
    hrefTab: "user_interactions",
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
    hrefTab: "user_interactions",
    completable: false
  };
}

/** FITDOG_NOTIFICATION rows are owner activity (uploads, cancellations), not payment problems. */
export function splitOperationsAlerts(rows: OperationsAlert[]) {
  return {
    paymentAlerts: rows.filter((row) => row.alert_type !== "FITDOG_NOTIFICATION"),
    ownerActivity: rows.filter((row) => row.alert_type === "FITDOG_NOTIFICATION")
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

export async function loadStaffOpsFeed(supabaseClient?: SupabaseClient) {
  const supabase = supabaseClient ?? getServiceSupabase();
  let opsFailed = false;
  let alertsFailed = false;
  let opsTimedOut = false;
  let alertsTimedOut = false;
  const [ops, alerts] = await Promise.all([
    // Same key/TTL as /api/admin/staff-operations so My Shift reuses a warm Team Log list.
    getOrLoadTtlCache(STAFF_OPS_LIST_CACHE_KEY, STAFF_OPS_LIST_CACHE_TTL_MS, () => listStaffOps(supabase)).catch(
      (error: unknown) => {
        opsFailed = true;
        opsTimedOut = isInfrastructureError(error);
        return null;
      }
    ),
    listOpenAlerts(supabase).catch((error: unknown) => {
      alertsFailed = true;
      alertsTimedOut = isInfrastructureError(error);
      return [] as OperationsAlert[];
    })
  ]);

  const followUps = openFollowUps(ops?.owner_follow_ups || []);
  const issues = openIssues(ops?.active_issues || []);
  const { paymentAlerts, ownerActivity } = splitOperationsAlerts(alerts || []);

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

  const timedOut = opsTimedOut || alertsTimedOut;
  const feedHealth: "ok" | "degraded" | "error" =
    timedOut && !ops && !alertsFailed
      ? "ok"
      : timedOut
        ? "degraded"
        : opsFailed && alertsFailed
          ? "error"
          : opsFailed || alertsFailed
            ? "degraded"
            : "ok";

  return {
    followUps,
    issues,
    paymentAlerts,
    ownerActivity,
    crossoverMessages: ops?.crossover_messages || ([] as CrossoverMessage[]),
    staffDirectory: ops?.staff_directory || ([] as StaffDirectoryMember[]),
    followUpItems,
    issueItems,
    alertItems,
    activityEvents,
    ownerFollowUpCount: followUps.length,
    criticalPaymentCount: paymentAlerts.filter((a) => String(a.severity).toLowerCase() === "critical").length,
    openIssueCount: issues.length,
    feedHealth,
    feedDetail:
      feedHealth === "ok"
        ? null
        : timedOut
          ? "Staff ops is still refreshing live data."
          : opsFailed && alertsFailed
            ? "Staff ops and payment alerts could not be loaded."
            : opsFailed
              ? "Staff ops feed could not be loaded."
              : "Payment alerts could not be loaded."
  };
}

export async function loadBoardLaneSamples(
  limit = 6,
  supabaseClient?: SupabaseClient
): Promise<{
  arriving: BoardLaneDog[];
  leaving: BoardLaneDog[];
}> {
  const supabase = supabaseClient ?? getServiceSupabase();
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

/** Admin Front Desk / Yard lanes — DB only, never hits Gingr or the public board route. */
export type AdminBoardLaneDog = {
  id: string;
  animal_name: string;
  owner_name?: string | null;
  photo_url?: string | null;
  display_status?: string | null;
  current_status?: string | null;
  room?: string | null;
  gingr_animal_id?: string | null;
};

export async function loadAdminBoardLanes(
  limit = 40,
  supabaseClient?: SupabaseClient
): Promise<{ checking_in: AdminBoardLaneDog[]; checking_out: AdminBoardLaneDog[] }> {
  const supabase = supabaseClient ?? getServiceSupabase();
  const mapRow = (row: Record<string, unknown>): AdminBoardLaneDog => ({
    id: String(row.id),
    animal_name: String(row.animal_name || "Dog"),
    owner_name: row.owner_name ? String(row.owner_name) : null,
    photo_url: row.photo_url ? String(row.photo_url) : null,
    display_status: row.display_status ? String(row.display_status) : null,
    current_status: row.current_status ? String(row.current_status) : null,
    room: row.room ? String(row.room) : null,
    gingr_animal_id: row.gingr_animal_id ? String(row.gingr_animal_id) : null
  });

  const select =
    "id, animal_name, owner_name, photo_url, display_status, current_status, room, gingr_animal_id";
  const [arriving, leaving] = await Promise.all([
    supabase
      .from("live_transition_dogs")
      .select(select)
      .eq("display_status", "checking_in")
      .eq("hidden", false)
      .order("status_started_at", { ascending: false })
      .limit(limit),
    supabase
      .from("live_transition_dogs")
      .select(select)
      .eq("display_status", "checking_out")
      .eq("hidden", false)
      .order("status_started_at", { ascending: false })
      .limit(limit)
  ]);

  return {
    checking_in: (arriving.data || []).map((row) => mapRow(row as Record<string, unknown>)),
    checking_out: (leaving.data || []).map((row) => mapRow(row as Record<string, unknown>))
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
