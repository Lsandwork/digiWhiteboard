import { listStaffOps } from "@/lib/staff/admin-ops";
import { listAllManagementReports } from "@/lib/staff/management-reports";
import { formatWalkBoardHourLabel } from "@/lib/walks-board/schedule";
import {
  exclusiveEndOfPacificDayIso,
  formatPacificDate,
  formatPacificDateTime,
  pacificDateKeyFromInstant,
  REPORTS_TIMEZONE,
  startOfPacificDayIso
} from "./dates";
import { bumpCount, displayName, loginDayAndWeekRows, namedCounts } from "./group";
import { isMissingRelation } from "./parse";
import type {
  CareReportRow,
  ChecklistReportRow,
  OverviewTotals,
  PhotoReportRow,
  ReportKind,
  ReportRange,
  ReportsPayload,
  TeamLogReportRow,
  WalksReportRow
} from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

type RangeBounds = {
  from: string;
  to: string;
  fromIso: string;
  toExclusiveIso: string;
};

function inDateKeyRange(dateKey: string | null | undefined, range: RangeBounds) {
  if (!dateKey) return false;
  return dateKey >= range.from && dateKey <= range.to;
}

function inInstantRange(iso: string | null | undefined, range: RangeBounds) {
  if (!iso) return false;
  return iso >= range.fromIso && iso < range.toExclusiveIso;
}

async function loadUserLabels(supabase: SupabaseClient, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data, error } = await supabase.from("admin_users").select("id, full_name, email").in("id", unique);
  if (error && !isMissingRelation(error)) throw error;
  for (const row of data ?? []) {
    map.set(String(row.id), displayName(row.full_name, row.email, String(row.id)));
  }
  return map;
}

async function loadChecklist(supabase: SupabaseClient, range: RangeBounds): Promise<NonNullable<ReportsPayload["checklist"]>> {
  const { data, error } = await supabase
    .from("ops_checklist_completions")
    .select("item_key, source, shift_date, completed_at, completed_by, completed_by_name, undone_at, metadata")
    .gte("shift_date", range.from)
    .lte("shift_date", range.to)
    .is("undone_at", null)
    .order("completed_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (isMissingRelation(error)) {
      return { totalsByUser: [], totalsByDate: [], totalsBySource: [], rows: [] };
    }
    throw error;
  }
  const rows: ChecklistReportRow[] = (data ?? []).map((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    return {
      completedAt: String(row.completed_at ?? ""),
      shiftDate: String(row.shift_date ?? ""),
      userLabel: displayName(row.completed_by_name, null, "Staff"),
      source: String(row.source ?? "reminder"),
      title: String(metadata.title ?? row.item_key ?? "Checklist item"),
      itemKey: String(row.item_key ?? "")
    };
  });
  const byUser = new Map<string, number>();
  const byDate = new Map<string, number>();
  const bySource = new Map<string, number>();
  const userLabels = new Map<string, string>();
  const dateLabels = new Map<string, string>();
  for (const row of rows) {
    bumpCount(byUser, row.userLabel);
    bumpCount(byDate, row.shiftDate);
    bumpCount(bySource, row.source);
    userLabels.set(row.userLabel, row.userLabel);
    dateLabels.set(row.shiftDate, formatPacificDate(row.shiftDate));
  }
  return {
    totalsByUser: namedCounts(byUser, userLabels),
    totalsByDate: namedCounts(byDate, dateLabels),
    totalsBySource: namedCounts(bySource),
    rows
  };
}

async function loadPhotos(supabase: SupabaseClient, range: RangeBounds): Promise<NonNullable<ReportsPayload["photos"]>> {
  const { data, error } = await supabase
    .from("photo_upload_items")
    .select(
      "created_at, uploaded_by, uploaded_by_name, photographer_name, original_filename, category, yard, status, media_kind, photo_upload_batches(service_date, photographer_name, created_by_name)"
    )
    .gte("created_at", range.fromIso)
    .lt("created_at", range.toExclusiveIso)
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(4000);
  if (error) {
    if (isMissingRelation(error)) {
      return { totalsByUser: [], totalsByDate: [], rows: [] };
    }
    throw error;
  }
  const rows: PhotoReportRow[] = [];
  for (const row of data ?? []) {
    if (String(row.status ?? "") === "excluded") continue;
    if (String(row.media_kind ?? "photo") === "video") continue;
    const batch = Array.isArray(row.photo_upload_batches)
      ? row.photo_upload_batches[0]
      : row.photo_upload_batches;
    const batchRecord = batch && typeof batch === "object" ? (batch as Record<string, unknown>) : null;
    const serviceDate = batchRecord?.service_date ? String(batchRecord.service_date) : pacificDateKeyFromInstant(String(row.created_at));
    rows.push({
      createdAt: String(row.created_at ?? ""),
      serviceDate,
      userLabel: displayName(
        row.uploaded_by_name ?? row.photographer_name ?? (batchRecord?.created_by_name as string | undefined) ?? (batchRecord?.photographer_name as string | undefined),
        null,
        "Staff"
      ),
      filename: String(row.original_filename ?? "photo"),
      category: row.category ? String(row.category) : null,
      yard: row.yard ? String(row.yard) : null,
      status: String(row.status ?? "")
    });
  }
  const byUser = new Map<string, number>();
  const byDate = new Map<string, number>();
  const userLabels = new Map<string, string>();
  const dateLabels = new Map<string, string>();
  for (const row of rows) {
    const dateKey = row.serviceDate ?? pacificDateKeyFromInstant(row.createdAt);
    bumpCount(byUser, row.userLabel);
    bumpCount(byDate, dateKey);
    userLabels.set(row.userLabel, row.userLabel);
    dateLabels.set(dateKey, formatPacificDate(dateKey));
  }
  return {
    totalsByUser: namedCounts(byUser, userLabels),
    totalsByDate: namedCounts(byDate, dateLabels),
    rows
  };
}

async function loadLogins(supabase: SupabaseClient, range: RangeBounds): Promise<NonNullable<ReportsPayload["logins"]>> {
  let events: Array<{ userKey: string; userLabel: string; at: string }> = [];
  const loginQuery = await supabase
    .from("admin_login_events")
    .select("user_id, email, logged_in_at")
    .gte("logged_in_at", range.fromIso)
    .lt("logged_in_at", range.toExclusiveIso)
    .order("logged_in_at", { ascending: false })
    .limit(5000);

  if (loginQuery.error && !isMissingRelation(loginQuery.error)) throw loginQuery.error;

  if (!loginQuery.error) {
    const names = await loadUserLabels(
      supabase,
      (loginQuery.data ?? []).map((row) => row.user_id as string | null)
    );
    events = (loginQuery.data ?? []).map((row) => ({
      userKey: String(row.user_id ?? row.email ?? "unknown"),
      userLabel: names.get(String(row.user_id ?? "")) || displayName(null, row.email, "Staff"),
      at: String(row.logged_in_at ?? "")
    }));
  } else {
    const audit = await supabase
      .from("admin_audit_logs")
      .select("actor_admin_id, actor_email, created_at, action")
      .eq("action", "admin.login")
      .gte("created_at", range.fromIso)
      .lt("created_at", range.toExclusiveIso)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (audit.error && !isMissingRelation(audit.error)) throw audit.error;
    const names = await loadUserLabels(
      supabase,
      (audit.data ?? []).map((row) => row.actor_admin_id as string | null)
    );
    events = (audit.data ?? []).map((row) => ({
      userKey: String(row.actor_admin_id ?? row.actor_email ?? "unknown"),
      userLabel: names.get(String(row.actor_admin_id ?? "")) || displayName(null, row.actor_email, "Staff"),
      at: String(row.created_at ?? "")
    }));
  }

  const { byDay, byWeek } = loginDayAndWeekRows(events);
  const byUser = new Map<string, number>();
  const userLabels = new Map<string, string>();
  for (const event of events) {
    bumpCount(byUser, event.userKey);
    userLabels.set(event.userKey, event.userLabel);
  }

  const users = await supabase
    .from("admin_users")
    .select("full_name, email, last_login_at, status")
    .eq("status", "active")
    .order("full_name", { ascending: true })
    .limit(500);
  if (users.error && !isMissingRelation(users.error)) throw users.error;
  const lastLoginByUser = (users.data ?? []).map((row) => ({
    userLabel: displayName(row.full_name, row.email, "Staff"),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null
  }));

  return {
    byDay,
    byWeek,
    totalsByUser: namedCounts(byUser, userLabels),
    lastLoginByUser
  };
}

async function loadWalks(supabase: SupabaseClient, range: RangeBounds): Promise<NonNullable<ReportsPayload["walks"]>> {
  const { data, error } = await supabase
    .from("walk_board_cycles")
    .select("shift_date, scheduled_hour, status, completed_at, completed_by")
    .gte("shift_date", range.from)
    .lte("shift_date", range.to)
    .order("shift_date", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingRelation(error)) {
      return { totalsByUser: [], totalsByDate: [], rows: [] };
    }
    throw error;
  }
  const names = await loadUserLabels(
    supabase,
    (data ?? []).map((row) => row.completed_by as string | null)
  );
  const rows: WalksReportRow[] = (data ?? []).map((row) => ({
    shiftDate: String(row.shift_date ?? ""),
    hourLabel: formatWalkBoardHourLabel(Number(row.scheduled_hour ?? 0)),
    status: String(row.status ?? ""),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    userLabel: row.completed_by ? names.get(String(row.completed_by)) ?? "Staff" : "—"
  }));
  const completed = rows.filter((row) => row.status === "completed");
  const byUser = new Map<string, number>();
  const byDate = new Map<string, number>();
  const userLabels = new Map<string, string>();
  const dateLabels = new Map<string, string>();
  for (const row of completed) {
    bumpCount(byUser, row.userLabel);
    bumpCount(byDate, row.shiftDate);
    userLabels.set(row.userLabel, row.userLabel);
    dateLabels.set(row.shiftDate, formatPacificDate(row.shiftDate));
  }
  return {
    totalsByUser: namedCounts(byUser, userLabels),
    totalsByDate: namedCounts(byDate, dateLabels),
    rows
  };
}

function openStatus(status: string) {
  const value = status.toLowerCase();
  return !["resolved", "closed", "completed", "archived", "reviewed"].includes(value);
}

async function loadTeamLog(supabase: SupabaseClient, range: RangeBounds): Promise<NonNullable<ReportsPayload["teamLog"]>> {
  const ops = await listStaffOps(supabase);
  const rows: TeamLogReportRow[] = ops.crossover_messages
    .filter((row) => inInstantRange(row.created_at, range))
    .map((row) => ({
      createdAt: row.created_at,
      subject: row.subject,
      logType: row.log_type ?? "Shift note",
      userLabel: displayName(row.submitted_by ?? row.created_by, null, "Staff"),
      status: row.status,
      priority: row.priority
    }));
  const byUser = new Map<string, number>();
  const byType = new Map<string, number>();
  const userLabels = new Map<string, string>();
  for (const row of rows) {
    bumpCount(byUser, row.userLabel);
    bumpCount(byType, row.logType);
    userLabels.set(row.userLabel, row.userLabel);
  }
  return {
    totalsByUser: namedCounts(byUser, userLabels),
    totalsByType: namedCounts(byType),
    rows: rows.slice(0, 400)
  };
}

async function loadCare(supabase: SupabaseClient, range: RangeBounds): Promise<NonNullable<ReportsPayload["care"]>> {
  const [ops, support] = await Promise.all([listStaffOps(supabase), listAllManagementReports(supabase)]);
  const followUps: CareReportRow[] = ops.owner_follow_ups
    .filter((row) => inInstantRange(row.created_at, range))
    .map((row) => ({
      createdAt: row.created_at,
      kind: "Owner follow-up",
      title: `${row.subject}${row.owner_name ? ` · ${row.owner_name}` : ""}`,
      userLabel: displayName(row.logged_by, null, "Staff"),
      status: row.status
    }));
  const issues: CareReportRow[] = ops.active_issues
    .filter((row) => inInstantRange(row.created_at, range) || inInstantRange(row.reported_at, range))
    .map((row) => ({
      createdAt: row.created_at,
      kind: "Active issue",
      title: row.title,
      userLabel: displayName(row.reported_by, null, "Staff"),
      status: row.status
    }));
  const supportRows: CareReportRow[] = support
    .filter((row) => inInstantRange(row.created_at, range))
    .map((row) => ({
      createdAt: row.created_at,
      kind: row.report_type.replace(/_/g, " "),
      title: row.title,
      userLabel: displayName(row.submitted_by_name ?? row.created_by, null, "Staff"),
      status: row.admin_status ?? row.status
    }));
  const totals = new Map<string, number>();
  bumpCount(totals, "Owner follow-ups", followUps.length);
  bumpCount(totals, "Active issues", issues.length);
  bumpCount(totals, "Write-ups & support", supportRows.length);
  bumpCount(totals, "Open follow-ups", followUps.filter((row) => openStatus(row.status)).length);
  bumpCount(totals, "Open issues", issues.filter((row) => openStatus(row.status)).length);
  return {
    followUps: followUps.slice(0, 200),
    issues: issues.slice(0, 200),
    support: supportRows.slice(0, 200),
    totals: namedCounts(totals)
  };
}

async function loadOverview(supabase: SupabaseClient, range: RangeBounds): Promise<OverviewTotals> {
  const [checklist, photos, logins, walks, teamLog, care] = await Promise.all([
    loadChecklist(supabase, range),
    loadPhotos(supabase, range),
    loadLogins(supabase, range),
    loadWalks(supabase, range),
    loadTeamLog(supabase, range),
    loadCare(supabase, range)
  ]);
  return {
    checklistCompletions: checklist.rows.length,
    photosUploaded: photos.rows.length,
    logins: logins.totalsByUser.reduce((sum, row) => sum + row.count, 0),
    uniqueLogins: logins.totalsByUser.length,
    walksCompleted: walks.rows.filter((row) => row.status === "completed").length,
    teamLogEntries: teamLog.rows.length,
    openFollowUps: care.followUps.filter((row) => openStatus(row.status)).length,
    openIssues: care.issues.filter((row) => openStatus(row.status)).length,
    supportItems: care.support.length
  };
}

export async function loadReportsPayload(
  supabase: SupabaseClient,
  input: { kind: ReportKind; from: string; to: string }
): Promise<ReportsPayload> {
  const fromIso = startOfPacificDayIso(input.from);
  const toExclusiveIso = exclusiveEndOfPacificDayIso(input.to);
  if (!fromIso || !toExclusiveIso) {
    throw new Error("Invalid report date range.");
  }
  const rangeBounds: RangeBounds = {
    from: input.from,
    to: input.to,
    fromIso,
    toExclusiveIso
  };
  const range: ReportRange = { from: input.from, to: input.to, timezone: REPORTS_TIMEZONE };
  const generatedAt = new Date().toISOString();

  if (input.kind === "overview") {
    return { kind: "overview", range, generatedAt, overview: await loadOverview(supabase, rangeBounds) };
  }
  if (input.kind === "checklist") {
    return { kind: "checklist", range, generatedAt, checklist: await loadChecklist(supabase, rangeBounds) };
  }
  if (input.kind === "photos") {
    return { kind: "photos", range, generatedAt, photos: await loadPhotos(supabase, rangeBounds) };
  }
  if (input.kind === "logins") {
    return { kind: "logins", range, generatedAt, logins: await loadLogins(supabase, rangeBounds) };
  }
  if (input.kind === "walks") {
    return { kind: "walks", range, generatedAt, walks: await loadWalks(supabase, rangeBounds) };
  }
  if (input.kind === "team_log") {
    return { kind: "team_log", range, generatedAt, teamLog: await loadTeamLog(supabase, rangeBounds) };
  }
  return { kind: "care", range, generatedAt, care: await loadCare(supabase, rangeBounds) };
}

export { formatPacificDateTime };
