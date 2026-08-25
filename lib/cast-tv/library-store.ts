import { getTtlCache, setTtlCache, withTimeoutFallback } from "@/lib/server-ttl-cache";
import {
  basenameCastTvFile,
  isLegacyCastTvDumpPath,
  isLocalCastTvAsset,
  isRecoverableCastTvStoragePath,
  originalCastTvFileNameKey,
  purgeDuplicateCastTvMedia
} from "@/lib/cast-tv/display-image";
import { inferCastTvMimeType, mediaTypeForMime } from "@/lib/cast-tv/mime";
import { LOBBY_IDLE_SLIDESHOW } from "@/lib/lobby/slideshow";
import {
  CAST_TV_SETTINGS_ID,
  type CastTvImageDuration,
  type CastTvMediaRecord,
  type CastTvObjectFit,
  type CastTvSettings,
  type CastTvTransitionStyle
} from "@/lib/cast-tv/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Production CAST-TV Postgres tables hang; playlist JSON lives next to the files. */
export const CAST_TV_STORAGE_BUCKET = "lobby-slideshow";
export const CAST_TV_LEGACY_MEDIA_BUCKET = "cast-tv-media";
export const CAST_TV_LIBRARY_OBJECT_PATH = "cast-tv/library.json";
export const CAST_TV_HEARTBEATS_OBJECT_PATH = "cast-tv/heartbeats.json";
export const CAST_TV_REFRESH_OBJECT_PATH = "cast-tv/refresh.json";
/** Playlist JSON from the brief admin_settings era, before Storage library.json. */
export const CAST_TV_LIBRARY_SETTINGS_KEY = "cast_tv_library";
export const CAST_TV_LAST_GOOD_CACHE_KEY = "cast-tv:last-good-library";
export const CAST_TV_LAST_GOOD_TTL_MS = 24 * 60 * 60 * 1000;

const CAST_TV_LIBRARY_BUCKETS = [CAST_TV_STORAGE_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET] as const;

export type CastTvRefreshState = {
  nonce: number;
  updatedAt: string;
};

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

export type CastTvStorageListItem = {
  name: string;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
};

const IMAGE_DURATIONS = new Set<CastTvImageDuration>([5, 10, 15, 20, 30, 60]);
const TRANSITIONS = new Set<CastTvTransitionStyle>(["fade", "crossfade", "none"]);
const OBJECT_FITS = new Set<CastTvObjectFit>(["contain", "cover"]);
const JSON_UPLOAD_MIME = ["application/json", "text/plain", "image/jpeg"] as const;

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

export function builtinMarketingCastTvMedia(): CastTvMediaRecord[] {
  return LOBBY_IDLE_SLIDESHOW.map((slide, index) => {
    const fileName = slide.src.split("/").pop() || `slide-${index + 1}.png`;
    return {
      id: `builtin-marketing-${fileName.replace(/\.[^.]+$/, "")}`,
      display_name: slide.alt,
      file_name: fileName,
      storage_path: `builtin/marketing/${fileName}`,
      bucket: null,
      public_url: slide.src,
      media_type: "image" as const,
      mime_type: "image/png",
      file_size_bytes: null,
      duration_seconds: null,
      image_display_seconds: 10 as CastTvImageDuration,
      display_order: index + 1,
      is_enabled: true,
      uploaded_by: null,
      uploaded_by_name: "Fitdog marketing",
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      display_ready: true
    };
  });
}

function mediaKeys(item: CastTvMediaRecord) {
  const keys = [`id:${item.id}`, `path:${item.storage_path}`];
  const fileKey = originalCastTvFileNameKey(item.file_name);
  if (fileKey) keys.push(`file:${fileKey}`);
  if (item.content_hash) keys.push(`hash:${item.content_hash}`);
  if (item.pixel_hash) keys.push(`pixel:${item.pixel_hash}`);
  return keys;
}

export function mergeCastTvLibraries(
  base: CastTvLibraryState,
  incoming: CastTvLibraryState
): { library: CastTvLibraryState; added: number } {
  const known = new Set(base.media.flatMap(mediaKeys));
  const baseHasCanonical = base.media.some(
    (item) => item.is_enabled !== false && !isLegacyCastTvDumpPath(item.storage_path)
  );
  const incomingMedia = baseHasCanonical
    ? incoming.media.filter((item) => !isLegacyCastTvDumpPath(item.storage_path))
    : incoming.media;
  const extras = incomingMedia.filter((item) => mediaKeys(item).every((key) => !known.has(key)));
  if (!extras.length) {
    const incomingNewer =
      Date.parse(incoming.settings.updated_at) > Date.parse(base.settings.updated_at);
    if (!incomingNewer) return { library: base, added: 0 };
    return { library: { ...base, settings: incoming.settings }, added: 0 };
  }

  let nextOrder = base.media.reduce((max, item) => Math.max(max, item.display_order), 0);
  const incomingNewer = Date.parse(incoming.settings.updated_at) > Date.parse(base.settings.updated_at);
  return {
    library: {
      media: [
        ...base.media,
        ...extras.map((item) => {
          nextOrder += 1;
          return { ...item, display_order: item.display_order || nextOrder };
        })
      ].sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at)),
      settings: incomingNewer ? incoming.settings : base.settings,
      heartbeats: Object.keys(base.heartbeats).length ? base.heartbeats : incoming.heartbeats
    },
    added: extras.length
  };
}

export function isMissingCastTvStorageObject(
  error: { message?: string; statusCode?: string | number } | null | undefined
) {
  if (!error) return true;
  const code = String(error.statusCode ?? "");
  const message = String(error.message ?? "");
  return (
    code === "404" ||
    code === "400" ||
    /not found|does not exist|No such file|object not found/i.test(message)
  );
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
    bucket: row.bucket ? String(row.bucket) : null,
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
    updated_at: String(row.updated_at || new Date().toISOString()),
    content_hash: typeof row.content_hash === "string" && row.content_hash ? row.content_hash : null,
    pixel_hash: typeof row.pixel_hash === "string" && row.pixel_hash ? row.pixel_hash : null,
    display_ready: row.display_ready === true
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

export function parseCastTvHeartbeats(value: unknown): Record<string, CastTvHeartbeatRecord> {
  const heartbeats: Record<string, CastTvHeartbeatRecord> = {};
  const raw =
    value && typeof value === "object" && "heartbeats" in value
      ? (value as { heartbeats?: unknown }).heartbeats
      : value;
  if (!raw || typeof raw !== "object") return heartbeats;
  for (const [screenId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Partial<CastTvHeartbeatRecord>;
    if (!row.last_seen_at) continue;
    heartbeats[screenId] = {
      screen_id: String(row.screen_id || screenId),
      last_seen_at: String(row.last_seen_at),
      user_agent: row.user_agent ?? null
    };
  }
  return heartbeats;
}

export function parseCastTvLibrary(value: unknown): CastTvLibraryState {
  if (!value || typeof value !== "object") return emptyCastTvLibrary();
  const raw = value as Partial<CastTvLibraryState> & { media?: unknown };
  const media = Array.isArray(raw.media)
    ? raw.media
        .map(asMediaRecord)
        .filter((row): row is CastTvMediaRecord => Boolean(row))
        .sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at))
    : [];
  return {
    media: purgeDuplicateCastTvMedia(media).kept,
    settings: asSettings(raw.settings),
    heartbeats: parseCastTvHeartbeats(raw.heartbeats)
  };
}

function isLibrarySidecar(name: string) {
  const base = basenameCastTvFile(name).toLowerCase();
  return (
    base === "library.json" ||
    base === "heartbeats.json" ||
    base === "refresh.json" ||
    base.endsWith(".json")
  );
}

export function parseCastTvRefreshNonce(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const nonce = Number((value as { nonce?: unknown }).nonce);
  if (!Number.isFinite(nonce)) return 0;
  return Math.max(0, Math.trunc(nonce));
}

export function mergeCastTvStorageObjects(
  library: CastTvLibraryState,
  objects: CastTvStorageListItem[],
  publicUrlForPath: (storagePath: string, updatedAt?: string) => string,
  options: { bucket?: string; pathPrefix?: string } = {}
): { library: CastTvLibraryState; added: number } {
  const known = new Set(library.media.map((item) => `${item.bucket || ""}:${item.storage_path}`));
  const extras: CastTvMediaRecord[] = [];
  let nextOrder = library.media.reduce((max, item) => Math.max(max, item.display_order), 0);
  const bucket = options.bucket || CAST_TV_STORAGE_BUCKET;
  const prefix = options.pathPrefix;

  for (const object of objects) {
    const name = String(object.name || "").trim();
    if (!name || isLibrarySidecar(name) || name.endsWith("/")) continue;
    if (isLegacyCastTvDumpPath(name)) continue;
    const baseName = basenameCastTvFile(name);
    if (!baseName || isLibrarySidecar(baseName)) continue;
    const storagePath =
      prefix === ""
        ? name
        : prefix
          ? `${prefix}/${baseName}`
          : name.startsWith("cast-tv/")
            ? name
            : `cast-tv/${baseName}`;
    if (!isRecoverableCastTvStoragePath(storagePath)) continue;
    const key = `${bucket}:${storagePath}`;
    if (known.has(key) || known.has(`:${storagePath}`)) continue;

    const mime = inferCastTvMimeType(baseName, object.metadata?.mimetype);
    if (/json|text\/plain/i.test(String(object.metadata?.mimetype || ""))) continue;
    const mediaType = mediaTypeForMime(mime, baseName);
    if (!mediaType) continue;

    const updatedAt = String(object.updated_at || object.created_at || new Date().toISOString());
    const id = baseName.replace(/\.[^.]+$/, "") || storagePath;
    if (library.media.some((item) => item.id === id || item.storage_path.endsWith(`/${baseName}`))) continue;
    nextOrder += 1;
    extras.push({
      id,
      display_name: null,
      file_name: baseName,
      storage_path: storagePath,
      bucket,
      public_url: publicUrlForPath(storagePath, updatedAt),
      media_type: mediaType,
      mime_type: mime || null,
      file_size_bytes: typeof object.metadata?.size === "number" ? object.metadata.size : null,
      duration_seconds: null,
      image_display_seconds: library.settings.default_image_seconds,
      display_order: nextOrder,
      is_enabled: true,
      uploaded_by: null,
      uploaded_by_name: null,
      created_at: String(object.created_at || updatedAt),
      updated_at: updatedAt,
      display_ready: false
    });
    known.add(key);
  }

  if (!extras.length) return { library, added: 0 };
  return {
    library: {
      ...library,
      media: [...library.media, ...extras]
    },
    added: extras.length
  };
}

async function downloadJsonObject(supabase: SupabaseClient, path: string): Promise<unknown | null> {
  let lastError: { message?: string; statusCode?: string | number } | null = null;
  for (const bucket of CAST_TV_LIBRARY_BUCKETS) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (data && !error) {
      const text = await data.text();
      if (!text.trim()) continue;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        continue;
      }
    }
    if (error && !isMissingCastTvStorageObject(error)) lastError = error;
  }
  if (lastError) throw lastError;
  return null;
}

async function uploadJsonObject(supabase: SupabaseClient, path: string, value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  let lastMessage = "Unable to save CAST-TV library.";
  for (const bucket of CAST_TV_LIBRARY_BUCKETS) {
    for (const mime of JSON_UPLOAD_MIME) {
      const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
        contentType: mime,
        upsert: true,
        cacheControl: "0"
      });
      if (!error) return;
      lastMessage = error.message || lastMessage;
      if (!/mime|not supported|allowed|invalid type/i.test(error.message || "")) {
        break;
      }
    }
  }
  throw new Error(lastMessage);
}

export function publicUrlForCastTvStorage(
  supabase: SupabaseClient,
  storagePath: string,
  updatedAt?: string,
  bucket = CAST_TV_STORAGE_BUCKET
) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  if (!updatedAt) return data.publicUrl;
  return `${data.publicUrl}?v=${encodeURIComponent(updatedAt)}`;
}

async function listBucketPrefix(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<CastTvStorageListItem[]> {
  const results: CastTvStorageListItem[] = [];
  let offset = 0;
  for (let page = 0; page < 8; page += 1) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (error || !data?.length) break;
    for (const object of data) {
      const name = String(object.name || "").trim();
      if (!name || name.endsWith("/")) continue;
      const isFolder = !object.id || object.metadata == null;
      if (isFolder && !/\.[a-z0-9]+$/i.test(name)) {
        if (name.toLowerCase() === "media") continue;
        const childPrefix = prefix ? `${prefix}/${name}` : name;
        try {
          const nested = await listBucketPrefix(supabase, bucket, childPrefix);
          results.push(...nested);
        } catch {
          /* skip one nested folder */
        }
        continue;
      }
      results.push({
        name: prefix ? `${prefix}/${name}` : name,
        updated_at: object.updated_at,
        created_at: object.created_at,
        metadata: object.metadata
      });
    }
    if (data.length < 100) break;
    offset += data.length;
  }
  return results;
}

async function recoverOrphanedCastTvFiles(
  supabase: SupabaseClient,
  library: CastTvLibraryState
): Promise<CastTvLibraryState> {
  const scans: Array<{ bucket: string; prefix: string }> = [
    { bucket: CAST_TV_STORAGE_BUCKET, prefix: "cast-tv" },
    { bucket: CAST_TV_LEGACY_MEDIA_BUCKET, prefix: "cast-tv" }
  ];

  let current = library;
  for (const scan of scans) {
    try {
      const objects = await listBucketPrefix(supabase, scan.bucket, scan.prefix);
      const merged = mergeCastTvStorageObjects(
        current,
        objects,
        (storagePath, updatedAt) => publicUrlForCastTvStorage(supabase, storagePath, updatedAt, scan.bucket),
        { bucket: scan.bucket, pathPrefix: "" }
      );
      current = merged.library;
    } catch {
      /* one bucket failing must not hide files in the others */
    }
  }
  return current;
}

async function loadLegacySettingsLibrary(supabase: SupabaseClient): Promise<CastTvLibraryState | null> {
  try {
    const { loadAdminSettingsJsonKey } = await import("@/lib/admin/settings-json-store");
    const stored = await withTimeoutFallback(
      loadAdminSettingsJsonKey(supabase, CAST_TV_LIBRARY_SETTINGS_KEY, parseCastTvLibrary, emptyCastTvLibrary()),
      1_500,
      null
    );
    if (!stored?.media.length) return null;
    return hydrateLibraryUrls(supabase, stored);
  } catch {
    return null;
  }
}

function rememberLastGoodLibrary(library: CastTvLibraryState) {
  if (!library.media.length) return;
  setTtlCache(CAST_TV_LAST_GOOD_CACHE_KEY, library, CAST_TV_LAST_GOOD_TTL_MS);
}

function lastGoodLibrary(): CastTvLibraryState | null {
  return getTtlCache<CastTvLibraryState>(CAST_TV_LAST_GOOD_CACHE_KEY);
}

function hydrateLibraryUrls(supabase: SupabaseClient, library: CastTvLibraryState): CastTvLibraryState {
  return {
    ...library,
    media: library.media.map((item) => {
      if (item.public_url?.startsWith("/assets/") || item.storage_path.startsWith("builtin/")) {
        return item;
      }
      return {
        ...item,
        public_url:
          item.public_url ||
          publicUrlForCastTvStorage(supabase, item.storage_path, item.updated_at, item.bucket || CAST_TV_STORAGE_BUCKET)
      };
    })
  };
}

export async function loadCastTvLibrary(
  supabase: SupabaseClient,
  options: { recoverOrphans?: boolean } = {}
): Promise<CastTvLibraryState> {
  try {
    const stored = await downloadJsonObject(supabase, CAST_TV_LIBRARY_OBJECT_PATH);
    let library = hydrateLibraryUrls(supabase, parseCastTvLibrary(stored));
    let added = 0;

    const legacy = await loadLegacySettingsLibrary(supabase);
    if (legacy) {
      const merged = mergeCastTvLibraries(library, legacy);
      library = merged.library;
      added += merged.added;
    }

    if (options.recoverOrphans !== false) {
      try {
        const recovered = hydrateLibraryUrls(supabase, await recoverOrphanedCastTvFiles(supabase, library));
        const merged = mergeCastTvLibraries(library, recovered);
        library = merged.library;
        added += merged.added;
      } catch {
        /* keep parsed library */
      }
    }

    const purged = purgeDuplicateCastTvMedia(library.media);
    library = { ...library, media: purged.kept };

    if (!library.media.some((item) => item.is_enabled !== false)) {
      const builtins = {
        ...emptyCastTvLibrary(),
        media: builtinMarketingCastTvMedia(),
        settings: library.settings
      };
      const merged = mergeCastTvLibraries(library, builtins);
      library = merged.library;
      added += merged.added;
    }

    library = hydrateLibraryUrls(supabase, {
      ...library,
      media: purgeDuplicateCastTvMedia(library.media).kept
    });
    if (added > 0 || purged.removed.length > 0) {
      try {
        await saveCastTvLibrary(supabase, library);
        if (purged.removed.length) {
          await deleteRemovedCastTvStorage(supabase, purged.removed);
        }
      } catch (error) {
        console.error("[cast-tv] persist recovered playlist failed:", error);
      }
    }
    if (library.media.length) rememberLastGoodLibrary(library);
    else {
      const cached = lastGoodLibrary();
      if (cached?.media.length) {
        return hydrateLibraryUrls(supabase, {
          ...cached,
          media: purgeDuplicateCastTvMedia(cached.media).kept
        });
      }
    }
    return library;
  } catch (error) {
    const cached = lastGoodLibrary();
    if (cached) {
      return hydrateLibraryUrls(supabase, {
        ...cached,
        media: purgeDuplicateCastTvMedia(cached.media).kept
      });
    }
    throw error;
  }
}

export async function deleteRemovedCastTvStorage(
  supabase: SupabaseClient,
  items: CastTvMediaRecord[]
) {
  const targets = items.filter(
    (item) =>
      !isLocalCastTvAsset(item) &&
      Boolean(item.storage_path) &&
      !item.storage_path.startsWith("builtin/")
  );
  await Promise.all(
    targets.map(async (item) => {
      const buckets = [
        ...new Set(
          [item.bucket, CAST_TV_STORAGE_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET].filter(
            (bucket): bucket is string => Boolean(bucket)
          )
        )
      ];
      for (const bucket of buckets) {
        try {
          await supabase.storage.from(bucket).remove([item.storage_path]);
        } catch {
          /* playlist no longer references the copy */
        }
      }
    })
  );
}

export async function saveCastTvLibrary(supabase: SupabaseClient, state: CastTvLibraryState) {
  await uploadJsonObject(supabase, CAST_TV_LIBRARY_OBJECT_PATH, {
    media: state.media,
    settings: state.settings
  });
  rememberLastGoodLibrary(state);
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

export async function loadCastTvHeartbeats(
  supabase: SupabaseClient
): Promise<Record<string, CastTvHeartbeatRecord>> {
  const stored = await downloadJsonObject(supabase, CAST_TV_HEARTBEATS_OBJECT_PATH);
  return parseCastTvHeartbeats(stored);
}

export async function saveCastTvHeartbeats(
  supabase: SupabaseClient,
  heartbeats: Record<string, CastTvHeartbeatRecord>
) {
  await uploadJsonObject(supabase, CAST_TV_HEARTBEATS_OBJECT_PATH, heartbeats);
}

export async function mutateCastTvHeartbeats<T>(
  supabase: SupabaseClient,
  mutator: (
    heartbeats: Record<string, CastTvHeartbeatRecord>
  ) => { heartbeats: Record<string, CastTvHeartbeatRecord>; result: T }
): Promise<T> {
  const current = await loadCastTvHeartbeats(supabase);
  const { heartbeats, result } = mutator(current);
  await saveCastTvHeartbeats(supabase, heartbeats);
  return result;
}

export async function loadCastTvRefreshNonce(supabase: SupabaseClient): Promise<number> {
  const stored = await downloadJsonObject(supabase, CAST_TV_REFRESH_OBJECT_PATH);
  return parseCastTvRefreshNonce(stored);
}

export async function saveCastTvRefreshNonce(supabase: SupabaseClient, nonce: number) {
  const nextNonce = parseCastTvRefreshNonce({ nonce });
  await uploadJsonObject(supabase, CAST_TV_REFRESH_OBJECT_PATH, {
    nonce: nextNonce,
    updatedAt: new Date().toISOString()
  } satisfies CastTvRefreshState);
}
