import {
  CAST_TV_IMAGE_DURATION_OPTIONS,
  CAST_TV_SETTINGS_ID,
  type CastTvImageDuration,
  type CastTvMediaRecord,
  type CastTvMediaType,
  type CastTvObjectFit,
  type CastTvPlaylistItem,
  type CastTvSettings,
  type CastTvTransitionStyle
} from "@/lib/cast-tv/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const CAST_TV_BUCKET = "cast-tv-media";

export const CAST_TV_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const CAST_TV_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export const CAST_TV_ALLOWED_MIME = new Set([...CAST_TV_IMAGE_MIME, ...CAST_TV_VIDEO_MIME]);

export const CAST_TV_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const CAST_TV_VIDEO_MAX_BYTES = 250 * 1024 * 1024;

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

export function mediaTypeForMime(mimeType: string): CastTvMediaType | null {
  if (CAST_TV_IMAGE_MIME.has(mimeType)) return "image";
  if (CAST_TV_VIDEO_MIME.has(mimeType)) return "video";
  return null;
}

export function validateCastTvUpload(file: { name: string; type: string; size: number }) {
  const mediaType = mediaTypeForMime(file.type);
  if (!mediaType) {
    throw new Error("Upload JPG, JPEG, PNG, WEBP, MP4, WEBM, or MOV files only.");
  }
  const maxBytes = mediaType === "image" ? CAST_TV_IMAGE_MAX_BYTES : CAST_TV_VIDEO_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new Error(
      mediaType === "image"
        ? "Images must be 20MB or smaller."
        : "Videos must be 250MB or smaller."
    );
  }
  if (mediaType === "video" && file.type === "video/quicktime") {
    // MOV may not autoplay on all TVs — still allowed but warn at upload time in admin UI via mime note.
  }
  return mediaType;
}

export function buildCastTvStoragePath(fileName: string) {
  const ext = (fileName.split(".").pop() || "bin").toLowerCase();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `media/${id}.${sanitizeFileName(ext)}`;
}

export function publicUrlForCastTvPath(supabase: SupabaseClient, storagePath: string, updatedAt?: string) {
  const { data } = supabase.storage.from(CAST_TV_BUCKET).getPublicUrl(storagePath);
  if (!updatedAt) return data.publicUrl;
  const version = encodeURIComponent(updatedAt);
  return `${data.publicUrl}?v=${version}`;
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
  let query = supabase
    .from("cast_tv_media")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (options.enabledOnly) {
    query = query.eq("is_enabled", true);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data ?? []) as CastTvMediaRecord[];
}

export async function buildCastTvPlaylist(supabase: SupabaseClient): Promise<CastTvPlaylistItem[]> {
  const records = await loadCastTvMedia(supabase, { enabledOnly: true });
  return records
    .filter((record) => Boolean(record.public_url))
    .map((record) => withCacheBustedSrc(mediaRecordToPlaylistItem(record)));
}

export async function findDuplicateCastTvUpload(
  supabase: SupabaseClient,
  input: { fileName: string; fileSize: number }
) {
  const normalizedName = input.fileName.trim().toLowerCase();
  const { data, error } = await supabase
    .from("cast_tv_media")
    .select("id, file_name, file_size_bytes")
    .eq("file_name", normalizedName)
    .eq("file_size_bytes", input.fileSize)
    .maybeSingle();

  if (error && error.code !== "42P01") throw error;
  return (data as CastTvMediaRecord | null) ?? null;
}

export async function createCastTvSignedUpload(
  supabase: SupabaseClient,
  input: { fileName: string; mimeType: string; fileSize: number }
) {
  validateCastTvUpload({ name: input.fileName, type: input.mimeType, size: input.fileSize });

  const duplicate = await findDuplicateCastTvUpload(supabase, {
    fileName: input.fileName,
    fileSize: input.fileSize
  });
  if (duplicate) {
    throw new Error("This file already exists in the CAST-TV library.");
  }

  const storagePath = buildCastTvStoragePath(input.fileName);
  const { data, error } = await supabase.storage.from(CAST_TV_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Unable to prepare CAST-TV upload.");
  }

  return {
    storage_path: storagePath,
    signed_upload_url: data.signedUrl,
    token: data.token,
    mime_type: input.mimeType,
    file_size_bytes: input.fileSize,
    media_type: mediaTypeForMime(input.mimeType)!
  };
}

export async function createCastTvMediaRecord(
  supabase: SupabaseClient,
  input: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    displayName?: string | null;
    uploadedBy?: string | null;
    uploadedByName?: string | null;
    imageDisplaySeconds?: CastTvImageDuration;
  }
) {
  const mediaType = validateCastTvUpload({
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

  const settings = await loadCastTvSettings(supabase);
  const existing = await loadCastTvMedia(supabase);
  const nextOrder = existing.reduce((max, item) => Math.max(max, item.display_order), 0) + 1;
  const now = new Date().toISOString();
  const publicUrl = publicUrlForCastTvPath(supabase, input.storagePath, now);

  const { data, error } = await supabase
    .from("cast_tv_media")
    .insert({
      display_name: input.displayName?.trim() || displayNameFromFileName(input.fileName),
      file_name: input.fileName.trim(),
      storage_path: input.storagePath,
      public_url: publicUrl,
      media_type: mediaType,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSize,
      image_display_seconds: input.imageDisplaySeconds ?? settings.default_image_seconds,
      display_order: nextOrder,
      uploaded_by: input.uploadedBy ?? null,
      uploaded_by_name: input.uploadedByName ?? null
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as CastTvMediaRecord;
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
  const { data, error } = await supabase
    .from("cast_tv_media")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Media item not found.");
  return data as CastTvMediaRecord;
}

export async function replaceCastTvMediaFile(
  supabase: SupabaseClient,
  id: string,
  input: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
  }
) {
  const mediaType = validateCastTvUpload({
    name: input.fileName,
    type: input.mimeType,
    size: input.fileSize
  });

  const { data: existing, error: loadError } = await supabase
    .from("cast_tv_media")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!existing) throw new Error("Media item not found.");

  const now = new Date().toISOString();
  const publicUrl = publicUrlForCastTvPath(supabase, input.storagePath, now);

  const { data, error } = await supabase
    .from("cast_tv_media")
    .update({
      file_name: input.fileName.trim(),
      storage_path: input.storagePath,
      public_url: publicUrl,
      media_type: mediaType,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSize,
      duration_seconds: null,
      display_name: existing.display_name || displayNameFromFileName(input.fileName)
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  if (existing.storage_path && existing.storage_path !== input.storagePath) {
    await supabase.storage.from(CAST_TV_BUCKET).remove([existing.storage_path]);
  }

  return data as CastTvMediaRecord;
}

export async function deleteCastTvMediaRecord(supabase: SupabaseClient, id: string) {
  const { data: existing, error: loadError } = await supabase
    .from("cast_tv_media")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!existing) throw new Error("Media item not found.");

  const { error: deleteError } = await supabase.from("cast_tv_media").delete().eq("id", id);
  if (deleteError) throw deleteError;

  if (existing.storage_path) {
    await supabase.storage.from(CAST_TV_BUCKET).remove([existing.storage_path]);
  }

  return existing as CastTvMediaRecord;
}

export async function reorderCastTvMedia(supabase: SupabaseClient, orderedIds: string[]) {
  if (!orderedIds.length) return [];

  const existing = await loadCastTvMedia(supabase);
  const known = new Set(existing.map((item) => item.id));
  for (const id of orderedIds) {
    if (!known.has(id)) throw new Error("One or more media items were not found.");
  }

  const updates = orderedIds.map((id, index) =>
    supabase.from("cast_tv_media").update({ display_order: index + 1 }).eq("id", id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  return loadCastTvMedia(supabase);
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
  const { data, error } = await supabase
    .from("cast_tv_settings")
    .select("*")
    .eq("id", CAST_TV_SETTINGS_ID)
    .maybeSingle();

  if (error && error.code !== "42P01") throw error;

  if (data) return data as CastTvSettings;

  const { data: inserted, error: insertError } = await supabase
    .from("cast_tv_settings")
    .insert({ id: CAST_TV_SETTINGS_ID })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted as CastTvSettings;
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

  await loadCastTvSettings(supabase);

  const { data, error } = await supabase
    .from("cast_tv_settings")
    .update(patch)
    .eq("id", CAST_TV_SETTINGS_ID)
    .select("*")
    .single();

  if (error) throw error;
  return data as CastTvSettings;
}

export async function recordCastTvHeartbeat(
  supabase: SupabaseClient,
  input: { screenId: string; userAgent?: string | null }
) {
  const screenId = input.screenId.trim() || "default";
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("cast_tv_heartbeats")
    .upsert(
      {
        screen_id: screenId,
        last_seen_at: now,
        user_agent: input.userAgent ?? null
      },
      { onConflict: "screen_id" }
    )
    .select("screen_id, last_seen_at")
    .single();

  if (error) throw error;
  return data;
}

export async function loadCastTvHeartbeat(
  supabase: SupabaseClient,
  screenId = "default"
) {
  const { data, error } = await supabase
    .from("cast_tv_heartbeats")
    .select("screen_id, last_seen_at")
    .eq("screen_id", screenId)
    .maybeSingle();

  if (error && error.code !== "42P01") throw error;
  return data;
}

export function isCastTvOnline(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return now - seen <= 90_000;
}
