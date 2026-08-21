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
      snapshot.additionalServices.length ||
      snapshot.packageGroupWalks.length
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

export async function loadTlDigiBoardSnapshotFromStore(
  supabase: SupabaseClient
): Promise<TlDigiBoardSnapshot | null> {
  if (memorySnapshot && snapshotHasUsableGingrData(memorySnapshot)) {
    return memorySnapshot;
  }

  // Public TV GET must only read this small isolated row. Querying the missing
  // tl_digi_board_snapshots table (or the 7MiB default blob) hangs until abort.
  const isolated = await loadFromIsolatedSettingsRow(supabase);
  if (isolated && snapshotHasUsableGingrData(isolated)) {
    memorySnapshot = isolated;
    return isolated;
  }
  return isolated;
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
  if (isolatedError) throw isolatedError;
  void supabase
    .from(TL_DIGI_BOARD_SNAPSHOT_TABLE)
    .upsert({
      id: "default",
      snapshot,
      updated_at: now
    })
    .then(({ error }) => {
      if (error && !isMissingRelation(error)) {
        console.warn("[tl-digi-board] dedicated snapshot table upsert failed:", error.message);
      }
    });
  return true;
}
