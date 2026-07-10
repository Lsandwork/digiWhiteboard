import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getUserAccess } from "@/lib/admin/user-access";
import { hasPermission, type UserAccess } from "@/lib/admin/permissions";
import { WALK_BOARD_CYCLE_MS, WALK_BOARD_SNOOZE_MS } from "./constants";
import type {
  WalkBoardActivityRow,
  WalkBoardActivityView,
  WalkBoardEntryRow,
  WalkBoardEntryView,
  WalkBoardUserRef
} from "./types";
import { normalizeWalkBoardDogName, validateWalkBoardDogName, parseWalkBoardType } from "./validation";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function nowIso() {
  return new Date().toISOString();
}

async function loadUserRefs(
  supabase: SupabaseClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, WalkBoardUserRef>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map();

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, email, full_name")
    .in("id", unique);

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

function decorateEntry(entry: WalkBoardEntryRow, users: Map<string, WalkBoardUserRef>): WalkBoardEntryView {
  return {
    ...entry,
    created_by_user: entry.created_by ? users.get(entry.created_by) ?? null : null,
    last_walked_by_user: entry.last_walked_by ? users.get(entry.last_walked_by) ?? null : null,
    snoozed_by_user: entry.snoozed_by ? users.get(entry.snoozed_by) ?? null : null,
    cleared_by_user: entry.cleared_by ? users.get(entry.cleared_by) ?? null : null
  };
}

function decorateActivity(row: WalkBoardActivityRow, users: Map<string, WalkBoardUserRef>): WalkBoardActivityView {
  return {
    ...row,
    actor_user: row.actor_user_id ? users.get(row.actor_user_id) ?? null : null
  };
}

async function insertActivity(
  supabase: SupabaseClient,
  input: {
    walkEntryId: string;
    action: WalkBoardActivityRow["action"];
    actorUserId?: string | null;
    previousDueAt?: string | null;
    newDueAt?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  }
) {
  const { error } = await supabase.from("walk_board_activity").insert({
    walk_entry_id: input.walkEntryId,
    action: input.action,
    actor_user_id: input.actorUserId ?? null,
    occurred_at: input.occurredAt ?? nowIso(),
    previous_due_at: input.previousDueAt ?? null,
    new_due_at: input.newDueAt ?? null,
    metadata: input.metadata ?? {}
  });
  if (error) throw error;
}

export function canReceiveWalkBoardReminders(access: UserAccess | null | undefined): boolean {
  return hasPermission(access, "receive_walks_board_reminders");
}

export function canSnoozeWalkBoard(access: UserAccess | null | undefined): boolean {
  return canReceiveWalkBoardReminders(access);
}

export class WalkBoardDuplicateError extends Error {
  duplicate: WalkBoardEntryView;

  constructor(duplicate: WalkBoardEntryView) {
    super("An active dog with this name is already on the Walks Board.");
    this.name = "WalkBoardDuplicateError";
    this.duplicate = duplicate;
  }
}

export async function findActiveWalkBoardDuplicate(
  supabase: SupabaseClient,
  dogNameNormalized: string
): Promise<WalkBoardEntryRow | null> {
  const { data, error } = await supabase
    .from("walk_board_entries")
    .select("*")
    .eq("status", "active")
    .eq("dog_name_normalized", dogNameNormalized)
    .maybeSingle();
  if (error) throw error;
  return (data as WalkBoardEntryRow | null) ?? null;
}

export async function listActiveWalkBoardEntries(supabase: SupabaseClient): Promise<WalkBoardEntryView[]> {
  const { data, error } = await supabase
    .from("walk_board_entries")
    .select("*")
    .eq("status", "active")
    .order("next_due_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as WalkBoardEntryRow[];
  const users = await loadUserRefs(
    supabase,
    rows.flatMap((row) => [row.created_by, row.last_walked_by, row.snoozed_by, row.cleared_by])
  );
  return rows.map((row) => decorateEntry(row, users));
}

export async function listWalkBoardActivity(
  supabase: SupabaseClient,
  walkEntryId: string
): Promise<WalkBoardActivityView[]> {
  const { data, error } = await supabase
    .from("walk_board_activity")
    .select("*")
    .eq("walk_entry_id", walkEntryId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as WalkBoardActivityRow[];
  const users = await loadUserRefs(
    supabase,
    rows.map((row) => row.actor_user_id)
  );
  return rows.map((row) => decorateActivity(row, users));
}

export async function addWalkBoardEntry(
  supabase: SupabaseClient,
  input: {
    dogName: string;
    walkType: unknown;
    actorUserId: string;
    actorEmail?: string | null;
    forceDuplicate?: boolean;
  }
): Promise<{ entry: WalkBoardEntryView }> {
  const validated = validateWalkBoardDogName(input.dogName);
  if (!validated.ok) throw new Error(validated.error);

  const walkType = parseWalkBoardType(input.walkType);
  if (!walkType) throw new Error("Select a walk type.");

  const normalized = normalizeWalkBoardDogName(validated.value);
  const duplicate = await findActiveWalkBoardDuplicate(supabase, normalized);
  if (duplicate && !input.forceDuplicate) {
    const users = await loadUserRefs(supabase, [duplicate.created_by]);
    throw new WalkBoardDuplicateError(decorateEntry(duplicate, users));
  }

  const createdAt = nowIso();
  const nextDueAt = new Date(Date.now() + WALK_BOARD_CYCLE_MS).toISOString();

  const { data, error } = await supabase
    .from("walk_board_entries")
    .insert({
      dog_name: validated.value,
      dog_name_normalized: normalized,
      walk_type: walkType,
      status: "active",
      created_by: input.actorUserId,
      cycle_started_at: createdAt,
      next_due_at: nextDueAt,
      snooze_used: false
    })
    .select("*")
    .single();

  if (error) throw error;
  const entry = data as WalkBoardEntryRow;

  await insertActivity(supabase, {
    walkEntryId: entry.id,
    action: "added",
    actorUserId: input.actorUserId,
    newDueAt: entry.next_due_at,
    metadata: { walk_type: walkType, dog_name: entry.dog_name }
  });

  await writeAdminAuditLog({
    actorAdminId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    action: "walks_board.add",
    targetType: "walk_board_entry",
    targetId: entry.id,
    details: { dog_name: entry.dog_name, walk_type: walkType }
  });

  const users = await loadUserRefs(supabase, [entry.created_by]);
  return { entry: decorateEntry(entry, users) };
}

export async function markWalkBoardWalked(
  supabase: SupabaseClient,
  input: { entryId: string; actorUserId: string; actorEmail?: string | null; expectedVersion?: number }
): Promise<WalkBoardEntryView> {
  const { data: current, error: loadError } = await supabase
    .from("walk_board_entries")
    .select("*")
    .eq("id", input.entryId)
    .eq("status", "active")
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw new Error("This dog is no longer on the active Walks Board.");

  const row = current as WalkBoardEntryRow;
  if (input.expectedVersion != null && row.version !== input.expectedVersion) {
    throw new Error("This entry was updated by someone else. Refresh and try again.");
  }

  const walkedAt = nowIso();
  const nextDueAt = new Date(Date.now() + WALK_BOARD_CYCLE_MS).toISOString();

  let query = supabase
    .from("walk_board_entries")
    .update({
      last_walked_at: walkedAt,
      last_walked_by: input.actorUserId,
      cycle_started_at: walkedAt,
      next_due_at: nextDueAt,
      snooze_used: false,
      snoozed_at: null,
      snoozed_by: null,
      version: row.version + 1
    })
    .eq("id", input.entryId)
    .eq("status", "active")
    .eq("version", row.version);

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This entry was updated by someone else. Refresh and try again.");

  const entry = data as WalkBoardEntryRow;
  await insertActivity(supabase, {
    walkEntryId: entry.id,
    action: "walked",
    actorUserId: input.actorUserId,
    previousDueAt: row.next_due_at,
    newDueAt: entry.next_due_at,
    metadata: { last_walked_at: walkedAt }
  });

  await writeAdminAuditLog({
    actorAdminId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    action: "walks_board.walked",
    targetType: "walk_board_entry",
    targetId: entry.id,
    details: { dog_name: entry.dog_name, last_walked_at: walkedAt }
  });

  const users = await loadUserRefs(supabase, [entry.created_by, entry.last_walked_by]);
  return decorateEntry(entry, users);
}

export async function snoozeWalkBoardEntry(
  supabase: SupabaseClient,
  input: {
    entryId: string;
    actorUserId: string;
    actorEmail?: string | null;
    access: UserAccess;
    expectedVersion?: number;
  }
): Promise<WalkBoardEntryView> {
  if (!canSnoozeWalkBoard(input.access)) {
    throw new Error("You do not have permission to snooze walk reminders.");
  }

  const { data: current, error: loadError } = await supabase
    .from("walk_board_entries")
    .select("*")
    .eq("id", input.entryId)
    .eq("status", "active")
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw new Error("This dog is no longer on the active Walks Board.");

  const row = current as WalkBoardEntryRow;
  if (row.snooze_used) {
    throw new Error("This walk reminder has already been snoozed once. Mark the dog walked or clear the entry.");
  }
  if (input.expectedVersion != null && row.version !== input.expectedVersion) {
    throw new Error("This entry was updated by someone else. Refresh and try again.");
  }

  const snoozedAt = nowIso();
  const nextDueAt = new Date(Date.now() + WALK_BOARD_SNOOZE_MS).toISOString();

  const { data, error } = await supabase
    .from("walk_board_entries")
    .update({
      next_due_at: nextDueAt,
      snooze_used: true,
      snoozed_at: snoozedAt,
      snoozed_by: input.actorUserId,
      version: row.version + 1
    })
    .eq("id", input.entryId)
    .eq("status", "active")
    .eq("version", row.version)
    .eq("snooze_used", false)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("This walk reminder has already been snoozed once. Mark the dog walked or clear the entry.");
  }

  const entry = data as WalkBoardEntryRow;
  await insertActivity(supabase, {
    walkEntryId: entry.id,
    action: "snoozed",
    actorUserId: input.actorUserId,
    previousDueAt: row.next_due_at,
    newDueAt: entry.next_due_at,
    metadata: { snoozed_at: snoozedAt }
  });

  await writeAdminAuditLog({
    actorAdminId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    action: "walks_board.snooze",
    targetType: "walk_board_entry",
    targetId: entry.id,
    details: { dog_name: entry.dog_name, next_due_at: entry.next_due_at }
  });

  const users = await loadUserRefs(supabase, [entry.created_by, entry.snoozed_by, entry.last_walked_by]);
  return decorateEntry(entry, users);
}

export async function clearWalkBoardEntry(
  supabase: SupabaseClient,
  input: { entryId: string; actorUserId: string; actorEmail?: string | null; expectedVersion?: number }
): Promise<{ ok: true }> {
  const { data: current, error: loadError } = await supabase
    .from("walk_board_entries")
    .select("*")
    .eq("id", input.entryId)
    .eq("status", "active")
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw new Error("This dog is no longer on the active Walks Board.");

  const row = current as WalkBoardEntryRow;
  if (input.expectedVersion != null && row.version !== input.expectedVersion) {
    throw new Error("This entry was updated by someone else. Refresh and try again.");
  }

  const clearedAt = nowIso();
  const { data, error } = await supabase
    .from("walk_board_entries")
    .update({
      status: "cleared",
      cleared_at: clearedAt,
      cleared_by: input.actorUserId,
      version: row.version + 1
    })
    .eq("id", input.entryId)
    .eq("status", "active")
    .eq("version", row.version)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("This entry was updated by someone else. Refresh and try again.");

  await insertActivity(supabase, {
    walkEntryId: row.id,
    action: "cleared",
    actorUserId: input.actorUserId,
    previousDueAt: row.next_due_at,
    metadata: { cleared_at: clearedAt }
  });

  await writeAdminAuditLog({
    actorAdminId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    action: "walks_board.clear",
    targetType: "walk_board_entry",
    targetId: row.id,
    details: { dog_name: row.dog_name }
  });

  return { ok: true };
}

export async function resolveWalkBoardPermissions(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  legacyRole?: string | null,
  email?: string | null
) {
  const access = await getUserAccess(supabase, userId, legacyRole, email);
  return {
    canSnooze: canSnoozeWalkBoard(access),
    canReceiveReminders: canReceiveWalkBoardReminders(access)
  };
}
