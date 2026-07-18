type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import { listDisplayDevices } from "@/lib/display-keeper-server";
import { activePipPlans, listPipPlans, pipReviewsDueThisWeek, type PipPlan } from "@/lib/hr/pip";
import { buildHrHubStats, isHrRecord, toHrRecord, formatHrReportType } from "@/lib/hr/records";
import { loadCastTvHeartbeat, isCastTvOnline } from "@/lib/cast-tv/media";
import { listStaffOps, type ActiveIssue, type OwnerFollowUp, type StaffActivityLog } from "@/lib/staff/admin-ops";
import {
  computeSupportHubStats,
  mapReportToInboxRow,
  type SupportInboxRow
} from "@/lib/staff/management-support-admin";
import { listAllManagementReports } from "@/lib/staff/management-reports";
import { listStaffPushNotices, type StaffPushNotice } from "@/lib/staff/push-notices";

export type OverviewAlertPriority = "high" | "medium" | "low";
export type OverviewAlertStatus = "New" | "In Progress" | "Assigned" | "Escalated" | "Overdue" | "Resolved";

export type OverviewAlert = {
  id: string;
  source: "issue" | "follow_up" | "support" | "push";
  priority: OverviewAlertPriority;
  type: string;
  message: string;
  dog_or_employee: string | null;
  assigned_to: string | null;
  created_at: string;
  sla_due_at: string;
  sla_remaining_ms: number;
  sla_total_ms: number;
  status: OverviewAlertStatus;
  href_tab: string;
};

export type OverviewHrNotification = {
  id: string;
  employee: string;
  notification_type: string;
  summary: string;
  submitted_by: string;
  date: string;
  status: string;
  follow_up: string | null;
  href_tab: string;
};

export type OverviewMetric = {
  key: string;
  label: string;
  value: string | number;
  detail: string;
  trend_label: string;
  trend_direction: "up" | "down" | "flat";
  tone: "red" | "orange" | "purple" | "blue" | "amber" | "green";
  href_tab?: string;
};

export type OverviewPriorityItem = {
  key: string;
  label: string;
  count: number;
  href_tab: string;
};

export type OverviewActionItem = {
  key: string;
  label: string;
  count: number;
  href_tab: string;
};

export type OverviewActivityItem = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  category: string;
};

export type OverviewUpcomingReview = {
  id: string;
  name: string;
  kind: string;
  due_date: string;
  days_remaining: number;
  href_tab: string;
};

export type OverviewBoardNote = {
  id: string;
  text: string;
  author: string;
  created_at: string;
};

export type OverviewPayload = {
  generated_at: string;
  metrics: OverviewMetric[];
  priorities: {
    urgent_count: number;
    items: OverviewPriorityItem[];
  };
  alerts: OverviewAlert[];
  hr_notifications: OverviewHrNotification[];
  pip_plans: PipPlan[];
  action_center: OverviewActionItem[];
  recent_activity: OverviewActivityItem[];
  upcoming_reviews: OverviewUpcomingReview[];
  board_notes: OverviewBoardNote[];
  board_health: {
    label: string;
    detail: string;
    online_devices: number;
    total_devices: number;
    cast_tv_online: boolean;
  };
};

const BOARD_NOTES_KEY = "overview_board_notes";

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || /does not exist|relation/i.test(error?.message ?? "");
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dayKey(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function isOpenOpsStatus(status: string) {
  return !["Resolved", "Closed", "Completed", "Cancelled", "Archived"].includes(status);
}

function mapPriority(value: string | null | undefined): OverviewAlertPriority {
  const v = String(value || "").toLowerCase();
  if (v === "urgent" || v === "high" || v === "critical") return "high";
  if (v === "low") return "low";
  return "medium";
}

function slaWindowMs(priority: OverviewAlertPriority) {
  if (priority === "high") return 60 * 60 * 1000;
  if (priority === "medium") return 4 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function withSla(createdAt: string, priority: OverviewAlertPriority) {
  const created = new Date(createdAt).getTime();
  const total = slaWindowMs(priority);
  const due = created + total;
  return {
    sla_due_at: new Date(due).toISOString(),
    sla_remaining_ms: due - Date.now(),
    sla_total_ms: total
  };
}

function countCreatedBetween(items: Array<{ created_at: string }>, startMs: number, endMs: number) {
  return items.filter((item) => {
    const t = new Date(item.created_at).getTime();
    return t >= startMs && t < endMs;
  }).length;
}

function trendFromCounts(today: number, yesterday: number): {
  trend_label: string;
  trend_direction: "up" | "down" | "flat";
} {
  const delta = today - yesterday;
  if (delta === 0) return { trend_label: "0 vs yesterday", trend_direction: "flat" };
  if (delta > 0) return { trend_label: `↑ ${delta} vs yesterday`, trend_direction: "up" };
  return { trend_label: `↓ ${Math.abs(delta)} vs yesterday`, trend_direction: "down" };
}

function relativeFollowUpLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

function daysRemaining(iso: string | null | undefined) {
  if (!iso) return 999;
  const date = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function issueToAlert(issue: ActiveIssue): OverviewAlert {
  const priority = mapPriority(issue.priority);
  const overdue = issue.due_at ? new Date(issue.due_at).getTime() < Date.now() : false;
  const status: OverviewAlertStatus = overdue
    ? "Overdue"
    : issue.status === "In Progress"
      ? "In Progress"
      : issue.assigned_to
        ? "Assigned"
        : "New";
  return {
    id: `issue:${issue.id}`,
    source: "issue",
    priority,
    type: issue.category || "Active Issue",
    message: issue.title,
    dog_or_employee: issue.related_dog_name || issue.related_owner_name || issue.reported_by,
    assigned_to: issue.assigned_to,
    created_at: issue.created_at || issue.reported_at,
    ...withSla(issue.created_at || issue.reported_at, priority),
    status,
    href_tab: "active_issues"
  };
}

function followUpToAlert(followUp: OwnerFollowUp): OverviewAlert {
  const priority = followUp.urgent ? "high" : mapPriority(followUp.priority);
  const overdue = followUp.due_date ? new Date(`${followUp.due_date}T23:59:59`).getTime() < Date.now() : false;
  return {
    id: `follow_up:${followUp.id}`,
    source: "follow_up",
    priority,
    type: "Owner Follow-Up",
    message: followUp.subject,
    dog_or_employee: [followUp.dog_name, followUp.owner_name].filter(Boolean).join(" / ") || null,
    assigned_to: followUp.assigned_to,
    created_at: followUp.created_at,
    ...withSla(followUp.created_at, priority),
    status: overdue ? "Overdue" : followUp.assigned_to ? "Assigned" : "New",
    href_tab: "owner_follow_up"
  };
}

function supportToAlert(row: SupportInboxRow): OverviewAlert {
  const priority = mapPriority(row.priority);
  const status: OverviewAlertStatus =
    row.priority === "Urgent" || row.priority === "High"
      ? "Escalated"
      : row.status === "In Review"
        ? "In Progress"
        : row.assigned_to
          ? "Assigned"
          : "New";
  return {
    id: `support:${row.id}`,
    source: "support",
    priority,
    type: row.item_type === "Complaint" ? "Staff Complaint" : "Staff Request",
    message: row.subject,
    dog_or_employee: row.related_staff_name || row.related_dog_name || row.submitted_by,
    assigned_to: row.assigned_to,
    created_at: row.date_submitted,
    ...withSla(row.date_submitted, priority),
    status,
    href_tab: "ms_hub"
  };
}

function pushToAlert(notice: StaffPushNotice): OverviewAlert {
  const priority = mapPriority(notice.priority);
  return {
    id: `push:${notice.id}`,
    source: "push",
    priority,
    type: notice.notice_type === "owner_complaint_dog_handler" ? "Owner Complaint" : "Live Alert",
    message: notice.title || notice.message || "Active push notice",
    dog_or_employee: notice.dog_handler_name ?? null,
    assigned_to: null,
    created_at: notice.pushed_at || notice.created_at,
    ...withSla(notice.pushed_at || notice.created_at, priority),
    status: priority === "high" ? "Escalated" : "New",
    href_tab: "push_notices"
  };
}

async function loadBoardNotes(supabase: SupabaseClient): Promise<OverviewBoardNote[]> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = settings[BOARD_NOTES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const note = row as Partial<OverviewBoardNote>;
      const text = String(note.text ?? "").trim();
      if (!text) return null;
      return {
        id: String(note.id || newId("note")),
        text: text.slice(0, 1000),
        author: String(note.author || "Admin"),
        created_at: String(note.created_at || new Date().toISOString())
      } satisfies OverviewBoardNote;
    })
    .filter((note): note is OverviewBoardNote => Boolean(note))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
}

export async function saveOverviewBoardNote(
  supabase: SupabaseClient,
  input: { text: string; author?: string | null },
  existing?: OverviewBoardNote[]
) {
  const text = input.text.trim().slice(0, 1000);
  if (!text) throw new Error("Note text is required.");
  const notes = existing ?? (await loadBoardNotes(supabase));
  const note: OverviewBoardNote = {
    id: newId("note"),
    text,
    author: (input.author || "Admin").trim() || "Admin",
    created_at: new Date().toISOString()
  };
  const next = [note, ...notes].slice(0, 20);
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [BOARD_NOTES_KEY]: next
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
  return note;
}

export async function buildOverviewPayload(supabase: SupabaseClient): Promise<OverviewPayload> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const yesterdayStartMs = todayStartMs - dayMs;

  const [ops, reports, notices, pipPlans, devices, castHeartbeat, boardNotes] = await Promise.all([
    listStaffOps(supabase),
    listAllManagementReports(supabase),
    listStaffPushNotices(supabase, 100),
    listPipPlans(supabase),
    listDisplayDevices(supabase).catch(() => []),
    loadCastTvHeartbeat(supabase).catch(() => null),
    loadBoardNotes(supabase)
  ]);

  const openIssues = ops.active_issues.filter((issue) => isOpenOpsStatus(issue.status));
  const openFollowUps = ops.owner_follow_ups.filter((item) => isOpenOpsStatus(item.status));
  const overdueFollowUps = openFollowUps.filter(
    (item) => item.due_date && new Date(`${item.due_date}T23:59:59`).getTime() < now
  );
  const overdueIssues = openIssues.filter((item) => item.due_at && new Date(item.due_at).getTime() < now);
  const staffingIssues = openIssues.filter((issue) => issue.category === "Staff Issue");
  const criticalStaffing = staffingIssues.filter(
    (issue) => String(issue.priority).toLowerCase() === "urgent" || String(issue.priority).toLowerCase() === "high"
  );

  const supportRows = reports.map(mapReportToInboxRow);
  const supportStats = computeSupportHubStats(supportRows);
  const openSupport = supportRows.filter(
    (row) => row.status !== "Closed" && row.status !== "Resolved"
  );
  const highSupport = openSupport.filter((row) => row.priority === "Urgent" || row.priority === "High");

  const hrReports = reports.filter(isHrRecord);
  const hrRecords = hrReports.map(toHrRecord);
  const hrStats = buildHrHubStats(hrRecords);
  const openHr = hrRecords.filter((r) => !["Closed", "Resolved", "Reviewed"].includes(r.status));

  const activeNotices = notices.filter((notice) => notice.is_active && !notice.cleared_at);
  const highNotices = activeNotices.filter((n) => n.priority === "urgent" || n.display_mode === "urgent");

  const activePip = activePipPlans(pipPlans);
  const pipDueWeek = pipReviewsDueThisWeek(pipPlans);

  const alerts: OverviewAlert[] = [
    ...openIssues.map(issueToAlert),
    ...openFollowUps.filter((f) => f.urgent || (f.due_date && new Date(`${f.due_date}T23:59:59`).getTime() < now)).map(followUpToAlert),
    ...highSupport.map(supportToAlert),
    ...activeNotices.map(pushToAlert)
  ]
    .sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 } as const;
      if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 50);

  const highPriorityAlerts = alerts.filter((a) => a.priority === "high");
  const unassignedAlerts = alerts.filter((a) => !a.assigned_to);
  const overdueAlerts = alerts.filter((a) => a.status === "Overdue" || a.sla_remaining_ms < 0);

  const onlineDevices = devices.filter((device) => {
    const seen = new Date(device.last_seen_at).getTime();
    return Number.isFinite(seen) && now - seen <= 5 * 60 * 1000;
  });
  const castOnline = isCastTvOnline(castHeartbeat?.last_seen_at, now);
  const totalDevices = Math.max(devices.length, castOnline || devices.length ? 1 : 0);
  const onlineCount = onlineDevices.length + (castOnline ? 1 : 0);
  const healthRatio = totalDevices ? onlineCount / (devices.length + 1) : castOnline ? 1 : 1;
  const boardHealthLabel = !devices.length && !castHeartbeat
    ? "Good"
    : healthRatio >= 0.8
      ? "Good"
      : healthRatio >= 0.5
        ? "Fair"
        : "Needs Attention";
  const uptimePct = Math.round(Math.min(1, Math.max(0, healthRatio)) * 10000) / 100;

  const openTasks = openIssues.length + openFollowUps.length + supportStats.open_items;
  const overdueTasks = overdueIssues.length + overdueFollowUps.length + overdueAlerts.filter((a) => a.source !== "issue" && a.source !== "follow_up").length;

  const createdTodayAlerts = countCreatedBetween(
    [...openIssues, ...activeNotices.map((n) => ({ created_at: n.pushed_at || n.created_at }))],
    todayStartMs,
    now + 1
  );
  const createdYesterdayAlerts = countCreatedBetween(
    [...ops.active_issues, ...notices.map((n) => ({ created_at: n.pushed_at || n.created_at }))],
    yesterdayStartMs,
    todayStartMs
  );
  const hrToday = countCreatedBetween(hrRecords, todayStartMs, now + 1);
  const hrYesterday = countCreatedBetween(hrRecords, yesterdayStartMs, todayStartMs);
  const tasksToday = countCreatedBetween(
    [...openIssues, ...openFollowUps],
    todayStartMs,
    now + 1
  );
  const tasksYesterday = countCreatedBetween(
    [...ops.active_issues, ...ops.owner_follow_ups],
    yesterdayStartMs,
    todayStartMs
  );

  const metrics: OverviewMetric[] = [
    {
      key: "active_alerts",
      label: "Active Alerts",
      value: alerts.length,
      detail: `${highPriorityAlerts.length} High priority`,
      ...trendFromCounts(createdTodayAlerts, createdYesterdayAlerts),
      tone: "red",
      href_tab: "push_notices"
    },
    {
      key: "hr_notifications",
      label: "HR Notifications",
      value: openHr.length || hrStats.total,
      detail: `${supportStats.needs_review} Needs review`,
      ...trendFromCounts(hrToday, hrYesterday),
      tone: "orange",
      href_tab: "hr_hub"
    },
    {
      key: "pip",
      label: "Employees on PIP",
      value: activePip.length,
      detail: `${pipDueWeek.length} reviews this week`,
      trend_label: "0 vs yesterday",
      trend_direction: "flat",
      tone: "purple",
      href_tab: "hr_pip"
    },
    {
      key: "open_tasks",
      label: "Open Tasks",
      value: openTasks,
      detail: `${overdueTasks} Overdue`,
      ...trendFromCounts(tasksToday, tasksYesterday),
      tone: "blue",
      href_tab: "active_issues"
    },
    {
      key: "staffing",
      label: "Staffing Issues",
      value: staffingIssues.length,
      detail: `${criticalStaffing.length} Critical`,
      trend_label: "0 vs yesterday",
      trend_direction: "flat",
      tone: "amber",
      href_tab: "active_issues"
    },
    {
      key: "board_health",
      label: "Board Health",
      value: boardHealthLabel,
      detail: `Uptime ${uptimePct}% · ${onlineDevices.length}/${devices.length || 0} displays`,
      trend_label: castOnline ? "CAST-TV online" : "CAST-TV offline",
      trend_direction: castOnline ? "up" : "down",
      tone: boardHealthLabel === "Good" ? "green" : boardHealthLabel === "Fair" ? "amber" : "red",
      href_tab: "display"
    }
  ];

  const priorityItems: OverviewPriorityItem[] = [
    { key: "high_alerts", label: "High priority alerts", count: highPriorityAlerts.length, href_tab: "push_notices" },
    { key: "hr_followups", label: "HR follow-ups due today", count: openHr.filter((r) => dayKey(r.created_at) === dayKey(new Date())).length || supportStats.needs_review, href_tab: "hr_hub" },
    { key: "pip_reviews", label: "PIP reviews due this week", count: pipDueWeek.length, href_tab: "hr_pip" },
    {
      key: "board_issues",
      label: "Board issue unresolved",
      count: boardHealthLabel === "Good" ? 0 : 1,
      href_tab: "display"
    }
  ].filter((item) => item.count > 0);

  const hr_notifications: OverviewHrNotification[] = openHr.slice(0, 20).map((record) => ({
    id: record.id,
    employee: record.subject_name || "Staff",
    notification_type: formatHrReportType(record.report_type),
    summary: record.summary,
    submitted_by: record.created_by || "Staff",
    date: record.created_at,
    status: record.status,
    follow_up: relativeFollowUpLabel(record.created_at),
    href_tab: "hr_hub"
  }));

  const action_center: OverviewActionItem[] = [
    { key: "review_high", label: "Review high priority alerts", count: highPriorityAlerts.length, href_tab: "push_notices" },
    { key: "assign_unassigned", label: "Assign unassigned queue items", count: unassignedAlerts.length, href_tab: "active_issues" },
    { key: "hr_review", label: "Review HR notifications", count: supportStats.needs_review, href_tab: "hr_hub" },
    { key: "pip_week", label: "Complete PIP reviews this week", count: pipDueWeek.length, href_tab: "hr_pip" },
    { key: "overdue_tasks", label: "Clear overdue tasks", count: overdueTasks, href_tab: "owner_follow_up" }
  ].filter((item) => item.count > 0);

  const recent_activity: OverviewActivityItem[] = [
    ...ops.activity_logs.slice(0, 15).map((log: StaffActivityLog) => ({
      id: log.id,
      title: log.title,
      description: log.description,
      created_at: log.created_at,
      category: log.activity_type || "activity"
    })),
    ...activeNotices.slice(0, 5).map((notice) => ({
      id: `notice-${notice.id}`,
      title: notice.title,
      description: notice.message,
      created_at: notice.pushed_at || notice.created_at,
      category: "alert"
    }))
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 12);

  const upcoming_reviews: OverviewUpcomingReview[] = [
    ...pipDueWeek.map((plan) => ({
      id: plan.id,
      name: plan.employee_name,
      kind: "PIP review",
      due_date: plan.next_review_date || "",
      days_remaining: daysRemaining(plan.next_review_date),
      href_tab: "hr_pip"
    })),
    ...openFollowUps
      .filter((f) => f.due_date)
      .slice(0, 8)
      .map((f) => ({
        id: f.id,
        name: f.owner_name || f.subject,
        kind: "Owner follow-up",
        due_date: f.due_date || "",
        days_remaining: daysRemaining(f.due_date),
        href_tab: "owner_follow_up"
      }))
  ]
    .sort((a, b) => a.days_remaining - b.days_remaining)
    .slice(0, 8);

  return {
    generated_at: new Date().toISOString(),
    metrics,
    priorities: {
      urgent_count: priorityItems.reduce((sum, item) => sum + item.count, 0),
      items: priorityItems
    },
    alerts,
    hr_notifications,
    pip_plans: activePip,
    action_center,
    recent_activity,
    upcoming_reviews,
    board_notes: boardNotes,
    board_health: {
      label: boardHealthLabel,
      detail: `Uptime ${uptimePct}%`,
      online_devices: onlineDevices.length,
      total_devices: devices.length,
      cast_tv_online: castOnline
    }
  };
}
