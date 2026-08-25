import { getPublicBuildId } from "@/lib/build-id";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/admin/settings";
import {
  cachedLoadSettingsBundle,
  cachedUpdateAdminSettings,
  DISPLAY_SYNC_CACHE_TTL_MS
} from "@/lib/board-settings-cache";
import { loadCastTvRefreshNonce, saveCastTvRefreshNonce } from "@/lib/cast-tv/library-store";
import { getOrLoadTtlCache, invalidateTtlCache, withTimeoutFallback } from "@/lib/server-ttl-cache";
import type { DisplaySyncState } from "@/lib/display-sync";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const CAST_REFRESH_STORAGE_TIMEOUT_MS = 3_000;
const CAST_REFRESH_POSTGRES_TIMEOUT_MS = 1_200;
const CAST_REFRESH_NONCE_MEMORY_TTL_MS = 30_000;

let memoryNonce = { value: 0, expiresAt: 0 };

function parseNonce(value: unknown) {
  const nonce = Number(value);
  if (!Number.isFinite(nonce)) return 0;
  return Math.max(0, Math.trunc(nonce));
}

function rememberNonce(nonce: number) {
  if (nonce <= 0) return;
  memoryNonce = {
    value: nonce,
    expiresAt: Date.now() + CAST_REFRESH_NONCE_MEMORY_TTL_MS
  };
}

async function loadPostgresCastHardReloadNonce(supabase: SupabaseClient): Promise<number> {
  const { loadAdminSettingsJsonKey } = await import("@/lib/admin/settings-json-store");
  const nonce = await loadAdminSettingsJsonKey(supabase, "cast_hard_reload_nonce", parseNonce, 0);
  return nonce ?? 0;
}

/**
 * Prefer Storage + memory. Production `admin_settings` hangs, which used to
 * block Refresh / Hard Refresh and the TV nonce poll.
 */
export async function loadCastHardReloadNonce(supabase: SupabaseClient): Promise<number> {
  if (memoryNonce.value > 0 && memoryNonce.expiresAt > Date.now()) {
    return memoryNonce.value;
  }

  const stored = await withTimeoutFallback(
    loadCastTvRefreshNonce(supabase),
    CAST_REFRESH_STORAGE_TIMEOUT_MS,
    0
  );
  if (stored > 0) {
    rememberNonce(stored);
    return stored;
  }

  const fromDb = await withTimeoutFallback(
    loadPostgresCastHardReloadNonce(supabase),
    CAST_REFRESH_POSTGRES_TIMEOUT_MS,
    0
  );
  if (fromDb > 0) rememberNonce(fromDb);
  return fromDb;
}

export async function loadDisplaySyncState(supabase: SupabaseClient): Promise<DisplaySyncState> {
  const cached = await getOrLoadTtlCache("display-sync", DISPLAY_SYNC_CACHE_TTL_MS, async () => {
    const { admin, lobby, staff } = await cachedLoadSettingsBundle(supabase);
    return {
      display_content_revision: admin.display_content_revision ?? 0,
      cast_hard_reload_nonce: admin.cast_hard_reload_nonce ?? 0,
      build_id: getPublicBuildId(),
      lobby_published_version: lobby.published_version ?? "v1.0.0",
      staff_published_version: staff.published_version ?? "v1.0.0"
    };
  });

  try {
    const nonce = await loadCastHardReloadNonce(supabase);
    return { ...cached, cast_hard_reload_nonce: nonce };
  } catch (error) {
    console.error("[display-sync] live nonce read failed:", error);
    return cached;
  }
}

export async function bumpDisplayContentRevision(supabase: SupabaseClient) {
  const { admin } = await cachedLoadSettingsBundle(supabase);
  const nextRevision = (admin.display_content_revision ?? 0) + 1;
  await cachedUpdateAdminSettings(supabase, { display_content_revision: nextRevision });
  return nextRevision;
}

export async function bumpCastHardReloadNonce(supabase: SupabaseClient) {
  let current = memoryNonce.value;
  if (current <= 0) {
    current = await withTimeoutFallback(loadCastTvRefreshNonce(supabase), 1_200, 0);
  }
  const nextNonce = Math.max(Date.now(), current + 1);
  rememberNonce(nextNonce);
  invalidateTtlCache("display-sync");

  await withTimeoutFallback(saveCastTvRefreshNonce(supabase, nextNonce), CAST_REFRESH_STORAGE_TIMEOUT_MS, undefined);

  void cachedUpdateAdminSettings(supabase, { cast_hard_reload_nonce: nextNonce }).catch((error) => {
    console.error("[display-sync] postgres nonce persist failed:", error);
  });

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
