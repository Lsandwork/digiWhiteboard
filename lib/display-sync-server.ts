import { getPublicBuildId } from "@/lib/build-id";
import { DEFAULT_ADMIN_SETTINGS, loadAdminSettings, updateAdminSettings } from "@/lib/admin/settings";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { loadStaffBoardSettings } from "@/lib/staff/settings";
import type { DisplaySyncState } from "@/lib/display-sync";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function loadDisplaySyncState(supabase: SupabaseClient): Promise<DisplaySyncState> {
  const [adminSettings, lobbySettings, staffSettings] = await Promise.all([
    loadAdminSettings(supabase),
    loadLobbySettings(supabase),
    loadStaffBoardSettings(supabase)
  ]);

  return {
    display_content_revision: adminSettings.display_content_revision ?? 0,
    cast_hard_reload_nonce: adminSettings.cast_hard_reload_nonce ?? 0,
    build_id: getPublicBuildId(),
    lobby_published_version: lobbySettings.published_version ?? "v1.0.0",
    staff_published_version: staffSettings.published_version ?? "v1.0.0"
  };
}

export async function bumpDisplayContentRevision(supabase: SupabaseClient) {
  const current = await loadAdminSettings(supabase);
  const nextRevision = (current.display_content_revision ?? 0) + 1;
  await updateAdminSettings(supabase, { display_content_revision: nextRevision });
  return nextRevision;
}

export async function bumpCastHardReloadNonce(supabase: SupabaseClient) {
  const current = await loadAdminSettings(supabase);
  const nextNonce = (current.cast_hard_reload_nonce ?? 0) + 1;
  await updateAdminSettings(supabase, { cast_hard_reload_nonce: nextNonce });
  return nextNonce;
}

export function defaultDisplaySyncState(): DisplaySyncState {
  return {
    display_content_revision: DEFAULT_ADMIN_SETTINGS.display_content_revision ?? 0,
    cast_hard_reload_nonce: DEFAULT_ADMIN_SETTINGS.cast_hard_reload_nonce ?? 0,
    build_id: getPublicBuildId(),
    lobby_published_version: "v1.0.0",
    staff_published_version: "v1.0.0"
  };
}
