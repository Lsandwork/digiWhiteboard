import { LOBBY_IDLE_SLIDESHOW, type LobbySlideshowSlide } from "@/lib/lobby/slideshow";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const LOBBY_SLIDESHOW_BUCKET = "lobby-slideshow";

export const LOBBY_SLIDESHOW_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

export const LOBBY_SLIDESHOW_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

export const LOBBY_SLIDESHOW_ALLOWED_MIME = new Set([
  ...LOBBY_SLIDESHOW_IMAGE_MIME,
  ...LOBBY_SLIDESHOW_VIDEO_MIME
]);

export const LOBBY_SLIDESHOW_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const LOBBY_SLIDESHOW_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export type LobbySlideshowUploadRecord = {
  id: string;
  title: string;
  media_type: "image" | "video";
  storage_path: string;
  media_url: string;
  poster_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function titleFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base || "Lobby slideshow upload";
}

export function mediaTypeForMime(mimeType: string): "image" | "video" | null {
  if (LOBBY_SLIDESHOW_IMAGE_MIME.has(mimeType)) return "image";
  if (LOBBY_SLIDESHOW_VIDEO_MIME.has(mimeType)) return "video";
  return null;
}

export function validateLobbySlideshowUpload(file: { name: string; type: string; size: number }) {
  const mediaType = mediaTypeForMime(file.type);
  if (!mediaType) {
    throw new Error("Upload photos (JPG, PNG, WebP, GIF) or videos (MP4, WebM, MOV).");
  }
  const maxBytes = mediaType === "image" ? LOBBY_SLIDESHOW_IMAGE_MAX_BYTES : LOBBY_SLIDESHOW_VIDEO_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new Error(
      mediaType === "image"
        ? "Photos must be 15MB or smaller."
        : "Videos must be 100MB or smaller."
    );
  }
  return mediaType;
}

export function buildLobbySlideshowStoragePath(fileName: string) {
  const ext = fileName.split(".").pop() || "bin";
  return `uploads/${Date.now()}-${sanitizeFileName(fileName || `upload.${ext}`)}`;
}

export function publicUrlForLobbySlideshowPath(supabase: SupabaseClient, storagePath: string) {
  const { data } = supabase.storage.from(LOBBY_SLIDESHOW_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function loadLobbySlideshowUploads(
  supabase: SupabaseClient,
  options: { activeOnly?: boolean } = {}
): Promise<LobbySlideshowUploadRecord[]> {
  let query = supabase
    .from("lobby_slideshow_uploads")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (options.activeOnly) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  return (data ?? []) as LobbySlideshowUploadRecord[];
}

export function uploadRecordToSlide(record: LobbySlideshowUploadRecord): LobbySlideshowSlide {
  return {
    id: record.id,
    src: record.media_url,
    alt: record.title || "Lobby slideshow upload",
    mediaType: record.media_type,
    poster: record.poster_url,
    uploaded: true
  };
}

export function mergeLobbySlideshowSlides(uploads: LobbySlideshowUploadRecord[]): LobbySlideshowSlide[] {
  const builtIn = LOBBY_IDLE_SLIDESHOW.map((slide) => ({
    ...slide,
    mediaType: "image" as const,
    uploaded: false
  }));
  const uploaded = uploads.filter((item) => item.active).map(uploadRecordToSlide);
  return [...builtIn, ...uploaded];
}

export async function buildLobbySlideshowSlides(supabase: SupabaseClient): Promise<LobbySlideshowSlide[]> {
  const uploads = await loadLobbySlideshowUploads(supabase, { activeOnly: true });
  return mergeLobbySlideshowSlides(uploads);
}

export async function createLobbySlideshowSignedUpload(
  supabase: SupabaseClient,
  input: { fileName: string; mimeType: string; fileSize: number }
) {
  validateLobbySlideshowUpload({ name: input.fileName, type: input.mimeType, size: input.fileSize });
  const storagePath = buildLobbySlideshowStoragePath(input.fileName);
  const { data, error } = await supabase.storage.from(LOBBY_SLIDESHOW_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Unable to prepare slideshow upload.");
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

export async function createLobbySlideshowUploadRecord(
  supabase: SupabaseClient,
  input: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    createdBy?: string | null;
    title?: string | null;
  }
) {
  const mediaType = validateLobbySlideshowUpload({
    name: input.fileName,
    type: input.mimeType,
    size: input.fileSize
  });
  const mediaUrl = publicUrlForLobbySlideshowPath(supabase, input.storagePath);
  const existing = await loadLobbySlideshowUploads(supabase);
  const nextSort =
    existing.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1;

  const { data, error } = await supabase
    .from("lobby_slideshow_uploads")
    .insert({
      title: input.title?.trim() || titleFromFileName(input.fileName),
      media_type: mediaType,
      storage_path: input.storagePath,
      media_url: mediaUrl,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSize,
      sort_order: nextSort,
      created_by: input.createdBy ?? null
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as LobbySlideshowUploadRecord;
}

export async function deleteLobbySlideshowUpload(supabase: SupabaseClient, id: string) {
  const { data: existing, error: loadError } = await supabase
    .from("lobby_slideshow_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!existing) throw new Error("Upload not found.");

  const { error: deleteError } = await supabase.from("lobby_slideshow_uploads").delete().eq("id", id);
  if (deleteError) throw deleteError;

  if (existing.storage_path) {
    await supabase.storage.from(LOBBY_SLIDESHOW_BUCKET).remove([existing.storage_path]);
  }

  return existing as LobbySlideshowUploadRecord;
}
