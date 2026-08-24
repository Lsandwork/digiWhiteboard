import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";
import {
  CAST_TV_SETTINGS_ID,
  type CastTvImageDuration,
  type CastTvMediaRecord,
  type CastTvObjectFit,
  type CastTvSettings,
  type CastTvTransitionStyle
} from "@/lib/cast-tv/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const CAST_TV_LIBRARY_SETTINGS_KEY = "cast_tv_library";

export type CastTvHeartbeatRecord = {
  screen_id: string;
  last_seen_at: string;
  user_agent?: string | null;
};

export type CastTvLibraryState = {
  media: CastTvMediaRecord[];
  settings: CastTvSettings;
  heartbeats: Record<string, CastTvHeartbeatRecord>;
};

const IMAGE_DURATIONS = new Set<CastTvImageDuration>([5, 10, 15, 20, 30, 60]);
const TRANSITIONS = new Set<CastTvTransitionStyle>(["fade", "crossfade", "none"]);
const OBJECT_FITS = new Set<CastTvObjectFit>(["contain", "cover"]);

export function defaultCastTvSettings(): CastTvSettings {
  return {
    id: CAST_TV_SETTINGS_ID,
    default_image_seconds: 10,
    transition_ms: 700,
    transition_style: "fade",
    object_fit: "contain",
    show_standby_logo: true,
    is_paused: false,
    updated_at: new Date(0).toISOString(),
    updated_by: null
  };
}

export function emptyCastTvLibrary(): CastTvLibraryState {
  return { media: [], settings: defaultCastTvSettings(), heartbeats: {} };
}

function asMediaRecord(value: unknown): CastTvMediaRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CastTvMediaRecord>;
  if (!row.id || !row.file_name || !row.storage_path) return null;
  if (row.media_type !== "image" && row.media_type !== "video") return null;
  const duration = Number(row.image_display_seconds) as CastTvImageDuration;
  return {
    id: String(row.id),
    display_name: row.display_name ?? null,
    file_name: String(row.file_name),
    storage_path: String(row.storage_path),
    public_url: row.public_url ?? null,
    media_type: row.media_type,
    mime_type: row.mime_type ?? null,
    file_size_bytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
    duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    image_display_seconds: IMAGE_DURATIONS.has(duration) ? duration : 10,
    display_order: Number(row.display_order) || 0,
    is_enabled: row.is_enabled !== false,
    uploaded_by: row.uploaded_by ?? null,
    uploaded_by_name: row.uploaded_by_name ?? null,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString())
  };
}

function asSettings(value: unknown): CastTvSettings {
  const defaults = defaultCastTvSettings();
  if (!value || typeof value !== "object") return defaults;
  const row = value as Partial<CastTvSettings>;
  const duration = Number(row.default_image_seconds) as CastTvImageDuration;
  const transition = row.transition_style as CastTvTransitionStyle;
  const fit = row.object_fit as CastTvObjectFit;
  const transitionMs = Number(row.transition_ms);
  return {
    id: CAST_TV_SETTINGS_ID,
    default_image_seconds: IMAGE_DURATIONS.has(duration) ? duration : defaults.default_image_seconds,
    transition_ms: Number.isFinite(transitionMs) ? Math.min(5000, Math.max(0, transitionMs)) : defaults.transition_ms,
    transition_style: TRANSITIONS.has(transition) ? transition : defaults.transition_style,
    object_fit: OBJECT_FITS.has(fit) ? fit : defaults.object_fit,
    show_standby_logo: row.show_standby_logo !== false,
    is_paused: Boolean(row.is_paused),
    updated_at: String(row.updated_at || defaults.updated_at),
    updated_by: row.updated_by ?? null
  };
}

export function parseCastTvLibrary(value: unknown): CastTvLibraryState {
  if (!value || typeof value !== "object") return emptyCastTvLibrary();
  const raw = value as Partial<CastTvLibraryState> & { media?: unknown; heartbeats?: unknown };
  const media = Array.isArray(raw.media)
    ? raw.media
        .map(asMediaRecord)
        .filter((row): row is CastTvMediaRecord => Boolean(row))
        .sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at))
    : [];
  const heartbeats: Record<string, CastTvHeartbeatRecord> = {};
  if (raw.heartbeats && typeof raw.heartbeats === "object") {
    for (const [screenId, entry] of Object.entries(raw.heartbeats as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Partial<CastTvHeartbeatRecord>;
      if (!row.last_seen_at) continue;
      heartbeats[screenId] = {
        screen_id: String(row.screen_id || screenId),
        last_seen_at: String(row.last_seen_at),
        user_agent: row.user_agent ?? null
      };
    }
  }
  return {
    media,
    settings: asSettings(raw.settings),
    heartbeats
  };
}

export async function loadCastTvLibrary(supabase: SupabaseClient): Promise<CastTvLibraryState> {
  const loaded = await loadAdminSettingsJsonKey(
    supabase,
    CAST_TV_LIBRARY_SETTINGS_KEY,
    parseCastTvLibrary,
    emptyCastTvLibrary()
  );
  return loaded ?? emptyCastTvLibrary();
}

export async function saveCastTvLibrary(supabase: SupabaseClient, state: CastTvLibraryState) {
  const ok = await saveAdminSettingsJsonKey(supabase, CAST_TV_LIBRARY_SETTINGS_KEY, state);
  if (!ok) throw new Error("Unable to save CAST-TV library.");
}

export async function mutateCastTvLibrary<T>(
  supabase: SupabaseClient,
  mutator: (state: CastTvLibraryState) => { state: CastTvLibraryState; result: T }
): Promise<T> {
  const current = await loadCastTvLibrary(supabase);
  const { state, result } = mutator(current);
  await saveCastTvLibrary(supabase, state);
  return result;
}
