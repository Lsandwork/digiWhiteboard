import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { listStaffOps } from "@/lib/staff/admin-ops";
import {
  countUnreadNotifications,
  notificationReaderKey,
  notificationsForSession,
  type StaffNotification
} from "@/lib/staff/notifications";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolveWalkBoardActor } from "@/lib/walks-board/actor";
import {
  formatWalkBoardCountdown,
  getWalkBoardUrgency,
  sortWalkBoardEntries,
  summarizeWalkBoardEntries,
  walkBoardTypeLabel
} from "@/lib/walks-board/display";
import {
  listActiveWalkBoardEntries,
  resolveWalkBoardPermissions
} from "@/lib/walks-board/server";

export const dynamic = "force-dynamic";

type BellNotificationItem = {
  id: string;
  title: string;
  body: string | null;
  priority: StaffNotification["priority"];
  sourceTab: StaffNotification["source_tab"];
  sourceId: string;
  createdAt: string;
  isWalkAlert: boolean;
};

type BellWalkAlert = {
  id: string;
  dogName: string;
  walkType: "no_plays" | "groomed" | "break_dog";
  walkTypeLabel: string;
  urgency: "walk_due" | "overdue";
  countdown: string;
  nextDueAt: string;
  snoozeUsed: boolean;
  version: number;
};

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const readerSession = {
    email: session.email ?? null,
    adminUserId: session.adminUserId ?? null,
    role: session.role ?? null
  };

  let unreadCount = 0;
  let recent: BellNotificationItem[] = [];
  let walkNotificationCount = 0;

  try {
    const state = await listStaffOps(supabase);
    unreadCount = countUnreadNotifications(state, readerSession);
    const readerKey = notificationReaderKey(readerSession.email, readerSession.adminUserId);
    const unread = notificationsForSession(state, readerSession)
      .filter((notification) => !notification.read_by.includes(readerKey))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    walkNotificationCount = unread.filter((notification) => notification.source_tab === "walks_board").length;
    recent = unread.slice(0, 8).map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      sourceTab: notification.source_tab,
      sourceId: notification.source_id,
      createdAt: notification.created_at,
      isWalkAlert: notification.source_tab === "walks_board"
    }));
  } catch {
    // Notifications store may be unavailable; still return walk alerts.
  }

  let walkAlerts: BellWalkAlert[] = [];
  let walkDueCount = 0;
  let walkOverdueCount = 0;
  let canSnooze = false;

  try {
    const actor = await resolveWalkBoardActor(supabase, session);
    const permissions = await resolveWalkBoardPermissions(
      supabase,
      actor?.actorUserId ?? session.adminUserId,
      session.role,
      session.email
    );
    canSnooze = permissions.canSnooze;

    const entries = await listActiveWalkBoardEntries(supabase);
    const nowMs = Date.now();
    const summary = summarizeWalkBoardEntries(entries, nowMs);
    walkDueCount = summary.dueNowCount;
    walkOverdueCount = summary.overdueCount;

    const nextAlerts: BellWalkAlert[] = [];
    for (const entry of sortWalkBoardEntries(entries, nowMs)) {
      const urgency = getWalkBoardUrgency(entry, nowMs);
      if (urgency !== "walk_due" && urgency !== "overdue") continue;
      nextAlerts.push({
        id: entry.id,
        dogName: entry.dog_name,
        walkType: entry.walk_type,
        walkTypeLabel: walkBoardTypeLabel(entry.walk_type),
        urgency,
        countdown: formatWalkBoardCountdown(entry, nowMs),
        nextDueAt: entry.next_due_at,
        snoozeUsed: entry.snooze_used,
        version: entry.version
      });
      if (nextAlerts.length >= 12) break;
    }
    walkAlerts = nextAlerts;
  } catch {
    // Walk board may be unavailable for this session.
  }

  const walkAlertCount = walkDueCount + walkOverdueCount;
  const badgeCount = unreadCount + walkAlertCount;
  const hasUrgent = walkAlertCount > 0 || walkNotificationCount > 0;

  return NextResponse.json({
    unreadCount,
    walkAlertCount,
    walkDueCount,
    walkOverdueCount,
    walkNotificationCount,
    badgeCount,
    hasUrgent,
    canSnooze,
    recent,
    walkAlerts,
    serverTime: new Date().toISOString()
  });
}
