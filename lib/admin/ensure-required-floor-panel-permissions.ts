/**
 * Persist required floor-panel permissions into the live role matrix so
 * Management / Front Desk / Team Lead panel tabs cannot stay disabled by an
 * older stored snapshot.
 */
import { loadRolePermissionMatrix, saveRolePermissionMatrix } from "@/lib/admin/role-permission-matrix";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const ENSURE_FLAG_KEY = "required_floor_panel_permissions_ensured_v2";

async function readFlag(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return Boolean(settings[ENSURE_FLAG_KEY]);
}

async function writeFlag(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [ENSURE_FLAG_KEY]: { at: new Date().toISOString() }
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
}

export async function ensureRequiredFloorPanelPermissionsPersisted(
  supabase: SupabaseClient,
  options: { force?: boolean } = {}
) {
  if (!options.force && (await readFlag(supabase))) {
    return { skipped: true as const, reason: "already_ensured" };
  }
  const matrix = await loadRolePermissionMatrix(supabase);
  await saveRolePermissionMatrix(supabase, matrix);
  await writeFlag(supabase);
  return { skipped: false as const };
}
