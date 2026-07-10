import { getPublicBuildId } from "@/lib/build-id";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/admin/settings";
import {
  cachedLoadSettingsBundle,
  cachedUpdateAdminSettings,
  DISPLAY_SYNC_CACHE_TTL_MS
} from "@/lib/board-settings-cache";
import { getOrLoadTtlCache } from "@/lib/server-ttl-cache";
import type { DisplaySyncState } from "@/lib/display-sync";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function loadDisplaySyncState(supabase: SupabaseClient): Promise<DisplaySyncState> {
  return getOrLoadTtlCache("display-sync", DISPLAY_SYNC_CACHE_TTL_MS, async () => {
    const { admin, lobby, staff } = await cachedLoadSettingsBundle(supabase);
    return {
      display_content_revision: admin.display_content_revision ?? 0,
      cast_hard_reload_nonce: admin.cast_hard_reload_nonce ?? 0,
      build_id: getPublicBuildId(),
      lobby_published_version: lobby.published_version ?? "v1.0.0",
      staff_published_version: staff.published_version ?? "v1.0.0"
    };
  });
}

export async function bumpDisplayContentRevision(supabase: SupabaseClient) {
  const { admin } = await cachedLoadSettingsBundle(supabase);
  const nextRevision = (admin.display_content_revision ?? 0) + 1;
  await cachedUpdateAdminSettings(supabase, { display_content_revision: nextRevision });
  return nextRevision;
}

export async function bumpCastHardReloadNonce(supabase: SupabaseClient) {
  const { admin } = await cachedLoadSettingsBundle(supabase);
  const nextNonce = (admin.cast_hard_reload_nonce ?? 0) + 1;
  await cachedUpdateAdminSettings(supabase, { cast_hard_reload_nonce: nextNonce });
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
