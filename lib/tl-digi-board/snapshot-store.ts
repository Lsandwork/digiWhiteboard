import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";
import { parseTlDigiBoardSnapshot, TL_DIGI_BOARD_SNAPSHOT_KEY } from "./server";
import { TL_DIGI_BOARD_SNAPSHOT_TABLE } from "./ensure-snapshot-schema";
import type { TlDigiBoardSnapshot } from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

let memorySnapshot: TlDigiBoardSnapshot | null = null;

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  const msg = error?.message || "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /does not exist|Could not find the table|schema cache/i.test(msg)
  );
}

export function getMemoryTlDigiBoardSnapshot() {
  return memorySnapshot;
}

export function rememberTlDigiBoardSnapshot(snapshot: TlDigiBoardSnapshot) {
  memorySnapshot = snapshot;
}

export function snapshotHasUsableGingrData(snapshot: TlDigiBoardSnapshot | null | undefined) {
  if (!snapshot) return false;
  return Boolean(
    snapshot.meta.lastSuccessfulSyncAt ||
      snapshot.medications.length ||
      snapshot.overdue.length ||
      snapshot.current.length ||
      snapshot.additionalServices.length
  );
}

export async function loadTlDigiBoardSnapshotFromStore(
  supabase: SupabaseClient
): Promise<TlDigiBoardSnapshot | null> {
  if (memorySnapshot && snapshotHasUsableGingrData(memorySnapshot)) {
    return memorySnapshot;
  }

  const { data, error } = await supabase
    .from(TL_DIGI_BOARD_SNAPSHOT_TABLE)
    .select("snapshot")
    .eq("id", "default")
    .maybeSingle();

  if (!error) {
    const parsed = parseTlDigiBoardSnapshot((data as { snapshot?: unknown } | null)?.snapshot);
    if (parsed && snapshotHasUsableGingrData(parsed)) {
      memorySnapshot = parsed;
      return parsed;
    }
    if (parsed) return parsed;
  } else if (!isMissingRelation(error)) {
    throw error;
  }

  const legacy = await loadAdminSettingsJsonKey(
    supabase,
    TL_DIGI_BOARD_SNAPSHOT_KEY,
    parseTlDigiBoardSnapshot,
    null
  );
  if (legacy && snapshotHasUsableGingrData(legacy)) {
    memorySnapshot = legacy;
  }
  return legacy ?? null;
}

export async function saveTlDigiBoardSnapshotToStore(
  supabase: SupabaseClient,
  snapshot: TlDigiBoardSnapshot
): Promise<boolean> {
  memorySnapshot = snapshot;
  const { error } = await supabase.from(TL_DIGI_BOARD_SNAPSHOT_TABLE).upsert({
    id: "default",
    snapshot,
    updated_at: new Date().toISOString()
  });
  if (!error) return true;
  if (!isMissingRelation(error)) throw error;
  return saveAdminSettingsJsonKey(supabase, TL_DIGI_BOARD_SNAPSHOT_KEY, snapshot);
}
