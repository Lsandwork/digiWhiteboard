import { getServiceSupabase } from "@/lib/supabase/server";
import { listOpenOpsTasks } from "@/lib/ops-command-center/tasks";
import { listOpsNotificationsForUser } from "@/lib/ops-command-center/notifications";
import { listRecentOpsEvents } from "@/lib/ops-command-center/events";
import { countDogsByStatus } from "@/lib/ops-command-center/status";
import type { OpsEvent, OpsNotification, OpsTask } from "@/lib/ops-command-center/types";
import { evaluateGingrHealth } from "@/lib/ops-command-center/gingr-health";

export type NeedsAttentionItem = {
  id: string;
  severity: "critical" | "high" | "attention" | "informational";
  title: string;
  detail: string | null;
  hrefTab: string | null;
  dogName?: string | null;
};

export type OpsCommandCenterSnapshot = {
  greetingName: string;
  roleKey: string;
  roleLabel: string;
  generatedAt: string;
  shiftSummary: {
    dogsCheckingOut: number;
    tasksDue: number;
    criticalAlerts: number;
    ownerFollowUps: number;
    dogsOnsite: number;
  };
  liveCounts: Record<string, number>;
  boardCounts: {
    checkingIn: number;
    checkingOut: number;
    onsiteEstimate: number;
  };
  needsAttention: NeedsAttentionItem[];
  myTasks: OpsTask[];
  notifications: OpsNotification[];
  recentEvents: OpsEvent[];
  gingrHealth: {
    status: "healthy" | "degraded" | "offline" | "unknown";
    label: string;
    detail: string | null;
  };
  tools: Array<{ tab: string; label: string }>;
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

export async function buildOpsCommandCenterSnapshot(input: {
  adminUserId?: string | null;
  email?: string | null;
  displayName?: string | null;
  roleKey: string;
  roleLabel: string;
}): Promise<OpsCommandCenterSnapshot> {
  const supabase = getServiceSupabase();

  const [checkingIn, checkingOut, openTasks, notifications, recentEvents, statusCounts, lastWebhook, lastDogSeen] =
    await Promise.all([
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
        .maybeSingle()
    ]);

  // Owner follow-ups still live in staff ops JSON — count via best-effort helper.
  let ownerFollowUps = 0;
  try {
    const { listStaffOps } = await import("@/lib/staff/admin-ops");
    const ops = await listStaffOps(supabase);
    ownerFollowUps = (ops.owner_follow_ups || []).filter((row) => {
      const status = String(row.status || "").toLowerCase();
      return !["resolved", "closed", "done", "archived"].includes(status);
    }).length;
  } catch {
    ownerFollowUps = 0;
  }

  const checkingInCount = checkingIn.count || 0;
  const checkingOutCount = checkingOut.count || 0;
  const dogsOnsite =
    (statusCounts.checked_in || 0) +
    (statusCounts.yard || 0) +
    (statusCounts.break || 0) +
    (statusCounts.grooming || 0) +
    (statusCounts.training || 0) +
    (statusCounts.outing || 0) +
    (statusCounts.transportation || 0) +
    (statusCounts.overnight || 0);

  const criticalAlerts = notifications.filter((n) => n.priority === "critical" && !n.resolvedAt).length;
  const tasksDue = openTasks.filter((task) => {
    if (!task.dueAt) return task.status === "open" || task.status === "in_progress";
    return new Date(task.dueAt).getTime() <= Date.now() + 60 * 60 * 1000;
  }).length;

  const needsAttention: NeedsAttentionItem[] = [];
  for (const task of openTasks.slice(0, 8)) {
    needsAttention.push({
      id: `task:${task.id}`,
      severity: task.priority,
      title: task.title,
      detail: task.dueAt ? `Due ${new Date(task.dueAt).toLocaleTimeString()}` : task.notes,
      hrefTab: "my_shift",
      dogName: null
    });
  }
  for (const note of notifications.filter((n) => !n.resolvedAt).slice(0, 8)) {
    needsAttention.push({
      id: `notif:${note.id}`,
      severity: note.priority,
      title: note.title,
      detail: note.body,
      hrefTab: note.hrefTab,
      dogName: null
    });
  }

  const gingrHealth = evaluateGingrHealth({
    lastWebhookAt: lastWebhook.data?.created_at ? String(lastWebhook.data.created_at) : null,
    lastDogSeenAt: lastDogSeen.data?.last_seen_from_gingr_at
      ? String(lastDogSeen.data.last_seen_from_gingr_at)
      : null
  });

  return {
    greetingName: greetingNameFromEmail(input.email, input.displayName),
    roleKey: input.roleKey,
    roleLabel: input.roleLabel,
    generatedAt: new Date().toISOString(),
    shiftSummary: {
      dogsCheckingOut: checkingOutCount,
      tasksDue,
      criticalAlerts,
      ownerFollowUps,
      dogsOnsite: dogsOnsite || checkingInCount + checkingOutCount
    },
    liveCounts: statusCounts,
    boardCounts: {
      checkingIn: checkingInCount,
      checkingOut: checkingOutCount,
      onsiteEstimate: dogsOnsite || checkingInCount + checkingOutCount
    },
    needsAttention: needsAttention.slice(0, 12),
    myTasks: openTasks,
    notifications,
    recentEvents,
    gingrHealth: {
      status: gingrHealth.status,
      label: gingrHealth.label,
      detail: gingrHealth.detail
    },
    tools: toolsForRole(input.roleKey)
  };
}
