type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import {
  loadAdminSettingsJsonKey,
  loadAdminSettingsJsonPointers,
  saveAdminSettingsJsonKey,
  type AdminSettingsJsonPointer
} from "@/lib/admin/settings-json-store";
import { activePipPlans, pipReviewsDueThisWeek, type PipPlan } from "@/lib/hr/pip";
import { buildHrHubStats, isHrRecord, toHrRecord, formatHrReportType } from "@/lib/hr/records";
import { type ActiveIssue, type OwnerFollowUp, type StaffActivityLog } from "@/lib/staff/admin-ops";
import {
  computeSupportHubStats,
  mapReportToInboxRow,
  type SupportInboxRow
} from "@/lib/staff/management-support-admin";
import type { ManagementReport } from "@/lib/staff/management-reports";
import type { StaffPushNotice } from "@/lib/staff/push-notices";
import {
  toOverviewSystemHealth,
  type OverviewSystemHealth,
  type SystemHealthAuditState
} from "@/lib/admin/system-health-audit";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

/** Interactive overview GET. Do not raise this — hung JSONB must fail-soft. */
export const OVERVIEW_QUERY_TIMEOUT_MS = 4_000;
export const OVERVIEW_CLIENT_TIMEOUT_MS = 10_000;
export const OVERVIEW_CAST_TV_TIMEOUT_MS = 3_000;

export const OVERVIEW_SETTINGS_POINTERS: AdminSettingsJsonPointer[] = [
  { alias: "active_issues", path: "staff_admin_ops->active_issues" },
  { alias: "owner_follow_ups", path: "staff_admin_ops->owner_follow_ups" },
  { alias: "activity_logs", path: "staff_admin_ops->activity_logs" },
  { alias: "reports", path: "management_reports->reports" },
  { alias: "notices", path: "staff_push_notices->notices" },
  { alias: "pip_plans", path: "hr_pip_plans->plans" },
  { alias: "board_notes", path: "overview_board_notes" },
  { alias: "system_health", path: "system_health_audit" }
];

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
  /** True when a store timed out — page still renders with whatever arrived. */
  degraded?: boolean;
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
  system_health: OverviewSystemHealth;
};

const BOARD_NOTES_KEY = "overview_board_notes";

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

function parseBoardNotes(raw: unknown): OverviewBoardNote[] {
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

async function loadBoardNotes(supabase: SupabaseClient): Promise<OverviewBoardNote[]> {
  const loaded = await loadAdminSettingsJsonKey(supabase, BOARD_NOTES_KEY, parseBoardNotes, []);
  if (loaded === null) return [];
  return loaded;
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
  const ok = await saveAdminSettingsJsonKey(supabase, BOARD_NOTES_KEY, next);
  if (!ok) throw new Error("Unable to save board note.");
  return note;
}

function newestByCreatedAt<T extends { created_at?: string }>(value: unknown, limit: number): T[] {
  if (!Array.isArray(value)) return [];
  return [...(value as T[])]
    .sort(
      (a, b) =>
        new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()
    )
    .slice(0, limit);
}

function emptySystemHealthState(): SystemHealthAuditState {
  return {
    version: 1,
    last_run_at: null,
    last_run_id: null,
    overall_status: "never_run",
    open_issues: [],
    recent_rows: [],
    runs: []
  };
}

function parseOverviewSystemHealth(value: unknown): SystemHealthAuditState {
  if (!value || typeof value !== "object") return emptySystemHealthState();
  const raw = value as Partial<SystemHealthAuditState>;
  return {
    version: 1,
    last_run_at: raw.last_run_at ? String(raw.last_run_at) : null,
    last_run_id: raw.last_run_id ? String(raw.last_run_id) : null,
    overall_status:
      raw.overall_status === "all_clear" ||
      raw.overall_status === "issues" ||
      raw.overall_status === "failed_fixes" ||
      raw.overall_status === "never_run"
        ? raw.overall_status
        : "never_run",
    open_issues: Array.isArray(raw.open_issues) ? raw.open_issues : [],
    recent_rows: Array.isArray(raw.recent_rows) ? raw.recent_rows : [],
    runs: Array.isArray(raw.runs) ? raw.runs.slice(0, 20) : []
  };
}

function isCastTvOnline(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return now - seen <= 90_000;
}

type OverviewStores = {
  ok: boolean;
  issues: ActiveIssue[];
  followUps: OwnerFollowUp[];
  activity: StaffActivityLog[];
  reports: ManagementReport[];
  notices: StaffPushNotice[];
  pipPlans: PipPlan[];
  boardNotes: OverviewBoardNote[];
  systemHealth: SystemHealthAuditState;
};

const EMPTY_OVERVIEW_STORES: OverviewStores = {
  ok: false,
  issues: [],
  followUps: [],
  activity: [],
  reports: [],
  notices: [],
  pipPlans: [],
  boardNotes: [],
  systemHealth: emptySystemHealthState()
};

async function loadOverviewStores(supabase: SupabaseClient): Promise<OverviewStores> {
  const row = await loadAdminSettingsJsonPointers(supabase, OVERVIEW_SETTINGS_POINTERS);
  if (!row) return EMPTY_OVERVIEW_STORES;
  return {
    ok: true,
    issues: newestByCreatedAt<ActiveIssue>(row.active_issues, 80),
    followUps: newestByCreatedAt<OwnerFollowUp>(row.owner_follow_ups, 80),
    activity: newestByCreatedAt<StaffActivityLog>(row.activity_logs, 20),
    reports: newestByCreatedAt<ManagementReport>(row.reports, 80),
    notices: newestByCreatedAt<StaffPushNotice>(row.notices, 40),
    pipPlans: Array.isArray(row.pip_plans) ? (row.pip_plans as PipPlan[]).slice(0, 40) : [],
    boardNotes: parseBoardNotes(row.board_notes),
    systemHealth: parseOverviewSystemHealth(row.system_health)
  };
}

async function loadOverviewDevices(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("display_devices")
    .select("id, name, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(50);
  if (error) return [] as Array<{ last_seen_at?: string | null }>;
  return (data ?? []) as Array<{ last_seen_at?: string | null }>;
}

async function loadCastTvOnlinePublic(now: number): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return false;
  for (const bucket of ["lobby-slideshow", "cast-tv-media"] as const) {
    try {
      const response = await fetch(`${base}/storage/v1/object/public/${bucket}/cast-tv/heartbeats.json`, {
        cache: "no-store",
        signal: AbortSignal.timeout(OVERVIEW_CAST_TV_TIMEOUT_MS)
      });
      if (response.status === 400 || response.status === 404) continue;
      if (!response.ok) continue;
      const parsed = (await response.json()) as unknown;
      const raw =
        parsed && typeof parsed === "object" && "heartbeats" in parsed
          ? (parsed as { heartbeats?: unknown }).heartbeats
          : parsed;
      if (!raw || typeof raw !== "object") continue;
      const entries = Object.values(raw as Record<string, { last_seen_at?: string }>);
      if (entries.some((entry) => isCastTvOnline(entry?.last_seen_at, now))) return true;
      return false;
    } catch {
      break;
    }
  }
  return false;
}

export async function buildOverviewPayload(supabase: SupabaseClient): Promise<OverviewPayload> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const yesterdayStartMs = todayStartMs - dayMs;

  const [stores, devices, castOnline] = await Promise.all([
    withTimeoutFallback(loadOverviewStores(supabase), OVERVIEW_QUERY_TIMEOUT_MS, EMPTY_OVERVIEW_STORES),
    withTimeoutFallback(loadOverviewDevices(supabase), OVERVIEW_QUERY_TIMEOUT_MS, []),
    withTimeoutFallback(loadCastTvOnlinePublic(now), OVERVIEW_CAST_TV_TIMEOUT_MS, false)
  ]);

  const openIssues = stores.issues.filter((issue) => isOpenOpsStatus(issue.status));
  const openFollowUps = stores.followUps.filter((item) => isOpenOpsStatus(item.status));
  const overdueFollowUps = openFollowUps.filter(
    (item) => item.due_date && new Date(`${item.due_date}T23:59:59`).getTime() < now
  );
  const overdueIssues = openIssues.filter((item) => item.due_at && new Date(item.due_at).getTime() < now);
  const staffingIssues = openIssues.filter((issue) => issue.category === "Staff Issue");
  const criticalStaffing = staffingIssues.filter(
    (issue) => String(issue.priority).toLowerCase() === "urgent" || String(issue.priority).toLowerCase() === "high"
  );

  let supportRows: SupportInboxRow[] = [];
  try {
    supportRows = stores.reports.map(mapReportToInboxRow);
  } catch {
    supportRows = [];
  }
  const supportStats = computeSupportHubStats(supportRows);
  const openSupport = supportRows.filter(
    (row) => row.status !== "Closed" && row.status !== "Resolved"
  );
  const highSupport = openSupport.filter((row) => row.priority === "Urgent" || row.priority === "High");

  let hrReports: ManagementReport[] = [];
  try {
    hrReports = stores.reports.filter(isHrRecord);
  } catch {
    hrReports = [];
  }
  const hrRecords = hrReports.map(toHrRecord);
  const hrStats = buildHrHubStats(hrRecords);
  const openHr = hrRecords.filter((r) => !["Closed", "Resolved", "Reviewed"].includes(r.status));

  const activeNotices = stores.notices.filter((notice) => notice.is_active && !notice.cleared_at);

  const activePip = activePipPlans(stores.pipPlans);
  const pipDueWeek = pipReviewsDueThisWeek(stores.pipPlans);

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
    const seen = new Date(String(device.last_seen_at || "")).getTime();
    return Number.isFinite(seen) && now - seen <= 5 * 60 * 1000;
  });
  const totalDevices = Math.max(devices.length, castOnline || devices.length ? 1 : 0);
  const onlineCount = onlineDevices.length + (castOnline ? 1 : 0);
  const healthRatio = totalDevices ? onlineCount / (devices.length + 1) : castOnline ? 1 : 1;
  const boardHealthLabel = !devices.length && !castOnline
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
    [...stores.issues, ...stores.notices.map((n) => ({ created_at: n.pushed_at || n.created_at }))],
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
    [...stores.issues, ...stores.followUps],
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
    ...stores.activity.slice(0, 15).map((log: StaffActivityLog) => ({
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
    degraded: !stores.ok,
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
    board_notes: stores.boardNotes,
    board_health: {
      label: boardHealthLabel,
      detail: `Uptime ${uptimePct}%`,
      online_devices: onlineDevices.length,
      total_devices: devices.length,
      cast_tv_online: castOnline
    },
    system_health: toOverviewSystemHealth(stores.systemHealth)
  };
}

export function emptyOverviewPayload(): OverviewPayload {
  const zero = (key: string, label: string, tone: OverviewMetric["tone"], href_tab: string): OverviewMetric => ({
    key,
    label,
    value: 0,
    detail: "Temporarily unavailable",
    trend_label: "0 vs yesterday",
    trend_direction: "flat",
    tone,
    href_tab
  });
  return {
    generated_at: new Date().toISOString(),
    degraded: true,
    metrics: [
      zero("active_alerts", "Active Alerts", "red", "push_notices"),
      zero("hr_notifications", "HR Notifications", "orange", "hr_hub"),
      zero("pip", "Employees on PIP", "purple", "hr_pip"),
      zero("open_tasks", "Open Tasks", "blue", "active_issues"),
      zero("staffing", "Staffing Issues", "amber", "active_issues"),
      {
        key: "board_health",
        label: "Board Health",
        value: "Fair",
        detail: "Live snapshot delayed",
        trend_label: "Retry shortly",
        trend_direction: "flat",
        tone: "amber",
        href_tab: "display"
      }
    ],
    priorities: { urgent_count: 0, items: [] },
    alerts: [],
    hr_notifications: [],
    pip_plans: [],
    action_center: [],
    recent_activity: [],
    upcoming_reviews: [],
    board_notes: [],
    board_health: {
      label: "Fair",
      detail: "Live snapshot delayed",
      online_devices: 0,
      total_devices: 0,
      cast_tv_online: false
    },
    system_health: toOverviewSystemHealth(emptySystemHealthState())
  };
}
