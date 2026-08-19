import { parseTlDigiBoardSnapshot } from "./server";
import { TL_DIGI_BOARD_SNAPSHOT_TABLE } from "./ensure-snapshot-schema";
import type { TlDigiBoardSnapshot } from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Isolated admin_settings row — not the 7+ MiB `default` blob. */
export const TL_DIGI_BOARD_SNAPSHOT_ROW_ID = "tl_digi_board_snapshot";

let memorySnapshot: TlDigiBoardSnapshot | null = null;

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  const msg = error?.message || "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /does not exist|Could not find the table|schema cache/i.test(msg)
  );
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

export function rememberTlDigiBoardSnapshot(snapshot: TlDigiBoardSnapshot) {
  memorySnapshot = snapshot;
}

async function loadFromIsolatedSettingsRow(supabase: SupabaseClient): Promise<TlDigiBoardSnapshot | null> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("settings")
    .eq("id", TL_DIGI_BOARD_SNAPSHOT_ROW_ID)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  const settings = (data as { settings?: unknown } | null)?.settings;
  return parseTlDigiBoardSnapshot(settings);
}

async function loadFromDedicatedTable(supabase: SupabaseClient): Promise<TlDigiBoardSnapshot | null> {
  const { data, error } = await supabase
    .from(TL_DIGI_BOARD_SNAPSHOT_TABLE)
    .select("snapshot")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  return parseTlDigiBoardSnapshot((data as { snapshot?: unknown } | null)?.snapshot);
}

export async function loadTlDigiBoardSnapshotFromStore(
  supabase: SupabaseClient
): Promise<TlDigiBoardSnapshot | null> {
  if (memorySnapshot && snapshotHasUsableGingrData(memorySnapshot)) {
    return memorySnapshot;
  }

  // Isolated row first. Never read settings->key from the huge `default` blob —
  // that is what made production GET hang for 8s+ with "Never synced".
  const isolated = await loadFromIsolatedSettingsRow(supabase);
  if (isolated && snapshotHasUsableGingrData(isolated)) {
    memorySnapshot = isolated;
    return isolated;
  }

  const tableRow = await loadFromDedicatedTable(supabase);
  if (tableRow && snapshotHasUsableGingrData(tableRow)) {
    memorySnapshot = tableRow;
    return tableRow;
  }

  return isolated ?? tableRow ?? null;
}

export async function saveTlDigiBoardSnapshotToStore(
  supabase: SupabaseClient,
  snapshot: TlDigiBoardSnapshot
): Promise<boolean> {
  memorySnapshot = snapshot;
  const now = new Date().toISOString();
  const { error: isolatedError } = await supabase.from("admin_settings").upsert({
    id: TL_DIGI_BOARD_SNAPSHOT_ROW_ID,
    settings: snapshot,
    updated_at: now
  });
  const { error: tableError } = await supabase.from(TL_DIGI_BOARD_SNAPSHOT_TABLE).upsert({
    id: "default",
    snapshot,
    updated_at: now
  });
  if (!isolatedError) return true;
  if (tableError && !isMissingRelation(tableError) && !isMissingRelation(isolatedError)) {
    throw isolatedError;
  }
  return !isolatedError || (!tableError && !isMissingRelation(tableError));
}
