import { getPublicBuildId } from "@/lib/build-id";
import { defaultDisplaySyncState, loadDisplaySyncState } from "@/lib/display-sync-server";
import type { DisplayCommand, DisplayDevice, DisplayType, HeartbeatRequest } from "@/lib/display-keeper";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "");
}

function normalizeDevice(row: Record<string, unknown>): DisplayDevice {
  return {
    id: String(row.id),
    name: row.name != null ? String(row.name) : null,
    display_type: String(row.display_type) as DisplayType,
    status: String(row.status ?? "online"),
    last_seen_at: String(row.last_seen_at ?? new Date().toISOString()),
    current_route: row.current_route != null ? String(row.current_route) : null,
    app_version: row.app_version != null ? String(row.app_version) : null,
    wake_lock_status: row.wake_lock_status != null ? String(row.wake_lock_status) : null,
    last_heartbeat_at: row.last_heartbeat_at != null ? String(row.last_heartbeat_at) : null,
    last_data_at: row.last_data_at != null ? String(row.last_data_at) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString())
  };
}

function normalizeCommand(row: Record<string, unknown>): DisplayCommand {
  return {
    id: String(row.id),
    display_type: String(row.display_type) as DisplayType,
    device_id: row.device_id != null ? String(row.device_id) : null,
    command_type: String(row.command_type) as DisplayCommand["command_type"],
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: String(row.status ?? "pending"),
    created_at: String(row.created_at ?? new Date().toISOString()),
    completed_at: row.completed_at != null ? String(row.completed_at) : null
  };
}

export async function upsertDisplayHeartbeat(supabase: SupabaseClient, input: HeartbeatRequest) {
  const nowIso = new Date().toISOString();
  const payload = {
    id: input.deviceId,
    name: input.name ?? null,
    display_type: input.displayType,
    status: input.status ?? "online",
    last_seen_at: nowIso,
    current_route: input.route,
    app_version: getPublicBuildId(),
    wake_lock_status: input.wakeLockStatus ?? null,
    last_heartbeat_at: nowIso,
    last_data_at: input.lastDataAt ?? null,
    updated_at: nowIso
  };

  const { error } = await supabase.from("display_devices").upsert(payload, { onConflict: "id" });
  if (error) {
    if (isMissingRelation(error)) return null;
    console.error("[display-heartbeat] device upsert failed:", error.message ?? error);
    return null;
  }
  return payload;
}

export async function listPendingDisplayCommands(
  supabase: SupabaseClient,
  displayType: DisplayType,
  deviceId: string
) {
  const { data, error } = await supabase
    .from("display_commands")
    .select("*")
    .eq("display_type", displayType)
    .eq("status", "pending")
    .or(`device_id.is.null,device_id.eq.${deviceId}`)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    if (isMissingRelation(error)) return [];
    console.error("[display-heartbeat] list commands failed:", error.message ?? error);
    return [];
  }
  return (data ?? []).map((row) => normalizeCommand(row as Record<string, unknown>));
}

export async function markDisplayCommandsDelivered(
  supabase: SupabaseClient,
  commandIds: string[],
  finalStatus: "delivered" | "completed" = "completed"
) {
  if (!commandIds.length) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("display_commands")
    .update({ status: finalStatus, completed_at: nowIso })
    .in("id", commandIds);
  if (error && isMissingRelation(error)) return;
  if (error) throw error;
}

export async function listDisplayDevices(supabase: SupabaseClient, displayType?: DisplayType) {
  let query = supabase.from("display_devices").select("*").order("last_seen_at", { ascending: false }).limit(100);
  if (displayType) query = query.eq("display_type", displayType);
  const { data, error } = await query;
  if (error && isMissingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []).map((row) => normalizeDevice(row as Record<string, unknown>));
}

export async function queueDisplayCommand(
  supabase: SupabaseClient,
  input: {
    displayType: DisplayType;
    commandType: DisplayCommand["command_type"];
    deviceId?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from("display_commands")
    .insert({
      display_type: input.displayType,
      device_id: input.deviceId ?? null,
      command_type: input.commandType,
      payload: input.payload ?? {},
      status: "pending"
    })
    .select("*")
    .single();

  if (error && isMissingRelation(error)) return null;
  if (error) throw error;
  return normalizeCommand(data as Record<string, unknown>);
}

export async function buildHeartbeatResponse(supabase: SupabaseClient, input: HeartbeatRequest) {
  await upsertDisplayHeartbeat(supabase, input);

  let sync = defaultDisplaySyncState();
  try {
    sync = await loadDisplaySyncState(supabase);
  } catch (error) {
    console.error("[display-heartbeat] sync load failed:", error);
  }

  const commands = await listPendingDisplayCommands(supabase, input.displayType, input.deviceId);

  return {
    ok: true,
    serverTime: new Date().toISOString(),
    sync,
    commands,
    appVersion: getPublicBuildId()
  };
}
