import type { SupabaseClient } from "@supabase/supabase-js";
import { getShiftDate } from "@/lib/staff/daily-reminders";
import { OPERATIONS_CHECKLIST_CATALOG } from "@/lib/operations-checklist/catalog";
import {
  canManageOperationsChecklist,
  checklistRolesForStaffRole,
  displayNameForUser
} from "@/lib/operations-checklist/roles";
import {
  OPERATIONS_CHECKLIST_ROLE_LABELS,
  OPERATIONS_CHECKLIST_STATUSES,
  type OperationsChecklistCompletionStats,
  type OperationsChecklistDayMeta,
  type OperationsChecklistEvent,
  type OperationsChecklistHeaderStats,
  type OperationsChecklistInstance,
  type OperationsChecklistItemView,
  type OperationsChecklistMyTaskBucket,
  type OperationsChecklistPayload,
  type OperationsChecklistPermissions,
  type OperationsChecklistRole,
  type OperationsChecklistSectionView,
  type OperationsChecklistStatus
} from "@/lib/operations-checklist/types";

export const OPERATIONS_CHECKLIST_TIMEZONE = "America/Los_Angeles";

type Actor = {
  userId: string;
  email: string;
  name: string;
  role: string | null;
};

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("operations_checklist"))
  );
}

function normalizeStatus(value: unknown): OperationsChecklistStatus {
  const raw = String(value ?? "not_started");
  return (OPERATIONS_CHECKLIST_STATUSES as readonly string[]).includes(raw)
    ? (raw as OperationsChecklistStatus)
    : "not_started";
}

function sanitizeText(value: unknown, max = 4000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function normalizeTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function zonedParts(now = new Date(), timeZone = OPERATIONS_CHECKLIST_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour") === "24" ? "0" : get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday")
  };
}

export function getOperationsShiftLabel(now = new Date()) {
  const { hour } = zonedParts(now);
  if (hour < 12) return "AM Shift";
  if (hour < 17) return "Midday / PM Shift";
  return "Closing / Overnight Shift";
}

function previousShiftDate(shiftDate: string) {
  const date = new Date(`${shiftDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dueMinutes(dueTime: string | null | undefined) {
  if (!dueTime) return null;
  const match = dueTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function rowToInstance(row: Record<string, unknown>): OperationsChecklistInstance {
  return {
    id: String(row.id),
    template_id: String(row.template_id),
    shift_date: String(row.shift_date),
    catalog_key: String(row.catalog_key),
    section_key: row.section_key as OperationsChecklistInstance["section_key"],
    section_label: String(row.section_label),
    section_sort: Number(row.section_sort ?? 0),
    title: String(row.title),
    assigned_role: row.assigned_role as OperationsChecklistRole,
    assigned_user_id: row.assigned_user_id ? String(row.assigned_user_id) : null,
    assigned_user_name: row.assigned_user_name != null ? String(row.assigned_user_name) : null,
    due_time: row.due_time != null ? String(row.due_time).slice(0, 8) : null,
    sort_order: Number(row.sort_order ?? 0),
    status: normalizeStatus(row.status),
    notes: row.notes != null ? String(row.notes) : null,
    problem_note: row.problem_note != null ? String(row.problem_note) : null,
    help_requested: Boolean(row.help_requested),
    requires_photo: Boolean(row.requires_photo),
    requires_management_approval: Boolean(row.requires_management_approval),
    photo_url: row.photo_url != null ? String(row.photo_url) : null,
    completed_by_user_id: row.completed_by_user_id ? String(row.completed_by_user_id) : null,
    completed_by_name: row.completed_by_name != null ? String(row.completed_by_name) : null,
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    started_by_user_id: row.started_by_user_id ? String(row.started_by_user_id) : null,
    started_by_name: row.started_by_name != null ? String(row.started_by_name) : null,
    started_at: row.started_at != null ? String(row.started_at) : null,
    returned_by_user_id: row.returned_by_user_id ? String(row.returned_by_user_id) : null,
    returned_by_name: row.returned_by_name != null ? String(row.returned_by_name) : null,
    returned_at: row.returned_at != null ? String(row.returned_at) : null,
    return_reason: row.return_reason != null ? String(row.return_reason) : null,
    pushed_to_staff_board: Boolean(row.pushed_to_staff_board),
    pushed_to_staff_board_at: row.pushed_to_staff_board_at != null ? String(row.pushed_to_staff_board_at) : null,
    acknowledgment_required: Boolean(row.acknowledgment_required),
    acknowledged_at: row.acknowledged_at != null ? String(row.acknowledged_at) : null,
    acknowledged_by_user_id: row.acknowledged_by_user_id ? String(row.acknowledged_by_user_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

async function syncTemplates(supabase: SupabaseClient) {
  const rows = OPERATIONS_CHECKLIST_CATALOG.map((seed) => ({
    catalog_key: seed.catalog_key,
    section_key: seed.section_key,
    section_label: seed.section_label,
    section_sort: seed.section_sort,
    title: seed.title,
    assigned_role: seed.assigned_role,
    due_time: seed.due_time,
    sort_order: seed.sort_order,
    is_recurring: seed.is_recurring,
    requires_photo: seed.requires_photo,
    requires_management_approval: seed.requires_management_approval,
    is_active: true,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase.from("operations_checklist_templates").upsert(rows, {
    onConflict: "catalog_key"
  });
  if (error) throw error;
}

async function ensureDayInstances(supabase: SupabaseClient, shiftDate: string) {
  await syncTemplates(supabase);

  const { data: existing, error: existingError } = await supabase
    .from("operations_checklist_instances")
    .select("id")
    .eq("shift_date", shiftDate)
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return;

  const { data: templates, error: templateError } = await supabase
    .from("operations_checklist_templates")
    .select("*")
    .eq("is_active", true)
    .eq("is_recurring", true);
  if (templateError) throw templateError;

  const inserts = (templates ?? []).map((template) => ({
    template_id: template.id,
    shift_date: shiftDate,
    catalog_key: template.catalog_key,
    section_key: template.section_key,
    section_label: template.section_label,
    section_sort: template.section_sort,
    title: template.title,
    assigned_role: template.assigned_role,
    due_time: template.due_time,
    sort_order: template.sort_order,
    status: "not_started",
    requires_photo: template.requires_photo,
    requires_management_approval: template.requires_management_approval
  }));

  if (!inserts.length) return;
  const { error: insertError } = await supabase.from("operations_checklist_instances").insert(inserts);
  if (insertError) throw insertError;
}

async function ensureDayMeta(supabase: SupabaseClient, shiftDate: string): Promise<OperationsChecklistDayMeta> {
  const previousDate = previousShiftDate(shiftDate);
  const [{ data: existing }, { data: previous }] = await Promise.all([
    supabase.from("operations_checklist_day_meta").select("*").eq("shift_date", shiftDate).maybeSingle(),
    supabase.from("operations_checklist_day_meta").select("crossover_notes").eq("shift_date", previousDate).maybeSingle()
  ]);

  if (existing) {
    return {
      shift_date: String(existing.shift_date),
      shift_label: String(existing.shift_label || getOperationsShiftLabel()),
      manager_on_duty_user_id: existing.manager_on_duty_user_id ? String(existing.manager_on_duty_user_id) : null,
      manager_on_duty_name: existing.manager_on_duty_name != null ? String(existing.manager_on_duty_name) : null,
      clocked_in_names: Array.isArray(existing.clocked_in_names)
        ? existing.clocked_in_names.map((name: unknown) => String(name))
        : [],
      crossover_notes: existing.crossover_notes != null ? String(existing.crossover_notes) : null,
      previous_crossover_notes:
        existing.previous_crossover_notes != null
          ? String(existing.previous_crossover_notes)
          : previous?.crossover_notes != null
            ? String(previous.crossover_notes)
            : null,
      updated_at: String(existing.updated_at),
      updated_by: existing.updated_by ? String(existing.updated_by) : null
    };
  }

  const insert = {
    shift_date: shiftDate,
    shift_label: getOperationsShiftLabel(),
    previous_crossover_notes: previous?.crossover_notes ?? null,
    clocked_in_names: [] as string[]
  };
  const { data, error } = await supabase.from("operations_checklist_day_meta").upsert(insert).select("*").single();
  if (error) throw error;
  return {
    shift_date: String(data.shift_date),
    shift_label: String(data.shift_label || getOperationsShiftLabel()),
    manager_on_duty_user_id: data.manager_on_duty_user_id ? String(data.manager_on_duty_user_id) : null,
    manager_on_duty_name: data.manager_on_duty_name != null ? String(data.manager_on_duty_name) : null,
    clocked_in_names: Array.isArray(data.clocked_in_names) ? data.clocked_in_names.map((name: unknown) => String(name)) : [],
    crossover_notes: data.crossover_notes != null ? String(data.crossover_notes) : null,
    previous_crossover_notes: data.previous_crossover_notes != null ? String(data.previous_crossover_notes) : null,
    updated_at: String(data.updated_at),
    updated_by: data.updated_by ? String(data.updated_by) : null
  };
}

async function loadOpenOpsCounts(supabase: SupabaseClient) {
  const counts = {
    open_alerts: 0,
    open_incidents: 0,
    open_vet_visits: 0,
    open_owner_follow_ups: 0
  };

  const [alerts, incidents, vetVisits, followUps] = await Promise.all([
    supabase
      .from("operations_alerts")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "acknowledged", "assigned", "owner_contacted", "awaiting_payment", "follow_up_scheduled", "reopened"]),
    supabase
      .from("track_incidents")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "in_progress", "follow_up_needed"]),
    supabase
      .from("vet_visits")
      .select("id", { count: "exact", head: true })
      .neq("management_status", "resolved"),
    supabase
      .from("owner_follow_ups")
      .select("id", { count: "exact", head: true })
      .not("status", "in", '("Resolved","Archived","Closed")')
  ]);

  if (!alerts.error && typeof alerts.count === "number") counts.open_alerts = alerts.count;
  if (!incidents.error && typeof incidents.count === "number") counts.open_incidents = incidents.count;
  if (!vetVisits.error && typeof vetVisits.count === "number") counts.open_vet_visits = vetVisits.count;
  if (!followUps.error && typeof followUps.count === "number") counts.open_owner_follow_ups = followUps.count;

  return counts;
}

function decorateItems(
  instances: OperationsChecklistInstance[],
  actor: Actor,
  now = new Date()
): OperationsChecklistItemView[] {
  const roleMatches = new Set(checklistRolesForStaffRole(actor.role));
  const { hour, minute } = zonedParts(now);
  const nowMinutes = hour * 60 + minute;

  return instances.map((item) => {
    const due = dueMinutes(item.due_time);
    const open =
      item.status !== "completed" && item.status !== "not_applicable";
    const overdue = Boolean(open && due != null && due < nowMinutes);
    const dueSoon = Boolean(open && due != null && due >= nowMinutes && due - nowMinutes <= 60);
    const buckets: OperationsChecklistMyTaskBucket[] = [];

    if (item.assigned_user_id && item.assigned_user_id === actor.userId && open) {
      buckets.push("assigned_to_me");
    }
    if (roleMatches.has(item.assigned_role) && open && !item.assigned_user_id) {
      buckets.push("assigned_to_role");
    }
    if (dueSoon) buckets.push("due_soon");
    if (overdue) buckets.push("overdue");
    if (item.returned_at && open) buckets.push("returned");
    if (item.acknowledgment_required && !item.acknowledged_at) buckets.push("needs_ack");

    return {
      ...item,
      role_match: roleMatches.has(item.assigned_role) || item.assigned_user_id === actor.userId,
      overdue,
      due_soon: dueSoon,
      my_task_buckets: buckets
    };
  });
}

function sortMyTasks(items: OperationsChecklistItemView[]) {
  const rank = (item: OperationsChecklistItemView) => {
    if (item.my_task_buckets.includes("needs_ack")) return 0;
    if (item.my_task_buckets.includes("overdue")) return 1;
    if (item.my_task_buckets.includes("returned")) return 2;
    if (item.my_task_buckets.includes("due_soon")) return 3;
    if (item.my_task_buckets.includes("assigned_to_me")) return 4;
    if (item.my_task_buckets.includes("assigned_to_role")) return 5;
    return 9;
  };
  return [...items].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const dueA = dueMinutes(a.due_time) ?? 9999;
    const dueB = dueMinutes(b.due_time) ?? 9999;
    if (dueA !== dueB) return dueA - dueB;
    return a.sort_order - b.sort_order;
  });
}

function buildSections(items: OperationsChecklistItemView[]): OperationsChecklistSectionView[] {
  const map = new Map<string, OperationsChecklistSectionView>();
  for (const item of items) {
    const existing = map.get(item.section_key);
    if (!existing) {
      map.set(item.section_key, {
        section_key: item.section_key,
        section_label: item.section_label,
        section_sort: item.section_sort,
        completion_percent: 0,
        items: [item]
      });
    } else {
      existing.items.push(item);
    }
  }

  return [...map.values()]
    .map((section) => {
      const sorted = [...section.items].sort((a, b) => {
        if (a.role_match !== b.role_match) return a.role_match ? -1 : 1;
        return a.sort_order - b.sort_order;
      });
      const actionable = sorted.filter((item) => item.status !== "not_applicable");
      const completed = actionable.filter((item) => item.status === "completed").length;
      const percent = actionable.length ? Math.round((completed / actionable.length) * 100) : 100;
      return { ...section, items: sorted, completion_percent: percent };
    })
    .sort((a, b) => a.section_sort - b.section_sort);
}

function buildCompletionStats(items: OperationsChecklistItemView[]): OperationsChecklistCompletionStats {
  const byEmployee = new Map<string, { name: string; completed: number; total: number }>();
  for (const item of items) {
    if (!item.completed_by_name) continue;
    const key = item.completed_by_name;
    const current = byEmployee.get(key) ?? { name: key, completed: 0, total: 0 };
    current.total += 1;
    if (item.status === "completed") current.completed += 1;
    byEmployee.set(key, current);
  }

  const byRole = (Object.keys(OPERATIONS_CHECKLIST_ROLE_LABELS) as OperationsChecklistRole[]).map((role) => {
    const roleItems = items.filter((item) => item.assigned_role === role && item.status !== "not_applicable");
    return {
      role,
      label: OPERATIONS_CHECKLIST_ROLE_LABELS[role],
      completed: roleItems.filter((item) => item.status === "completed").length,
      total: roleItems.length
    };
  }).filter((row) => row.total > 0);

  const failureMap = new Map<string, { catalog_key: string; title: string; failure_count: number }>();
  for (const item of items) {
    if (item.status === "needs_attention" || item.status === "blocked" || item.returned_at) {
      const current = failureMap.get(item.catalog_key) ?? {
        catalog_key: item.catalog_key,
        title: item.title,
        failure_count: 0
      };
      current.failure_count += 1;
      failureMap.set(item.catalog_key, current);
    }
  }

  return {
    by_employee: [...byEmployee.values()].sort((a, b) => b.completed - a.completed),
    by_role: byRole,
    missed: items.filter((item) => item.status === "not_started" && item.overdue),
    overdue: items.filter((item) => item.overdue),
    returned: items.filter((item) => Boolean(item.returned_at) && item.status !== "completed"),
    recurring_failures: [...failureMap.values()].sort((a, b) => b.failure_count - a.failure_count)
  };
}

export function resolveOperationsChecklistPermissions(legacyRole?: string | null): OperationsChecklistPermissions {
  const canManage = canManageOperationsChecklist(legacyRole);
  return {
    canView: true,
    canUpdateTasks: true,
    canManage,
    canExport: canManage
  };
}

async function appendEvent(
  supabase: SupabaseClient,
  input: {
    instanceId: string;
    shiftDate: string;
    action: string;
    actor: Actor;
    fromStatus?: OperationsChecklistStatus | null;
    toStatus?: OperationsChecklistStatus | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("operations_checklist_events").insert({
    instance_id: input.instanceId,
    shift_date: input.shiftDate,
    action: input.action,
    actor_user_id: input.actor.userId,
    actor_name: input.actor.name,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    note: input.note ?? null,
    metadata: input.metadata ?? {}
  });
  if (error) throw error;
}

export async function loadOperationsChecklistPayload(
  supabase: SupabaseClient,
  actor: Actor,
  options?: { shiftDate?: string }
): Promise<OperationsChecklistPayload> {
  const shiftDate = options?.shiftDate || getShiftDate(OPERATIONS_CHECKLIST_TIMEZONE);
  try {
    await ensureDayInstances(supabase, shiftDate);
  } catch (error) {
    if (!isMissingRelation(error as { code?: string; message?: string })) throw error;
    throw new Error("Operations Checklist tables are not installed yet. Run migration 044_operations_checklist.sql.");
  }

  const [dayMeta, instanceResult, openCounts, usersResult] = await Promise.all([
    ensureDayMeta(supabase, shiftDate),
    supabase
      .from("operations_checklist_instances")
      .select("*")
      .eq("shift_date", shiftDate)
      .order("section_sort", { ascending: true })
      .order("sort_order", { ascending: true }),
    loadOpenOpsCounts(supabase),
    supabase
      .from("admin_users")
      .select("id, email, full_name, role, status")
      .eq("status", "active")
      .order("full_name", { ascending: true })
  ]);

  if (instanceResult.error) throw instanceResult.error;

  const instances = (instanceResult.data ?? []).map((row) => rowToInstance(row as Record<string, unknown>));
  const decorated = decorateItems(instances, actor);
  const sections = buildSections(decorated);
  const myTasks = sortMyTasks(decorated.filter((item) => item.my_task_buckets.length > 0));
  const permissions = resolveOperationsChecklistPermissions(actor.role);

  const actionable = decorated.filter((item) => item.status !== "not_applicable");
  const completedCount = actionable.filter((item) => item.status === "completed").length;
  const totalCount = actionable.length;
  const completionPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 100;

  const currentDateLabel = new Date().toLocaleDateString("en-US", {
    timeZone: OPERATIONS_CHECKLIST_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  const header: OperationsChecklistHeaderStats = {
    shift_date: shiftDate,
    shift_label: dayMeta.shift_label || getOperationsShiftLabel(),
    current_date_label: currentDateLabel,
    manager_on_duty: dayMeta.manager_on_duty_name,
    clocked_in: dayMeta.clocked_in_names,
    completion_percent: completionPercent,
    completed_count: completedCount,
    total_count: totalCount,
    open_alerts: openCounts.open_alerts,
    open_incidents: openCounts.open_incidents,
    open_vet_visits: openCounts.open_vet_visits,
    open_owner_follow_ups: openCounts.open_owner_follow_ups,
    previous_crossover_notes: dayMeta.previous_crossover_notes
  };

  const assignableUsers = (usersResult.data ?? []).map((user) => ({
    id: String(user.id),
    name: displayNameForUser(user),
    email: String(user.email ?? ""),
    role: String(user.role ?? "")
  }));

  return {
    header,
    day_meta: dayMeta,
    my_tasks: myTasks,
    sections,
    permissions,
    assignable_users: assignableUsers,
    completion_stats: permissions.canManage ? buildCompletionStats(decorated) : null,
    timezone: OPERATIONS_CHECKLIST_TIMEZONE,
    server_time: new Date().toISOString()
  };
}

export async function listInstanceEvents(supabase: SupabaseClient, instanceId: string): Promise<OperationsChecklistEvent[]> {
  const { data, error } = await supabase
    .from("operations_checklist_events")
    .select("*")
    .eq("instance_id", instanceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    instance_id: String(row.instance_id),
    shift_date: String(row.shift_date),
    action: String(row.action),
    actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
    actor_name: row.actor_name != null ? String(row.actor_name) : null,
    from_status: row.from_status ? normalizeStatus(row.from_status) : null,
    to_status: row.to_status ? normalizeStatus(row.to_status) : null,
    note: row.note != null ? String(row.note) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: String(row.created_at)
  }));
}

async function getInstance(supabase: SupabaseClient, instanceId: string) {
  const { data, error } = await supabase
    .from("operations_checklist_instances")
    .select("*")
    .eq("id", instanceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Checklist task not found.");
  return rowToInstance(data as Record<string, unknown>);
}

export async function applyOperationsChecklistAction(
  supabase: SupabaseClient,
  actor: Actor,
  body: Record<string, unknown>
) {
  const action = String(body.action ?? "").trim();
  const permissions = resolveOperationsChecklistPermissions(actor.role);

  if (action === "update_day_meta") {
    if (!permissions.canManage) throw new Error("Management access required.");
    const shiftDate = String(body.shift_date ?? getShiftDate(OPERATIONS_CHECKLIST_TIMEZONE));
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: actor.userId
    };
    if (body.manager_on_duty_name !== undefined) {
      patch.manager_on_duty_name = sanitizeText(body.manager_on_duty_name, 120) || null;
    }
    if (body.manager_on_duty_user_id !== undefined) {
      patch.manager_on_duty_user_id = body.manager_on_duty_user_id ? String(body.manager_on_duty_user_id) : null;
    }
    if (body.clocked_in_names !== undefined) {
      const names = Array.isArray(body.clocked_in_names)
        ? body.clocked_in_names.map((name) => sanitizeText(name, 80)).filter(Boolean)
        : String(body.clocked_in_names ?? "")
            .split(",")
            .map((name) => sanitizeText(name, 80))
            .filter(Boolean);
      patch.clocked_in_names = names;
    }
    if (body.crossover_notes !== undefined) {
      patch.crossover_notes = sanitizeText(body.crossover_notes, 8000) || null;
    }
    if (body.shift_label !== undefined) {
      patch.shift_label = sanitizeText(body.shift_label, 80) || getOperationsShiftLabel();
    }
    const { error } = await supabase.from("operations_checklist_day_meta").upsert({
      shift_date: shiftDate,
      ...patch
    });
    if (error) throw error;
    return { ok: true };
  }

  if (action === "create_recurring_task") {
    if (!permissions.canManage) throw new Error("Management access required.");
    const title = sanitizeText(body.title, 240);
    if (!title) throw new Error("Task title is required.");
    const sectionKey = String(body.section_key ?? "midday_operations");
    const assignedRole = String(body.assigned_role ?? "all_staff") as OperationsChecklistRole;
    const dueTime = normalizeTime(body.due_time);
    const catalogKey = `custom__${Date.now()}__${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
    const sectionLabel = sanitizeText(body.section_label, 120) || "Custom Tasks";
    const sectionSort = Number(body.section_sort ?? 50);
    const templateRow = {
      catalog_key: catalogKey,
      section_key: sectionKey,
      section_label: sectionLabel,
      section_sort: sectionSort,
      title,
      assigned_role: assignedRole,
      due_time: dueTime,
      sort_order: Number(body.sort_order ?? sectionSort * 100 + 99),
      is_recurring: true,
      requires_photo: Boolean(body.requires_photo),
      requires_management_approval: Boolean(body.requires_management_approval),
      is_active: true
    };
    const { data: template, error } = await supabase
      .from("operations_checklist_templates")
      .insert(templateRow)
      .select("*")
      .single();
    if (error) throw error;

    const shiftDate = String(body.shift_date ?? getShiftDate(OPERATIONS_CHECKLIST_TIMEZONE));
    const { data: instance, error: instanceError } = await supabase
      .from("operations_checklist_instances")
      .insert({
        template_id: template.id,
        shift_date: shiftDate,
        catalog_key: template.catalog_key,
        section_key: template.section_key,
        section_label: template.section_label,
        section_sort: template.section_sort,
        title: template.title,
        assigned_role: template.assigned_role,
        due_time: template.due_time,
        sort_order: template.sort_order,
        status: "not_started",
        requires_photo: template.requires_photo,
        requires_management_approval: template.requires_management_approval
      })
      .select("*")
      .single();
    if (instanceError) throw instanceError;
    await appendEvent(supabase, {
      instanceId: String(instance.id),
      shiftDate,
      action: "create_recurring_task",
      actor,
      toStatus: "not_started",
      note: title
    });
    return { ok: true, instance: rowToInstance(instance as Record<string, unknown>) };
  }

  const instanceId = String(body.instance_id ?? "").trim();
  if (!instanceId) throw new Error("instance_id is required.");
  const current = await getInstance(supabase, instanceId);
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: nowIso };
  let toStatus: OperationsChecklistStatus | null = null;
  let note: string | null = sanitizeText(body.note, 4000) || null;
  let eventAction = action;

  switch (action) {
    case "start_task":
      patch.status = "in_progress";
      patch.started_at = current.started_at ?? nowIso;
      patch.started_by_user_id = current.started_by_user_id ?? actor.userId;
      patch.started_by_name = current.started_by_name ?? actor.name;
      toStatus = "in_progress";
      break;
    case "complete_task":
      if (current.requires_photo && !current.photo_url && !body.photo_url) {
        throw new Error("This task requires a photo or documentation URL before completion.");
      }
      if (current.requires_management_approval && !permissions.canManage) {
        patch.status = "needs_attention";
        patch.acknowledgment_required = true;
        toStatus = "needs_attention";
        note = note || "Completed by staff — awaiting management approval.";
        eventAction = "complete_pending_approval";
      } else {
        patch.status = "completed";
        patch.completed_at = nowIso;
        patch.completed_by_user_id = actor.userId;
        patch.completed_by_name = actor.name;
        patch.returned_at = null;
        patch.returned_by_user_id = null;
        patch.returned_by_name = null;
        patch.return_reason = null;
        toStatus = "completed";
      }
      if (body.photo_url) patch.photo_url = sanitizeText(body.photo_url, 2000);
      if (note) patch.notes = [current.notes, note].filter(Boolean).join("\n");
      break;
    case "add_note":
      if (!note) throw new Error("Note is required.");
      patch.notes = [current.notes, `${actor.name}: ${note}`].filter(Boolean).join("\n");
      break;
    case "report_problem":
      if (!note) throw new Error("Describe the problem.");
      patch.status = "needs_attention";
      patch.problem_note = note;
      patch.notes = [current.notes, `Problem (${actor.name}): ${note}`].filter(Boolean).join("\n");
      toStatus = "needs_attention";
      break;
    case "request_help":
      patch.help_requested = true;
      patch.status = current.status === "completed" ? current.status : "needs_attention";
      patch.acknowledgment_required = true;
      if (note) patch.notes = [current.notes, `Help requested (${actor.name}): ${note}`].filter(Boolean).join("\n");
      toStatus = normalizeStatus(patch.status);
      break;
    case "mark_not_applicable":
      patch.status = "not_applicable";
      patch.completed_at = nowIso;
      patch.completed_by_user_id = actor.userId;
      patch.completed_by_name = actor.name;
      if (note) patch.notes = [current.notes, note].filter(Boolean).join("\n");
      toStatus = "not_applicable";
      break;
    case "acknowledge_alert":
      patch.acknowledged_at = nowIso;
      patch.acknowledged_by_user_id = actor.userId;
      patch.acknowledgment_required = false;
      break;
    case "assign_task":
    case "reassign_task": {
      if (!permissions.canManage) throw new Error("Management access required.");
      const assignedUserId = body.assigned_user_id ? String(body.assigned_user_id) : null;
      let assignedName = sanitizeText(body.assigned_user_name, 120) || null;
      if (assignedUserId) {
        const { data: user } = await supabase
          .from("admin_users")
          .select("id, full_name, email")
          .eq("id", assignedUserId)
          .maybeSingle();
        if (user) assignedName = displayNameForUser(user);
      }
      patch.assigned_user_id = assignedUserId;
      patch.assigned_user_name = assignedName;
      if (body.assigned_role) patch.assigned_role = String(body.assigned_role);
      break;
    }
    case "set_due_time":
      if (!permissions.canManage) throw new Error("Management access required.");
      patch.due_time = normalizeTime(body.due_time);
      break;
    case "set_requirements":
      if (!permissions.canManage) throw new Error("Management access required.");
      if (body.requires_photo !== undefined) patch.requires_photo = Boolean(body.requires_photo);
      if (body.requires_management_approval !== undefined) {
        patch.requires_management_approval = Boolean(body.requires_management_approval);
      }
      break;
    case "return_task":
      if (!permissions.canManage) throw new Error("Management access required.");
      patch.status = "needs_attention";
      patch.returned_at = nowIso;
      patch.returned_by_user_id = actor.userId;
      patch.returned_by_name = actor.name;
      patch.return_reason = note || "Returned by management — please complete.";
      patch.completed_at = null;
      patch.completed_by_user_id = null;
      patch.completed_by_name = null;
      patch.acknowledgment_required = true;
      toStatus = "needs_attention";
      break;
    case "set_status": {
      if (!permissions.canManage) throw new Error("Management access required.");
      const next = normalizeStatus(body.status);
      patch.status = next;
      toStatus = next;
      if (next === "completed") {
        patch.completed_at = nowIso;
        patch.completed_by_user_id = actor.userId;
        patch.completed_by_name = actor.name;
      }
      break;
    }
    case "push_to_staff_board": {
      if (!permissions.canManage) throw new Error("Management access required.");
      patch.pushed_to_staff_board = true;
      patch.pushed_to_staff_board_at = nowIso;
      patch.acknowledgment_required = true;
      const message = sanitizeText(body.message, 500) || `Urgent checklist task: ${current.title}`;
      // Best-effort staff board push via staff settings important notice.
      await supabase
        .from("staff_board_settings")
        .update({
          important_notice: message,
          show_team_reminders: true,
          updated_at: nowIso
        })
        .eq("id", "default");
      note = message;
      break;
    }
    default:
      throw new Error(`Unsupported action: ${action}`);
  }

  const { data: updated, error } = await supabase
    .from("operations_checklist_instances")
    .update(patch)
    .eq("id", instanceId)
    .select("*")
    .single();
  if (error) throw error;

  await appendEvent(supabase, {
    instanceId,
    shiftDate: current.shift_date,
    action: eventAction,
    actor,
    fromStatus: current.status,
    toStatus,
    note,
    metadata: { patch }
  });

  return { ok: true, instance: rowToInstance(updated as Record<string, unknown>) };
}

export function buildOperationsChecklistCsv(items: OperationsChecklistInstance[]) {
  const header = [
    "Shift Date",
    "Section",
    "Task",
    "Assigned Role",
    "Assigned User",
    "Due Time",
    "Status",
    "Completed By",
    "Time Completed",
    "Notes",
    "Problem Note"
  ];
  const lines = [header.join(",")];
  for (const item of items) {
    const cells = [
      item.shift_date,
      item.section_label,
      item.title,
      OPERATIONS_CHECKLIST_ROLE_LABELS[item.assigned_role],
      item.assigned_user_name ?? "",
      item.due_time ?? "",
      item.status,
      item.completed_by_name ?? "",
      item.completed_at ?? "",
      item.notes ?? "",
      item.problem_note ?? ""
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export async function exportOperationsChecklist(
  supabase: SupabaseClient,
  options?: { shiftDate?: string; range?: "day" | "week" }
) {
  const shiftDate = options?.shiftDate || getShiftDate(OPERATIONS_CHECKLIST_TIMEZONE);
  let query = supabase.from("operations_checklist_instances").select("*").order("shift_date").order("sort_order");
  if (options?.range === "week") {
    const end = new Date(`${shiftDate}T12:00:00.000Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    query = query.gte("shift_date", start.toISOString().slice(0, 10)).lte("shift_date", shiftDate);
  } else {
    query = query.eq("shift_date", shiftDate);
  }
  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []).map((row) => rowToInstance(row as Record<string, unknown>));
  return buildOperationsChecklistCsv(items);
}
