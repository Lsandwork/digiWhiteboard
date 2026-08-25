import { getServiceSupabase } from "@/lib/supabase/server";
import { getTtlCache, setTtlCache, withTimeoutFallback, withTimeoutResult } from "@/lib/server-ttl-cache";
import {
  getHungTableSupabase,
  HUNG_TABLES,
  isHungQueryError,
  isHungTableInCooldown,
  markHungTableTimeout
} from "@/lib/hung-table-guard";
import {
  OPS_SNAPSHOT_BUILD_TIMEOUT_MS,
  OPS_SNAPSHOT_LAST_GOOD_KEY,
  OPS_SNAPSHOT_LAST_GOOD_TTL_MS,
  OPS_SNAPSHOT_TIMEOUT_MS
} from "@/lib/ops-command-center/constants";
import { listOpenOpsTasks } from "@/lib/ops-command-center/tasks";
import { listOpsNotificationsForUser } from "@/lib/ops-command-center/notifications";
import { listRecentOpsEvents } from "@/lib/ops-command-center/events";
import { countDogsByStatus } from "@/lib/ops-command-center/status";
import type { OpsEvent, OpsNotification, OpsTask } from "@/lib/ops-command-center/types";
import { evaluateGingrHealth } from "@/lib/ops-command-center/gingr-health";
import {
  loadBoardLaneSamples,
  loadStaffOpsFeed,
  openLogToWorkItem,
  issueToWorkItem,
  type BoardLaneDog,
  type OpsWorkItem
} from "@/lib/ops-command-center/adapters/staff-ops-feed";
import { availableActionsForKind } from "@/lib/ops-command-center/work-item-actions";
import type { UserAccess } from "@/lib/admin/permissions";
import { isCoordinatorDashboardUser, isTeamLeadDashboardUser } from "@/lib/admin/team-lead-profile";
import { isGroomerDashboardUser } from "@/lib/admin/groomer-profile";
import {
  assignedActiveIssues,
  assignedGroomerActiveIssues,
  assignedGroomerOpenLogMessages,
  assignedOpenLogMessages,
  actorHomeDepartment,
  directoryMemberForUser,
  previousDepartmentShiftNotes,
  previousFrontDeskShiftNotes,
  previousTeamLeadShiftNotes,
  type TeamLeadShiftNote
} from "@/lib/ops-command-center/team-lead-shift";
import {
  loadTodaysAdditionalServices,
  type GingrAdditionalService
} from "@/lib/ops-command-center/groomer-additional-services";
import {
  facilityFeedToWorkItems,
  loadCachedMyShiftFacilityFeed,
  type MyShiftFacilityFeed
} from "@/lib/ops-command-center/my-shift-facility-feed";
import type { CrossoverMessage, StaffDirectoryMember } from "@/lib/staff/admin-ops";

export type NeedsAttentionItem = {
  id: string;
  kind: OpsWorkItem["kind"];
  severity: "critical" | "high" | "attention" | "informational";
  title: string;
  detail: string | null;
  hrefTab: string | null;
  dogName?: string | null;
  actions: Array<"clear" | "hide" | "archive" | "in_progress" | "resolved" | "delete">;
};

export type OpsCommandCenterSnapshot = {
  greetingName: string;
  roleKey: string;
  roleLabel: string;
  generatedAt: string;
  shiftSummary: {
    dogsCheckingOut: number;
    dogsArriving: number;
    openWork: number;
    criticalAlerts: number;
    ownerFollowUps: number;
    dogsOnFloor: number;
    /** @deprecated use dogsCheckingOut */
    tasksDue: number;
    /** @deprecated use dogsOnFloor */
    dogsOnsite: number;
  };
  liveCounts: Record<string, number>;
  boardCounts: {
    checkingIn: number;
    checkingOut: number;
    onsiteEstimate: number;
  };
  boardLanes: {
    arriving: BoardLaneDog[];
    leaving: BoardLaneDog[];
  };
  needsAttention: NeedsAttentionItem[];
  /** Completable Command Center tasks assigned to the current user. */
  myTasks: OpsTask[];
  /** Unified open work queue (tasks + follow-ups + issues + payment alerts). */
  openWork: OpsWorkItem[];
  /** Ops notifications + payment alerts for the Alerts feed. */
  alertFeed: OpsWorkItem[];
  notifications: OpsNotification[];
  recentEvents: OpsEvent[];
  gingrHealth: {
    status: "healthy" | "degraded" | "offline" | "unknown";
    label: string;
    detail: string | null;
  };
  /** Staff ops / payment-alert feed health — never treat a failed load as an empty quiet shift. */
  staffOpsHealth: {
    status: "ok" | "degraded" | "error";
    detail: string | null;
  };
  /** True when this payload is last-good or a timeout fallback. */
  stale?: boolean;
  /** First paint / in-flight snapshot — hide failure banners until a real probe finishes. */
  pending?: boolean;
  tools: Array<{ tab: string; label: string }>;
  /** Staff-directory department for My Shift entry + peer handoff (not RBAC role). */
  homeDepartment: string | null;
  /** Same-department peer notes for every My Shift login. */
  departmentHandoff: {
    department: string | null;
    previousName: string | null;
    shiftNotes: TeamLeadShiftNote[];
    assignOptions: string[];
  };
  /** Team Lead dashboard My Shift: previous TL Team Log notes + assigned Open Log / Active Issues. */
  teamLeadView?: {
    enabled: boolean;
    previousLeadName: string | null;
    shiftNotes: TeamLeadShiftNote[];
  };
  /** Coordinator dashboard My Shift: previous Front Desk Team Log notes. */
  coordinatorView?: {
    enabled: boolean;
    previousName: string | null;
    shiftNotes: TeamLeadShiftNote[];
  };
  /** Groomer dashboard My Shift: Gingr additional services + assigned Open Log / Active Issues. */
  groomerView?: {
    enabled: boolean;
    serviceDate: string | null;
    additionalServices: GingrAdditionalService[];
  };
};

function greetingNameFromEmail(email?: string | null, displayName?: string | null) {
  if (displayName?.trim()) return displayName.trim().split(/\s+/)[0];
  const local = email?.split("@")[0] || "Team";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function toolsForRole(roleKey: string): Array<{ tab: string; label: string }> {
  switch (roleKey) {
    case "front_desk_coordinator":
      return [
        { tab: "crossover_communication", label: "Team Log" },
        { tab: "fitdog_alerts", label: "Payment Alerts" },
        { tab: "owner_follow_up", label: "Owner Follow-Ups" },
        { tab: "grooming_push", label: "Grooming Ready" },
        { tab: "vip_auto_book", label: "VIP / Directory" }
      ];
    case "team_leader":
      return [
        { tab: "walks_board", label: "Walks / Yard" },
        { tab: "push_notices", label: "Push Alerts" },
        { tab: "active_issues", label: "Active Issues" }
      ];
    case "groomer":
      return [
        { tab: "grooming_push", label: "Grooming Workflow" },
        { tab: "media_library", label: "Media" },
        { tab: "crossover_communication", label: "Team Log" }
      ];
    case "trainer":
      return [
        { tab: "trainer_push", label: "Trainer Push" },
        { tab: "package_commissions", label: "Sessions / Commissions" },
        { tab: "crossover_communication", label: "Team Log" }
      ];
    case "driver":
    case "hiker":
      return [
        { tab: "route_generator", label: "Routes" },
        { tab: "walks_board", label: "Walks" },
        { tab: "checklist", label: "Checklist" }
      ];
    case "daycare":
      return [
        { tab: "walks_board", label: "Walks" },
        { tab: "checklist", label: "Checklist" }
      ];
    case "overnight":
      return [
        { tab: "crossover_communication", label: "Team Log" },
        { tab: "walks_board", label: "Overnight Checks" },
        { tab: "notifications", label: "Notifications" }
      ];
    default:
      return [
        { tab: "ops_command_center", label: "Live Ops" },
        { tab: "ms_hub", label: "Support Hub" },
        { tab: "overview", label: "Overview" },
        { tab: "walks_board", label: "Walks" },
        { tab: "fitdog_alerts", label: "Alerts" }
      ];
  }
}

function severityRank(priority: OpsWorkItem["priority"]) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "attention") return 2;
  return 3;
}

function dueSoon(dueAt: string | null | undefined) {
  if (!dueAt) return true;
  return new Date(dueAt).getTime() <= Date.now() + 60 * 60 * 1000;
}

function taskToWorkItem(task: OpsTask): OpsWorkItem {
  return {
    id: `task:${task.id}`,
    kind: "ops_task",
    title: task.title,
    detail: task.notes,
    priority: task.priority,
    statusLabel: task.status.replace(/_/g, " "),
    dueAt: task.dueAt,
    hrefTab: "my_shift",
    completable: task.status !== "completed" && task.status !== "cancelled",
    taskId: task.id
  };
}

function notificationToWorkItem(note: OpsNotification): OpsWorkItem {
  return {
    id: `notif:${note.id}`,
    kind: "ops_notification",
    title: note.title,
    detail: note.body,
    priority: note.priority,
    statusLabel: note.acknowledgedAt ? "Acknowledged" : "Unread",
    dueAt: null,
    hrefTab: note.hrefTab,
    completable: false
  };
}

type StaffFeedSnapshot = ReturnType<typeof emptyStaffFeed>;

function emptyStaffFeed(health: "ok" | "degraded" | "error" = "ok", detail: string | null = null) {
  return {
    followUps: [],
    issues: [],
    paymentAlerts: [],
    crossoverMessages: [] as CrossoverMessage[],
    staffDirectory: [] as StaffDirectoryMember[],
    followUpItems: [] as OpsWorkItem[],
    issueItems: [] as OpsWorkItem[],
    alertItems: [] as OpsWorkItem[],
    activityEvents: [] as Array<{
      id: string;
      category: "status";
      title: string;
      summary: string | null;
      sourceModule: string;
      actorName: string | null;
      occurredAt: string;
    }>,
    ownerFollowUpCount: 0,
    criticalPaymentCount: 0,
    openIssueCount: 0,
    feedHealth: health,
    feedDetail: detail
  };
}

function delayedStaffFeed(): StaffFeedSnapshot {
  return emptyStaffFeed("ok", null);
}

function staffFeedFromSnapshot(snapshot: OpsCommandCenterSnapshot): StaffFeedSnapshot {
  return {
    followUps: [],
    issues: [],
    paymentAlerts: [],
    crossoverMessages: [] as CrossoverMessage[],
    staffDirectory: [] as StaffDirectoryMember[],
    followUpItems: snapshot.openWork.filter((item) => item.kind === "owner_follow_up"),
    issueItems: snapshot.openWork.filter((item) => item.kind === "active_issue"),
    alertItems: snapshot.alertFeed,
    activityEvents: [],
    ownerFollowUpCount: snapshot.shiftSummary.ownerFollowUps,
    criticalPaymentCount: snapshot.shiftSummary.criticalAlerts,
    openIssueCount: snapshot.shiftSummary.openWork,
    feedHealth: snapshot.staffOpsHealth.status === "error" ? "error" : snapshot.staffOpsHealth.status === "degraded" ? "degraded" : "ok",
    feedDetail: snapshot.staffOpsHealth.detail
  };
}

export function emptyOpsCommandCenterSnapshot(input: {
  email?: string | null;
  displayName?: string | null;
  roleKey: string;
  roleLabel: string;
}): OpsCommandCenterSnapshot {
  return {
    greetingName: greetingNameFromEmail(input.email, input.displayName),
    roleKey: input.roleKey,
    roleLabel: input.roleLabel,
    generatedAt: new Date().toISOString(),
    shiftSummary: {
      dogsCheckingOut: 0,
      dogsArriving: 0,
      openWork: 0,
      criticalAlerts: 0,
      ownerFollowUps: 0,
      dogsOnFloor: 0,
      tasksDue: 0,
      dogsOnsite: 0
    },
    liveCounts: {},
    boardCounts: { checkingIn: 0, checkingOut: 0, onsiteEstimate: 0 },
    boardLanes: { arriving: [], leaving: [] },
    needsAttention: [],
    myTasks: [],
    openWork: [],
    alertFeed: [],
    notifications: [],
    recentEvents: [],
    gingrHealth: {
      status: "healthy",
      label: "Gingr ● Checking…",
      detail: ""
    },
    staffOpsHealth: {
      status: "ok",
      detail: null
    },
    tools: toolsForRole(input.roleKey),
    homeDepartment: null,
    departmentHandoff: { department: null, previousName: null, shiftNotes: [], assignOptions: [] },
    stale: false,
    pending: true
  };
}

function shouldCacheOpsSnapshot(snapshot: OpsCommandCenterSnapshot) {
  if (snapshot.pending || snapshot.stale) return false;
  if (snapshot.staffOpsHealth.status === "error") return false;
  if (snapshot.gingrHealth.status === "unknown") return false;
  return true;
}

export async function buildOpsCommandCenterSnapshot(input: {
  adminUserId?: string | null;
  email?: string | null;
  displayName?: string | null;
  roleKey: string;
  roleLabel: string;
  access?: UserAccess | null;
}): Promise<OpsCommandCenterSnapshot> {
  const supabase = getServiceSupabase({ timeoutMs: OPS_SNAPSHOT_TIMEOUT_MS });
  const hungSupabase = getHungTableSupabase();
  const lastGood = getTtlCache<OpsCommandCenterSnapshot>(OPS_SNAPSHOT_LAST_GOOD_KEY);

  const timedCount = async (table: string, query: () => PromiseLike<{ count: number | null; error?: { message?: string } | null }>) => {
    if (isHungTableInCooldown(table)) {
      return { count: 0, timedOut: true };
    }
    try {
      const result = await withTimeoutResult(Promise.resolve(query()), OPS_SNAPSHOT_TIMEOUT_MS, { count: 0 });
      if (result.timedOut || (result.value as { error?: { message?: string } }).error && isHungQueryError((result.value as { error?: unknown }).error)) {
        markHungTableTimeout(table);
        return { count: 0, timedOut: true };
      }
      return { count: result.value.count || 0, timedOut: result.timedOut };
    } catch (error) {
      if (isHungQueryError(error)) markHungTableTimeout(table);
      return { count: 0, timedOut: true };
    }
  };

  const timedMaybe = async <T,>(table: string, query: () => PromiseLike<{ data: T | null; error?: { message?: string } | null }>) => {
    if (isHungTableInCooldown(table)) {
      return { data: null as T | null, timedOut: true };
    }
    try {
      const result = await withTimeoutResult(Promise.resolve(query()), OPS_SNAPSHOT_TIMEOUT_MS, { data: null as T | null });
      if (result.timedOut) {
        markHungTableTimeout(table);
        return { data: null as T | null, timedOut: true };
      }
      return { data: result.value.data, timedOut: false };
    } catch (error) {
      if (isHungQueryError(error)) markHungTableTimeout(table);
      return { data: null as T | null, timedOut: true };
    }
  };
  const yardTeamLead = isTeamLeadDashboardUser({
    legacyRole: input.roleKey,
    access: input.access,
    dashboardRole: input.roleKey || null,
    email: input.email
  });
  const groomerDashboard = isGroomerDashboardUser({
    legacyRole: input.roleKey,
    access: input.access
  });
  const coordinatorDashboard = isCoordinatorDashboardUser({
    legacyRole: input.roleKey,
    access: input.access,
    email: input.email
  });
  const deskFacilityFeed = yardTeamLead || coordinatorDashboard;

  const [
    checkingIn,
    checkingOut,
    allOpenTasks,
    myTasks,
    notifications,
    recentEvents,
    statusCounts,
    lastWebhookResult,
    lastDogSeenResult,
    staffFeedResult,
    boardLanes,
    additionalServicesFeed,
    cachedFacilityFeed
  ] = await Promise.all([
    timedCount(HUNG_TABLES.liveTransitionDogs, () =>
      hungSupabase
        .from("live_transition_dogs")
        .select("id", { count: "exact", head: true })
        .eq("display_status", "checking_in")
        .eq("hidden", false)
    ),
    timedCount(HUNG_TABLES.liveTransitionDogs, () =>
      hungSupabase
        .from("live_transition_dogs")
        .select("id", { count: "exact", head: true })
        .eq("display_status", "checking_out")
        .eq("hidden", false)
    ),
    withTimeoutFallback(listOpenOpsTasks({ limit: 40 }), OPS_SNAPSHOT_TIMEOUT_MS, [] as OpsTask[]),
    withTimeoutFallback(
      listOpenOpsTasks({
        assignedAdminId: input.adminUserId,
        limit: 20
      }),
      OPS_SNAPSHOT_TIMEOUT_MS,
      [] as OpsTask[]
    ),
    input.adminUserId
      ? withTimeoutFallback(
          listOpsNotificationsForUser(input.adminUserId, {
            roleKey: input.roleKey,
            limit: 20,
            unreadOnly: false
          }),
          OPS_SNAPSHOT_TIMEOUT_MS,
          [] as OpsNotification[]
        )
      : Promise.resolve([] as OpsNotification[]),
    withTimeoutFallback(listRecentOpsEvents(25), OPS_SNAPSHOT_TIMEOUT_MS, [] as OpsEvent[]),
    withTimeoutFallback(countDogsByStatus(), OPS_SNAPSHOT_TIMEOUT_MS, {} as Record<string, number>),
    timedMaybe<{ created_at?: string }>(HUNG_TABLES.gingrWebhookEvents, () =>
      hungSupabase.from("gingr_webhook_events").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle()
    ),
    timedMaybe<{ last_seen_from_gingr_at?: string }>(HUNG_TABLES.liveTransitionDogs, () =>
      hungSupabase
        .from("live_transition_dogs")
        .select("last_seen_from_gingr_at")
        .not("last_seen_from_gingr_at", "is", null)
        .order("last_seen_from_gingr_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    withTimeoutResult(loadStaffOpsFeed(supabase), OPS_SNAPSHOT_TIMEOUT_MS, delayedStaffFeed()),
    withTimeoutFallback(loadBoardLaneSamples(8, supabase), OPS_SNAPSHOT_TIMEOUT_MS, { arriving: [], leaving: [] }),
    groomerDashboard
      ? withTimeoutFallback(
          loadTodaysAdditionalServices(),
          OPS_SNAPSHOT_TIMEOUT_MS,
          { date: null as string | null, services: [] as GingrAdditionalService[] }
        )
      : Promise.resolve({ date: null as string | null, services: [] as GingrAdditionalService[] }),
    deskFacilityFeed
      ? withTimeoutFallback(
          loadCachedMyShiftFacilityFeed(),
          OPS_SNAPSHOT_TIMEOUT_MS,
          { date: "", services: [], birthdays: [], syncedAt: null } as MyShiftFacilityFeed
        )
      : Promise.resolve({ date: "", services: [], birthdays: [], syncedAt: null } as MyShiftFacilityFeed)
  ]);

  const checkingInCount = checkingIn.timedOut
    ? lastGood?.shiftSummary.dogsArriving ?? 0
    : checkingIn.count;
  const checkingOutCount = checkingOut.timedOut
    ? lastGood?.shiftSummary.dogsCheckingOut ?? 0
    : checkingOut.count;
  const webhookAt = lastWebhookResult.timedOut
    ? null
    : lastWebhookResult.data?.created_at
      ? String(lastWebhookResult.data.created_at)
      : null;
  const lastSeenAt = lastDogSeenResult.timedOut
    ? null
    : lastDogSeenResult.data?.last_seen_from_gingr_at
      ? String(lastDogSeenResult.data.last_seen_from_gingr_at)
      : null;
  const gingrProbeTimedOut = lastWebhookResult.timedOut || lastDogSeenResult.timedOut;
  const staffFeed = staffFeedResult.timedOut
    ? lastGood
      ? staffFeedFromSnapshot(lastGood)
      : delayedStaffFeed()
    : staffFeedResult.value;
  const snapshotStale = Boolean(
    (checkingIn.timedOut || checkingOut.timedOut || gingrProbeTimedOut || staffFeedResult.timedOut) &&
      lastGood
  );
  const dogsOnFloorFromOps =
    (statusCounts.checked_in || 0) +
    (statusCounts.arrived || 0) +
    (statusCounts.yard || 0) +
    (statusCounts.break || 0) +
    (statusCounts.grooming || 0) +
    (statusCounts.training || 0) +
    (statusCounts.outing || 0) +
    (statusCounts.transportation || 0) +
    (statusCounts.overnight || 0) +
    (statusCounts.ready_for_pickup || 0);

  const dogsOnFloor = Math.max(dogsOnFloorFromOps, checkingInCount + checkingOutCount);

  const taskWork = allOpenTasks.map(taskToWorkItem);
  const myTaskWork = (input.adminUserId ? myTasks : allOpenTasks).map(taskToWorkItem);
  const notifWork = notifications.filter((n) => !n.resolvedAt).map(notificationToWorkItem);

  const directoryMember = directoryMemberForUser(staffFeed.staffDirectory || [], {
    adminUserId: input.adminUserId,
    email: input.email,
    name: input.displayName
  });
  const shiftActor = {
    name: input.displayName,
    email: input.email,
    adminUserId: input.adminUserId,
    directoryName: directoryMember?.name ?? null
  };
  const assignedLogs = yardTeamLead
    ? assignedOpenLogMessages(staffFeed.crossoverMessages || [], shiftActor).map(openLogToWorkItem)
    : groomerDashboard
      ? assignedGroomerOpenLogMessages(staffFeed.crossoverMessages || [], shiftActor).map((item) => ({
          ...openLogToWorkItem(item),
          hrefTab: "crossover_communication"
        }))
      : [];
  const assignedIssues = yardTeamLead
    ? assignedActiveIssues(staffFeed.issues || [], shiftActor).map(issueToWorkItem)
    : groomerDashboard
      ? assignedGroomerActiveIssues(staffFeed.issues || [], shiftActor).map((item) => ({
          ...issueToWorkItem(item),
          hrefTab: "crossover_communication"
        }))
      : [];
  const previousNotes = yardTeamLead
    ? previousTeamLeadShiftNotes(staffFeed.crossoverMessages || [], shiftActor, staffFeed.staffDirectory || [])
    : { previousLeadName: null as string | null, notes: [] as TeamLeadShiftNote[] };
  const previousFrontDeskNotes = coordinatorDashboard
    ? previousFrontDeskShiftNotes(staffFeed.crossoverMessages || [], shiftActor, staffFeed.staffDirectory || [])
    : { previousLeadName: null as string | null, notes: [] as TeamLeadShiftNote[] };
  const homeDepartment = actorHomeDepartment(shiftActor, staffFeed.staffDirectory || [], directoryMember?.department);
  const departmentHandoffNotes = previousDepartmentShiftNotes(
    staffFeed.crossoverMessages || [],
    shiftActor,
    staffFeed.staffDirectory || [],
    homeDepartment
  );
  const departmentAssignOptions = [
    ...new Set(
      (staffFeed.staffDirectory || [])
        .filter((member) => {
          if (String(member.status || "Active").toLowerCase() === "inactive") return false;
          if (!homeDepartment) return true;
          return actorHomeDepartment(
            { name: member.name, email: member.email, adminUserId: member.admin_user_id },
            staffFeed.staffDirectory || [],
            member.department
          ) === homeDepartment;
        })
        .map((member) => member.name)
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
  const roleWorkQueue = yardTeamLead || groomerDashboard;

  const openWork = (
    roleWorkQueue
      ? [...myTaskWork, ...assignedIssues, ...assignedLogs]
      : [...myTaskWork, ...staffFeed.followUpItems, ...staffFeed.issueItems]
  )
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority) || String(a.dueAt || "").localeCompare(String(b.dueAt || "")))
    .slice(0, 24);

  const alertFeed = [...(roleWorkQueue ? [] : staffFeed.alertItems), ...notifWork]
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority))
    .slice(0, 20);

  const facilityWork = deskFacilityFeed ? facilityFeedToWorkItems(cachedFacilityFeed) : [];
  const needsAttentionSource = roleWorkQueue
    ? [...facilityWork, ...assignedLogs, ...assignedIssues]
    : [
        ...facilityWork,
        ...staffFeed.alertItems.filter((item) => item.priority === "critical" || item.priority === "high"),
        ...staffFeed.issueItems.filter((item) => item.priority === "critical" || item.priority === "high"),
        ...staffFeed.followUpItems.filter((item) => item.priority === "critical" || item.priority === "high" || dueSoon(item.dueAt)),
        ...taskWork.filter((item) => item.priority === "critical" || item.priority === "high" || dueSoon(item.dueAt)),
        ...notifWork.filter((item) => item.priority === "critical" || item.priority === "high")
      ];

  const needsAttentionRaw: NeedsAttentionItem[] = needsAttentionSource.map((item) => ({
    id: item.id,
    kind: item.kind,
    severity: item.priority,
    title: item.title,
    detail: item.detail,
    hrefTab: item.hrefTab,
    dogName: item.dogName ?? null,
    actions: availableActionsForKind(item.kind)
  }));

  const seenNeeds = new Set<string>();
  const uniqueNeedsRaw = needsAttentionRaw.filter((item) => {
    if (seenNeeds.has(item.id)) return false;
    seenNeeds.add(item.id);
    return true;
  });
  const facilityNeeds = uniqueNeedsRaw.filter((item) => item.kind === "birthday" || item.kind === "facility_service");
  const otherNeeds = uniqueNeedsRaw
    .filter((item) => item.kind !== "birthday" && item.kind !== "facility_service")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, roleWorkQueue ? 24 : 16);
  const uniqueNeeds = [
    ...facilityNeeds.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    ...otherNeeds
  ];

  const openWorkCount = roleWorkQueue
    ? assignedLogs.length + assignedIssues.length + myTaskWork.filter((item) => dueSoon(item.dueAt)).length
    : allOpenTasks.filter((task) => dueSoon(task.dueAt)).length +
      staffFeed.followUpItems.filter((item) => dueSoon(item.dueAt)).length +
      staffFeed.openIssueCount;

  const criticalAlerts = roleWorkQueue
    ? assignedLogs.filter((item) => item.priority === "critical").length +
      assignedIssues.filter((item) => item.priority === "critical").length +
      notifications.filter((n) => n.priority === "critical" && !n.resolvedAt).length
    : notifications.filter((n) => n.priority === "critical" && !n.resolvedAt).length +
      staffFeed.criticalPaymentCount +
      staffFeed.issueItems.filter((item) => item.priority === "critical").length;

  const gingrHealth =
    gingrProbeTimedOut && lastGood?.gingrHealth.status && lastGood.gingrHealth.status !== "unknown"
      ? lastGood.gingrHealth
      : evaluateGingrHealth({
          lastWebhookAt: webhookAt,
          lastDogSeenAt: lastSeenAt,
          probeTimedOut: gingrProbeTimedOut
        });

  // Merge ops events with staff activity when ops timeline is thin.
  const mergedEvents: OpsEvent[] = [...recentEvents];
  if (mergedEvents.length < 8) {
    for (const activity of staffFeed.activityEvents) {
      if (mergedEvents.length >= 20) break;
      mergedEvents.push({
        id: activity.id,
        dogId: null,
        eventType: "staff.activity",
        category: activity.category,
        title: activity.title,
        summary: activity.summary,
        actorAdminId: null,
        actorName: activity.actorName,
        actorRole: null,
        sourceModule: activity.sourceModule,
        sourceRecordType: "staff_activity_log",
        sourceRecordId: activity.id,
        severity: "informational",
        payload: {},
        occurredAt: activity.occurredAt,
        createdAt: activity.occurredAt
      });
    }
  }

  return {
    greetingName: greetingNameFromEmail(input.email, input.displayName),
    roleKey: input.roleKey,
    roleLabel: input.roleLabel,
    generatedAt: new Date().toISOString(),
    shiftSummary: {
      dogsCheckingOut: checkingOutCount,
      dogsArriving: checkingInCount,
      openWork: openWorkCount,
      criticalAlerts,
      ownerFollowUps: staffFeed.ownerFollowUpCount,
      dogsOnFloor,
      tasksDue: openWorkCount,
      dogsOnsite: dogsOnFloor
    },
    liveCounts: {
      ...statusCounts,
      arriving: checkingInCount,
      leaving: checkingOutCount
    },
    boardCounts: {
      checkingIn: checkingInCount,
      checkingOut: checkingOutCount,
      onsiteEstimate: dogsOnFloor
    },
    boardLanes,
    needsAttention: uniqueNeeds,
    myTasks: input.adminUserId ? myTasks : allOpenTasks,
    openWork,
    alertFeed,
    notifications,
    recentEvents: mergedEvents.slice(0, 20),
    gingrHealth: {
      status: gingrHealth.status,
      label: gingrHealth.label,
      detail: gingrHealth.detail
    },
    staffOpsHealth: {
      status: staffFeed.feedHealth ?? "ok",
      detail: staffFeed.feedDetail ?? null
    },
    stale: snapshotStale || undefined,
    pending: false,
    tools: toolsForRole(input.roleKey),
    homeDepartment,
    departmentHandoff: {
      department: departmentHandoffNotes.department,
      previousName: departmentHandoffNotes.previousLeadName,
      shiftNotes: departmentHandoffNotes.notes,
      assignOptions: departmentAssignOptions
    },
    teamLeadView: {
      enabled: yardTeamLead,
      previousLeadName: previousNotes.previousLeadName,
      shiftNotes: previousNotes.notes
    },
    coordinatorView: {
      enabled: coordinatorDashboard,
      previousName: previousFrontDeskNotes.previousLeadName,
      shiftNotes: previousFrontDeskNotes.notes
    },
    groomerView: {
      enabled: groomerDashboard,
      serviceDate: additionalServicesFeed.date,
      additionalServices: additionalServicesFeed.services
    }
  };
}

export async function loadOpsCommandCenterSnapshot(input: {
  adminUserId?: string | null;
  email?: string | null;
  displayName?: string | null;
  roleKey: string;
  roleLabel: string;
  access?: UserAccess | null;
}): Promise<OpsCommandCenterSnapshot> {
  try {
    const snapshot = await withTimeoutFallback(
      buildOpsCommandCenterSnapshot(input),
      OPS_SNAPSHOT_BUILD_TIMEOUT_MS,
      null
    );
    if (snapshot) {
      if (shouldCacheOpsSnapshot(snapshot)) {
        setTtlCache(OPS_SNAPSHOT_LAST_GOOD_KEY, snapshot, OPS_SNAPSHOT_LAST_GOOD_TTL_MS);
      }
      return snapshot;
    }
  } catch {
    // Fall through to last-good.
  }

  const lastGood = getTtlCache<OpsCommandCenterSnapshot>(OPS_SNAPSHOT_LAST_GOOD_KEY);
  if (lastGood) {
    return {
      ...lastGood,
      stale: true,
      pending: false,
      gingrHealth: {
        status: "degraded",
        label: "Live data delayed",
        detail: lastGood.gingrHealth.detail || "Showing the last good My Shift snapshot while live data catches up."
      }
    };
  }

  return {
    ...emptyOpsCommandCenterSnapshot(input),
    pending: false,
    stale: true,
    gingrHealth: {
      status: "degraded",
      label: "Live data delayed",
      detail: "My Shift could not refresh live data. Retry shortly — empty queues here do not mean All Clear."
    }
  };
}
