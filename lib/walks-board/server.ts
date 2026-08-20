import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getUserAccess } from "@/lib/admin/user-access";
import { accessFromLegacyRole, hasPermission, type UserAccess } from "@/lib/admin/permissions";
import {
  WALK_BOARD_ALARM_CHECKLIST,
  WALK_BOARD_ALARM_MESSAGE,
  WALK_BOARD_ALARM_TITLE,
  WALK_BOARD_TIMEZONE
} from "./constants";
import {
  currentWalkBoardAlarmHour,
  currentWalkBoardSlotKey,
  isWalkBoardOperatingWindow,
  nextWalkBoardAlarmAt,
  walkBoardClockParts,
  walkBoardSlotEndAt,
  walkBoardSlotKey
} from "./schedule";
import type {
  WalkBoardActivityRow,
  WalkBoardActivityView,
  WalkBoardCycleRow,
  WalkBoardCycleView,
  WalkBoardPublicState,
  WalkBoardSummary,
  WalkBoardUserRef
} from "./types";
import { getWalkBoardUrgency, summarizeWalkBoardCycles } from "./display";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function nowIso() {
  return new Date().toISOString();
}

function isMissingWalkBoardRelation(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("walk_board"))
  );
}

async function loadUserRefs(
  supabase: SupabaseClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, WalkBoardUserRef>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map();

  const { data, error } = await supabase.from("admin_users").select("id, email, full_name").in("id", unique);
  if (error) throw error;

  const map = new Map<string, WalkBoardUserRef>();
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      email: row.email ?? null,
      display_name: row.full_name ?? null
    });
  }
  return map;
}

function decorateCycle(row: WalkBoardCycleRow, users: Map<string, WalkBoardUserRef>): WalkBoardCycleView {
  return {
    ...row,
    completed_by_user: row.completed_by ? users.get(row.completed_by) ?? null : null
  };
}

async function insertActivity(
  supabase: SupabaseClient,
  input: {
    walkCycleId: string;
    action: WalkBoardActivityRow["action"];
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("walk_board_activity").insert({
    walk_cycle_id: input.walkCycleId,
    action: input.action,
    actor_user_id: input.actorUserId ?? null,
    occurred_at: nowIso(),
    metadata: input.metadata ?? {}
  });
  if (error && !isMissingWalkBoardRelation(error)) throw error;
}

export function canReceiveWalkBoardReminders(access: UserAccess | null | undefined): boolean {
  return hasPermission(access, "receive_walks_board_reminders");
}

export function canCompleteWalkBoard(access: UserAccess | null | undefined): boolean {
  return Boolean(access) && hasPermission(access, "view_admin_panel");
}

/** @deprecated Snooze is not allowed on the physical whiteboard alarm. */
export function canSnoozeWalkBoard(_access: UserAccess | null | undefined): boolean {
  return false;
}

export async function listWalkBoardCyclesForDate(
  supabase: SupabaseClient,
  shiftDate: string
): Promise<WalkBoardCycleView[]> {
  const { data, error } = await supabase
    .from("walk_board_cycles")
    .select("*")
    .eq("shift_date", shiftDate)
    .order("scheduled_hour", { ascending: true });
  if (error) {
    if (isMissingWalkBoardRelation(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as WalkBoardCycleRow[];
  const users = await loadUserRefs(
    supabase,
    rows.map((row) => row.completed_by)
  );
  return rows.map((row) => decorateCycle(row, users));
}

export async function listWalkBoardActivity(
  supabase: SupabaseClient,
  walkCycleId: string
): Promise<WalkBoardActivityView[]> {
  const { data, error } = await supabase
    .from("walk_board_activity")
    .select("*")
    .eq("walk_cycle_id", walkCycleId)
    .order("occurred_at", { ascending: false });
  if (error) {
    if (isMissingWalkBoardRelation(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as WalkBoardActivityRow[];
  const users = await loadUserRefs(
    supabase,
    rows.map((row) => row.actor_user_id)
  );
  return rows.map((row) => ({
    ...row,
    actor_user: row.actor_user_id ? users.get(row.actor_user_id) ?? null : null
  }));
}

export async function ensureCurrentWalkBoardCycle(
  supabase: SupabaseClient,
  now = new Date()
): Promise<WalkBoardCycleRow | null> {
  const hour = currentWalkBoardAlarmHour(now);
  const slotKey = currentWalkBoardSlotKey(now);
  if (hour == null || !slotKey) return null;

  const parts = walkBoardClockParts(now);
  const dueAt = new Date(now);
  dueAt.setTime(now.getTime());

  const { data: existing, error: loadError } = await supabase
    .from("walk_board_cycles")
    .select("*")
    .eq("slot_key", slotKey)
    .maybeSingle();
  if (loadError && !isMissingWalkBoardRelation(loadError)) throw loadError;
  if (existing) return existing as WalkBoardCycleRow;

  const { data, error } = await supabase
    .from("walk_board_cycles")
    .insert({
      slot_key: slotKey,
      shift_date: parts.dateKey,
      scheduled_hour: hour,
      status: "pending",
      due_at: now.toISOString()
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await supabase.from("walk_board_cycles").select("*").eq("slot_key", slotKey).maybeSingle();
      return (raced as WalkBoardCycleRow | null) ?? null;
    }
    if (isMissingWalkBoardRelation(error)) return null;
    throw error;
  }

  const cycle = data as WalkBoardCycleRow;
  await insertActivity(supabase, {
    walkCycleId: cycle.id,
    action: "alarm_due",
    metadata: { slot_key: slotKey, automated: true }
  });
  return cycle;
}

export async function closeExpiredWalkBoardCycles(supabase: SupabaseClient, now = new Date()) {
  const dateKey = walkBoardClockParts(now).dateKey;
  const { data, error } = await supabase
    .from("walk_board_cycles")
    .select("id, slot_key, version")
    .eq("status", "pending")
    .lte("shift_date", dateKey);
  if (error) {
    if (isMissingWalkBoardRelation(error)) return 0;
    throw error;
  }

  const expired = ((data ?? []) as Array<Pick<WalkBoardCycleRow, "id" | "slot_key" | "version">>).filter(
    (row) => now.getTime() >= walkBoardSlotEndAt(row.slot_key).getTime()
  );
  if (!expired.length) return 0;

  const missedAt = nowIso();
  const results = await Promise.all(
    expired.map((row) =>
      supabase
        .from("walk_board_cycles")
        .update({
          status: "missed",
          missed_at: missedAt,
          version: row.version + 1
        })
        .eq("id", row.id)
        .eq("status", "pending")
        .eq("version", row.version)
    )
  );
  for (const result of results) {
    if (result.error && !isMissingWalkBoardRelation(result.error)) throw result.error;
  }

  const closed = expired.filter((_, index) => !results[index]?.error);
  if (closed.length) {
    const { error: activityError } = await supabase.from("walk_board_activity").insert(
      closed.map((row) => ({
        walk_cycle_id: row.id,
        action: "missed",
        actor_user_id: null,
        occurred_at: missedAt,
        metadata: { slot_key: row.slot_key }
      }))
    );
    if (activityError && !isMissingWalkBoardRelation(activityError)) throw activityError;
  }
  return closed.length;
}

export async function markWalkBoardCycleComplete(
  supabase: SupabaseClient,
  input: {
    cycleId: string;
    actorUserId: string | null;
    actorEmail?: string | null;
    access: UserAccess;
    expectedVersion?: number;
  }
): Promise<WalkBoardCycleView> {
  if (!canCompleteWalkBoard(input.access)) {
    throw new Error("You do not have permission to complete this Walks Board alarm.");
  }

  const { data: current, error: loadError } = await supabase
    .from("walk_board_cycles")
    .select("*")
    .eq("id", input.cycleId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw new Error("This Walks Board alarm is no longer available.");

  const row = current as WalkBoardCycleRow;
  if (row.status === "completed") {
    const users = await loadUserRefs(supabase, [row.completed_by]);
    return decorateCycle(row, users);
  }
  if (row.status !== "pending") {
    throw new Error("This Walks Board alarm can no longer be marked complete.");
  }
  if (input.expectedVersion != null && row.version !== input.expectedVersion) {
    throw new Error("This alarm was updated by someone else. Refresh and try again.");
  }

  const completedAt = nowIso();
  const { data, error } = await supabase
    .from("walk_board_cycles")
    .update({
      status: "completed",
      completed_at: completedAt,
      completed_by: input.actorUserId,
      version: row.version + 1
    })
    .eq("id", input.cycleId)
    .eq("status", "pending")
    .eq("version", row.version)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This alarm was updated by someone else. Refresh and try again.");

  const cycle = data as WalkBoardCycleRow;
  await insertActivity(supabase, {
    walkCycleId: cycle.id,
    action: "completed",
    actorUserId: input.actorUserId,
    metadata: { slot_key: cycle.slot_key }
  });
  await writeAdminAuditLog({
    actorAdminId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    action: "walks_board.completed",
    targetType: "walk_board_cycle",
    targetId: cycle.id,
    details: { slot_key: cycle.slot_key }
  });

  const users = await loadUserRefs(supabase, [cycle.completed_by]);
  return decorateCycle(cycle, users);
}

export async function resolveWalkBoardPermissions(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  legacyRole?: string | null,
  email?: string | null,
  access?: UserAccess | null
) {
  const resolved =
    access ??
    (userId || email || legacyRole
      ? await getUserAccess(supabase, userId, legacyRole, email)
      : accessFromLegacyRole(userId ?? null, email ?? null, legacyRole));
  return {
    canComplete: canCompleteWalkBoard(resolved),
    canReceiveReminders: canReceiveWalkBoardReminders(resolved),
    canSnooze: false
  };
}

type LoadWalkBoardPublicStateOptions = {
  userId?: string | null;
  legacyRole?: string | null;
  email?: string | null;
  now?: Date;
  access?: UserAccess | null;
  /** Close missed slots before reading. Skip on high-frequency polls. */
  closeExpired?: boolean;
  /** Resolve canComplete / reminder permissions. Skip when the caller only needs cycles. */
  includePermissions?: boolean;
};

export async function loadWalkBoardPublicState(
  supabase: SupabaseClient,
  options?: LoadWalkBoardPublicStateOptions
): Promise<WalkBoardPublicState> {
  const now = options?.now ?? new Date();
  const closeExpired = options?.closeExpired !== false;
  const includePermissions = options?.includePermissions !== false;

  const permissionsWork = includePermissions
    ? resolveWalkBoardPermissions(supabase, options?.userId, options?.legacyRole, options?.email, options?.access)
    : Promise.resolve({ canComplete: false, canReceiveReminders: false, canSnooze: false });

  const cyclesWork = (async () => {
    if (closeExpired) {
      await closeExpiredWalkBoardCycles(supabase, now).catch(() => 0);
    }
    await ensureCurrentWalkBoardCycle(supabase, now).catch(() => null);
    return listWalkBoardCyclesForDate(supabase, walkBoardClockParts(now).dateKey);
  })();

  const [todayCycles, permissions] = await Promise.all([cyclesWork, permissionsWork]);
  const slotKey = currentWalkBoardSlotKey(now);
  const currentCycle = slotKey ? todayCycles.find((row) => row.slot_key === slotKey) ?? null : null;
  const summary = summarizeWalkBoardCycles(todayCycles, now.getTime());

  return {
    timezone: WALK_BOARD_TIMEZONE,
    operatingWindow: isWalkBoardOperatingWindow(now),
    currentSlotKey: slotKey,
    currentCycle,
    todayCycles,
    summary,
    permissions: {
      canComplete: permissions.canComplete,
      canReceiveReminders: permissions.canReceiveReminders
    },
    serverTime: now.toISOString(),
    nextAlarmAt: nextWalkBoardAlarmAt(now).toISOString(),
    title: WALK_BOARD_ALARM_TITLE,
    message: WALK_BOARD_ALARM_MESSAGE,
    checklist: [...WALK_BOARD_ALARM_CHECKLIST]
  };
}

export function walkBoardSlotKeyForHour(dateKey: string, hour: number) {
  return walkBoardSlotKey(dateKey, hour);
}

/** Cheap read of the current pending alarm for the notification bell. */
export async function loadPendingWalkBoardCycle(
  supabase: SupabaseClient,
  now = new Date()
): Promise<WalkBoardCycleRow | null> {
  const cycle = await ensureCurrentWalkBoardCycle(supabase, now);
  if (!cycle || cycle.status !== "pending") return null;
  return cycle;
}

export { getWalkBoardUrgency };
export type { WalkBoardSummary };
