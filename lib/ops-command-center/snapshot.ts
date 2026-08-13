import { getServiceSupabase } from "@/lib/supabase/server";
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
import { isTeamLeadDashboardUser } from "@/lib/admin/team-lead-profile";
import {
  assignedActiveIssues,
  assignedOpenLogMessages,
  directoryMemberForUser,
  previousTeamLeadShiftNotes,
  type TeamLeadShiftNote
} from "@/lib/ops-command-center/team-lead-shift";
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
  tools: Array<{ tab: string; label: string }>;
  /** Team Lead dashboard My Shift: previous TL Team Log notes + assigned Open Log / Active Issues. */
  teamLeadView?: {
    enabled: boolean;
    previousLeadName: string | null;
    shiftNotes: TeamLeadShiftNote[];
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
        { tab: "active_issues", label: "Active Issues" },
        { tab: "route_generator", label: "Routes" }
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
    case "daycare":
      return [
        { tab: "route_generator", label: "Routes" },
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

export async function buildOpsCommandCenterSnapshot(input: {
  adminUserId?: string | null;
  email?: string | null;
  displayName?: string | null;
  roleKey: string;
  roleLabel: string;
  access?: UserAccess | null;
}): Promise<OpsCommandCenterSnapshot> {
  const supabase = getServiceSupabase();

  const [
    checkingIn,
    checkingOut,
    allOpenTasks,
    myTasks,
    notifications,
    recentEvents,
    statusCounts,
    lastWebhook,
    lastDogSeen,
    staffFeed,
    boardLanes
  ] = await Promise.all([
    supabase
      .from("live_transition_dogs")
      .select("id", { count: "exact", head: true })
      .eq("display_status", "checking_in")
      .eq("hidden", false),
    supabase
      .from("live_transition_dogs")
      .select("id", { count: "exact", head: true })
      .eq("display_status", "checking_out")
      .eq("hidden", false),
    listOpenOpsTasks({ limit: 40 }).catch(() => [] as OpsTask[]),
    listOpenOpsTasks({
      assignedAdminId: input.adminUserId,
      limit: 20
    }).catch(() => [] as OpsTask[]),
    input.adminUserId
      ? listOpsNotificationsForUser(input.adminUserId, {
          roleKey: input.roleKey,
          limit: 20,
          unreadOnly: false
        }).catch(() => [] as OpsNotification[])
      : Promise.resolve([] as OpsNotification[]),
    listRecentOpsEvents(25).catch(() => [] as OpsEvent[]),
    countDogsByStatus().catch(() => ({}) as Record<string, number>),
    supabase
      .from("gingr_webhook_events")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("live_transition_dogs")
      .select("last_seen_from_gingr_at")
      .not("last_seen_from_gingr_at", "is", null)
      .order("last_seen_from_gingr_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadStaffOpsFeed().catch(() => ({
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
      openIssueCount: 0
    })),
    loadBoardLaneSamples(8).catch(() => ({ arriving: [], leaving: [] }))
  ]);

  const checkingInCount = checkingIn.count || 0;
  const checkingOutCount = checkingOut.count || 0;
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
  const yardTeamLead = isTeamLeadDashboardUser({
    legacyRole: input.roleKey,
    access: input.access,
    dashboardRole: input.roleKey || null
  });
  const shiftActor = {
    name: input.displayName,
    email: input.email,
    adminUserId: input.adminUserId,
    directoryName: directoryMember?.name ?? null
  };
  const assignedLogs = yardTeamLead ? assignedOpenLogMessages(staffFeed.crossoverMessages || [], shiftActor).map(openLogToWorkItem) : [];
  const assignedIssues = yardTeamLead
    ? assignedActiveIssues(staffFeed.issues || [], shiftActor).map(issueToWorkItem)
    : [];
  const previousNotes = yardTeamLead
    ? previousTeamLeadShiftNotes(staffFeed.crossoverMessages || [], shiftActor, staffFeed.staffDirectory || [])
    : { previousLeadName: null as string | null, notes: [] as TeamLeadShiftNote[] };

  const openWork = (
    yardTeamLead
      ? [...myTaskWork, ...assignedIssues, ...assignedLogs]
      : [...myTaskWork, ...staffFeed.followUpItems, ...staffFeed.issueItems]
  )
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority) || String(a.dueAt || "").localeCompare(String(b.dueAt || "")))
    .slice(0, 24);

  const alertFeed = [...(yardTeamLead ? [] : staffFeed.alertItems), ...notifWork]
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority))
    .slice(0, 20);

  const needsAttentionSource = yardTeamLead
    ? [...assignedLogs, ...assignedIssues]
    : [
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
  const uniqueNeeds = needsAttentionRaw
    .filter((item) => {
      if (seenNeeds.has(item.id)) return false;
      seenNeeds.add(item.id);
      return true;
    })
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, yardTeamLead ? 24 : 16);

  const openWorkCount = yardTeamLead
    ? assignedLogs.length + assignedIssues.length + myTaskWork.filter((item) => dueSoon(item.dueAt)).length
    : allOpenTasks.filter((task) => dueSoon(task.dueAt)).length +
      staffFeed.followUpItems.filter((item) => dueSoon(item.dueAt)).length +
      staffFeed.openIssueCount;

  const criticalAlerts = yardTeamLead
    ? assignedLogs.filter((item) => item.priority === "critical").length +
      assignedIssues.filter((item) => item.priority === "critical").length +
      notifications.filter((n) => n.priority === "critical" && !n.resolvedAt).length
    : notifications.filter((n) => n.priority === "critical" && !n.resolvedAt).length +
      staffFeed.criticalPaymentCount +
      staffFeed.issueItems.filter((item) => item.priority === "critical").length;

  const gingrHealth = evaluateGingrHealth({
    lastWebhookAt: lastWebhook.data?.created_at ? String(lastWebhook.data.created_at) : null,
    lastDogSeenAt: lastDogSeen.data?.last_seen_from_gingr_at
      ? String(lastDogSeen.data.last_seen_from_gingr_at)
      : null
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
    tools: toolsForRole(input.roleKey),
    teamLeadView: {
      enabled: yardTeamLead,
      previousLeadName: previousNotes.previousLeadName,
      shiftNotes: previousNotes.notes
    }
  };
}
