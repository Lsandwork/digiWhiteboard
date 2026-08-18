import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { clearStaffInboxNotifications, listStaffOps } from "@/lib/staff/admin-ops";
import {
  countUnreadNotifications,
  notificationReaderKey,
  notificationsForSession,
  type StaffNotification
} from "@/lib/staff/notifications";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolveWalkBoardActor } from "@/lib/walks-board/actor";
import { WALK_BOARD_ALARM_CHECKLIST, WALK_BOARD_ALARM_TITLE } from "@/lib/walks-board/constants";
import { formatWalkBoardCountdown, getWalkBoardUrgency } from "@/lib/walks-board/display";
import { formatWalkBoardHourLabel } from "@/lib/walks-board/schedule";
import { loadWalkBoardPublicState } from "@/lib/walks-board/server";

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
  title: string;
  message: string;
  hourLabel: string;
  urgency: "alarm_due" | "overdue" | "due_soon";
  countdown: string;
  dueAt: string;
  version: number;
  checklist: string[];
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

  try {
    const actor = await resolveWalkBoardActor(supabase, session);
    const boardState = await loadWalkBoardPublicState(supabase, {
      userId: actor?.actorUserId ?? session.adminUserId,
      legacyRole: session.role,
      email: session.email
    });

    if (boardState.permissions.canReceiveReminders && boardState.currentCycle?.status === "pending") {
      const nowMs = Date.now();
      const urgency = getWalkBoardUrgency(boardState.currentCycle, nowMs);
      if (urgency === "alarm_due" || urgency === "overdue" || urgency === "due_soon") {
        if (urgency === "overdue") walkOverdueCount = 1;
        else walkDueCount = 1;
        walkAlerts = [
          {
            id: boardState.currentCycle.id,
            title: WALK_BOARD_ALARM_TITLE,
            message: boardState.message,
            hourLabel: formatWalkBoardHourLabel(boardState.currentCycle.scheduled_hour),
            urgency,
            countdown: formatWalkBoardCountdown(boardState.currentCycle, nowMs),
            dueAt: boardState.currentCycle.due_at,
            version: boardState.currentCycle.version,
            checklist: [...WALK_BOARD_ALARM_CHECKLIST]
          }
        ];
      }
    }
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
    canSnooze: false,
    recent,
    walkAlerts,
    serverTime: new Date().toISOString()
  });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = String(body.action || "clear_inbox");
    if (action !== "clear_inbox" && action !== "clear_inbox_notifications") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const readerSession = {
      email: session.email ?? null,
      adminUserId: session.adminUserId ?? null,
      role: session.role ?? null
    };
    const readerKey = notificationReaderKey(readerSession.email, readerSession.adminUserId);
    const next = await clearStaffInboxNotifications(supabase, readerKey, readerSession);
    const unreadCount = countUnreadNotifications(next, readerSession);

    void writeAdminAuditLog({
      actorAdminId: session.adminUserId ?? null,
      actorEmail: session.email ?? null,
      action: "staff.notification.clear_inbox",
      targetType: "staff_operations",
      details: { unreadRemaining: unreadCount }
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, unreadCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear inbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
