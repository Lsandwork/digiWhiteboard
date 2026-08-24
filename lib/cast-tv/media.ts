import { normalizeAdminUserId } from "@/lib/admin/users";
import { validateCastTvUpload } from "@/lib/cast-tv/mime";
import {
  CAST_TV_LEGACY_MEDIA_BUCKET,
  CAST_TV_STORAGE_BUCKET,
  defaultCastTvSettings,
  loadCastTvHeartbeats,
  loadCastTvLibrary,
  mutateCastTvHeartbeats,
  mutateCastTvLibrary,
  publicUrlForCastTvStorage
} from "@/lib/cast-tv/library-store";
import {
  CAST_TV_IMAGE_DURATION_OPTIONS,
  CAST_TV_SETTINGS_ID,
  type CastTvImageDuration,
  type CastTvMediaRecord,
  type CastTvObjectFit,
  type CastTvPlaylistItem,
  type CastTvSettings,
  type CastTvTransitionStyle
} from "@/lib/cast-tv/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Production CAST-TV Postgres tables hang; files go in the working lobby slideshow bucket. */
export const CAST_TV_BUCKET = CAST_TV_STORAGE_BUCKET;

export {
  CAST_TV_ALLOWED_MIME,
  CAST_TV_IMAGE_MAX_BYTES,
  CAST_TV_IMAGE_MIME,
  CAST_TV_SERVER_UPLOAD_MAX_BYTES,
  CAST_TV_VIDEO_MAX_BYTES,
  CAST_TV_VIDEO_MIME,
  inferCastTvMimeType,
  isHeicCastTvUpload,
  mediaTypeForMime,
  shouldUseCastTvServerUpload,
  validateCastTvUpload
} from "@/lib/cast-tv/mime";

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function displayNameFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base || "CAST-TV media";
}

export function buildCastTvStoragePath(fileName: string) {
  const ext = (fileName.split(".").pop() || "bin").toLowerCase();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `cast-tv/${id}.${sanitizeFileName(ext)}`;
}

export function publicUrlForCastTvPath(
  supabase: SupabaseClient,
  storagePath: string,
  updatedAt?: string,
  bucket = CAST_TV_BUCKET
) {
  return publicUrlForCastTvStorage(supabase, storagePath, updatedAt, bucket);
}

export function mediaRecordToPlaylistItem(record: CastTvMediaRecord): CastTvPlaylistItem {
  return {
    id: record.id,
    displayName: record.display_name?.trim() || displayNameFromFileName(record.file_name),
    mediaType: record.media_type,
    src: record.public_url || "",
    imageDisplaySeconds: record.image_display_seconds,
    durationSeconds: record.duration_seconds,
    updatedAt: record.updated_at
  };
}

export function withCacheBustedSrc(item: CastTvPlaylistItem): CastTvPlaylistItem {
  if (!item.src || item.src.includes("?v=")) return item;
  const version = encodeURIComponent(item.updatedAt);
  return { ...item, src: `${item.src}${item.src.includes("?") ? "&" : "?"}v=${version}` };
}

export async function loadCastTvMedia(
  supabase: SupabaseClient,
  options: { enabledOnly?: boolean } = {}
): Promise<CastTvMediaRecord[]> {
  const library = await loadCastTvLibrary(supabase);
  const records = library.media.map((record) => ({
    ...record,
    public_url:
      record.public_url ||
      publicUrlForCastTvPath(supabase, record.storage_path, record.updated_at, record.bucket || CAST_TV_BUCKET)
  }));
  if (options.enabledOnly) return records.filter((record) => record.is_enabled);
  return records;
}

export async function buildCastTvPlaylist(supabase: SupabaseClient): Promise<CastTvPlaylistItem[]> {
  const records = await loadCastTvMedia(supabase, { enabledOnly: true });
  return records
    .filter((record) => Boolean(record.public_url))
    .map((record) => withCacheBustedSrc(mediaRecordToPlaylistItem(record)));
}

export async function ensureCastTvBucket(_supabase: SupabaseClient) {
  // Files are stored in the existing lobby-slideshow bucket under cast-tv/.
}

export async function uploadCastTvObject(
  supabase: SupabaseClient,
  storagePath: string,
  buffer: Buffer | Uint8Array,
  contentType: string,
  bucket = CAST_TV_BUCKET
) {
  const bytes = Uint8Array.from(buffer);
  const body = new Blob([bytes], { type: contentType || "application/octet-stream" });
  const buckets = bucket === CAST_TV_BUCKET ? [CAST_TV_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET] : [bucket, CAST_TV_BUCKET];
  let lastMessage = "Unable to upload CAST-TV media.";
  for (const target of buckets) {
    const { error } = await supabase.storage.from(target).upload(storagePath, body, {
      contentType,
      upsert: false
    });
    if (!error) return target;
    lastMessage = error.message || lastMessage;
  }
  throw new Error(lastMessage);
}

export async function findDuplicateCastTvUpload(
  supabase: SupabaseClient,
  input: { fileName: string; fileSize: number }
) {
  try {
    const normalizedName = input.fileName.trim().toLowerCase();
    const existing = await loadCastTvMedia(supabase);
    return (
      existing.find(
        (row) =>
          row.file_name.trim().toLowerCase() === normalizedName && row.file_size_bytes === input.fileSize
      ) ?? null
    );
  } catch {
    return null;
  }
}

export async function createCastTvSignedUpload(
  supabase: SupabaseClient,
  input: { fileName: string; mimeType: string; fileSize: number }
) {
  const { mediaType, mimeType } = validateCastTvUpload({
    name: input.fileName,
    type: input.mimeType,
    size: input.fileSize
  });

  const duplicate = await findDuplicateCastTvUpload(supabase, {
    fileName: input.fileName,
    fileSize: input.fileSize
  });
  if (duplicate) {
    throw new Error("This file already exists in the CAST-TV library.");
  }

  const storagePath = buildCastTvStoragePath(input.fileName);
  const buckets = [CAST_TV_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET];
  let signedUrl: string | null = null;
  let token: string | undefined;
  let bucket = CAST_TV_BUCKET;
  let lastMessage = "Unable to prepare CAST-TV upload.";
  for (const target of buckets) {
    const { data, error } = await supabase.storage.from(target).createSignedUploadUrl(storagePath);
    if (!error && data?.signedUrl) {
      signedUrl = data.signedUrl;
      token = data.token;
      bucket = target;
      break;
    }
    lastMessage = error?.message || lastMessage;
  }
  if (!signedUrl) {
    throw new Error(lastMessage);
  }

  return {
    storage_path: storagePath,
    bucket,
    signed_upload_url: signedUrl,
    token,
    mime_type: mimeType,
    file_size_bytes: input.fileSize,
    media_type: mediaType
  };
}

function newMediaId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function createCastTvMediaRecord(
  supabase: SupabaseClient,
  input: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    bucket?: string | null;
    displayName?: string | null;
    uploadedBy?: string | null;
    uploadedByName?: string | null;
    imageDisplaySeconds?: CastTvImageDuration;
  }
) {
  const { mediaType, mimeType } = validateCastTvUpload({
    name: input.fileName,
    type: input.mimeType,
    size: input.fileSize
  });

  return mutateCastTvLibrary(supabase, (library) => {
    const byPath = library.media.find((row) => row.storage_path === input.storagePath);
    if (byPath) {
      return { state: library, result: byPath };
    }

    const duplicate = library.media.find(
      (row) =>
        row.file_name.trim().toLowerCase() === input.fileName.trim().toLowerCase() &&
        row.file_size_bytes === input.fileSize
    );
    if (duplicate) {
      throw new Error("This file already exists in the CAST-TV library.");
    }

    const now = new Date().toISOString();
    const bucket = input.bucket || CAST_TV_BUCKET;
    const record: CastTvMediaRecord = {
      id: newMediaId(),
      display_name: input.displayName?.trim() || displayNameFromFileName(input.fileName),
      file_name: input.fileName.trim(),
      storage_path: input.storagePath,
      bucket,
      public_url: publicUrlForCastTvPath(supabase, input.storagePath, now, bucket),
      media_type: mediaType,
      mime_type: mimeType,
      file_size_bytes: input.fileSize,
      duration_seconds: null,
      image_display_seconds: input.imageDisplaySeconds ?? library.settings.default_image_seconds,
      display_order: library.media.reduce((max, item) => Math.max(max, item.display_order), 0) + 1,
      is_enabled: true,
      uploaded_by: normalizeAdminUserId(input.uploadedBy),
      uploaded_by_name: input.uploadedByName ?? null,
      created_at: now,
      updated_at: now
    };

    return {
      state: { ...library, media: [...library.media, record] },
      result: record
    };
  });
}

export async function updateCastTvMediaRecord(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    display_name: string | null;
    is_enabled: boolean;
    image_display_seconds: CastTvImageDuration;
    display_order: number;
  }>
) {
  return mutateCastTvLibrary(supabase, (library) => {
    const index = library.media.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Media item not found.");
    const now = new Date().toISOString();
    const updated: CastTvMediaRecord = {
      ...library.media[index],
      ...patch,
      updated_at: now
    };
    const media = library.media.slice();
    media[index] = updated;
    return { state: { ...library, media }, result: updated };
  });
}

export async function replaceCastTvMediaFile(
  supabase: SupabaseClient,
  id: string,
  input: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    bucket?: string | null;
  }
) {
  const { mediaType, mimeType } = validateCastTvUpload({
    name: input.fileName,
    type: input.mimeType,
    size: input.fileSize
  });

  const replaced = await mutateCastTvLibrary(supabase, (library) => {
    const index = library.media.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Media item not found.");
    const existing = library.media[index];
    const now = new Date().toISOString();
    const bucket = input.bucket || existing.bucket || CAST_TV_BUCKET;
    const updated: CastTvMediaRecord = {
      ...existing,
      file_name: input.fileName.trim(),
      storage_path: input.storagePath,
      bucket,
      public_url: publicUrlForCastTvPath(supabase, input.storagePath, now, bucket),
      media_type: mediaType,
      mime_type: mimeType,
      file_size_bytes: input.fileSize,
      duration_seconds: null,
      display_name: existing.display_name || displayNameFromFileName(input.fileName),
      updated_at: now
    };
    const media = library.media.slice();
    media[index] = updated;
    return {
      state: { ...library, media },
      result: { updated, previousPath: existing.storage_path }
    };
  });

  if (replaced.previousPath && replaced.previousPath !== input.storagePath) {
    await supabase.storage.from(CAST_TV_BUCKET).remove([replaced.previousPath]);
  }

  return replaced.updated;
}

export async function deleteCastTvMediaRecord(supabase: SupabaseClient, id: string) {
  const existing = await mutateCastTvLibrary(supabase, (library) => {
    const record = library.media.find((item) => item.id === id);
    if (!record) throw new Error("Media item not found.");
    return {
      state: { ...library, media: library.media.filter((item) => item.id !== id) },
      result: record
    };
  });

  if (existing.storage_path) {
    await supabase.storage.from(CAST_TV_BUCKET).remove([existing.storage_path]);
  }

  return existing;
}

export async function reorderCastTvMedia(supabase: SupabaseClient, orderedIds: string[]) {
  if (!orderedIds.length) return [];

  return mutateCastTvLibrary(supabase, (library) => {
    const known = new Set(library.media.map((item) => item.id));
    for (const id of orderedIds) {
      if (!known.has(id)) throw new Error("One or more media items were not found.");
    }
    const now = new Date().toISOString();
    const order = new Map(orderedIds.map((id, index) => [id, index + 1]));
    const media = library.media
      .map((item) => ({
        ...item,
        display_order: order.get(item.id) ?? item.display_order,
        updated_at: order.has(item.id) ? now : item.updated_at
      }))
      .sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at));
    return { state: { ...library, media }, result: media };
  });
}

export async function moveCastTvMedia(
  supabase: SupabaseClient,
  id: string,
  direction: "up" | "down"
) {
  const items = await loadCastTvMedia(supabase);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Media item not found.");

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= items.length) return items;

  const reordered = [...items];
  const current = reordered[index];
  reordered[index] = reordered[swapIndex];
  reordered[swapIndex] = current;

  return reorderCastTvMedia(
    supabase,
    reordered.map((item) => item.id)
  );
}

export async function loadCastTvSettings(supabase: SupabaseClient): Promise<CastTvSettings> {
  const library = await loadCastTvLibrary(supabase, { recoverOrphans: false });
  return library.settings ?? defaultCastTvSettings();
}

export async function updateCastTvSettings(
  supabase: SupabaseClient,
  patch: Partial<{
    default_image_seconds: CastTvImageDuration;
    transition_ms: number;
    transition_style: CastTvTransitionStyle;
    object_fit: CastTvObjectFit;
    show_standby_logo: boolean;
    is_paused: boolean;
    updated_by: string | null;
  }>
) {
  if (
    patch.default_image_seconds !== undefined &&
    !CAST_TV_IMAGE_DURATION_OPTIONS.includes(patch.default_image_seconds)
  ) {
    throw new Error("Invalid default image duration.");
  }

  return mutateCastTvLibrary(supabase, (library) => {
    const settings: CastTvSettings = {
      ...library.settings,
      ...patch,
      id: CAST_TV_SETTINGS_ID,
      updated_by: patch.updated_by !== undefined ? normalizeAdminUserId(patch.updated_by) : library.settings.updated_by,
      updated_at: new Date().toISOString()
    };
    return { state: { ...library, settings }, result: settings };
  });
}

export async function recordCastTvHeartbeat(
  supabase: SupabaseClient,
  input: { screenId: string; userAgent?: string | null }
) {
  const screenId = input.screenId.trim() || "default";
  const now = new Date().toISOString();
  return mutateCastTvHeartbeats(supabase, (heartbeats) => {
    const heartbeat = {
      screen_id: screenId,
      last_seen_at: now,
      user_agent: input.userAgent ?? null
    };
    return {
      heartbeats: { ...heartbeats, [screenId]: heartbeat },
      result: heartbeat
    };
  });
}

export async function loadCastTvHeartbeat(
  supabase: SupabaseClient,
  screenId = "default"
) {
  const heartbeats = await loadCastTvHeartbeats(supabase);
  return heartbeats[screenId] ?? null;
}

export function isCastTvOnline(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return now - seen <= 90_000;
}
