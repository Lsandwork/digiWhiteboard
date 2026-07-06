import { CAST_VIDEO_ALLOWED_MIME, CAST_VIDEO_BUCKET, CAST_VIDEO_MAX_BYTES } from "@/lib/staff/cast-video-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export function validateCastVideoUpload(file: File) {
  if (!CAST_VIDEO_ALLOWED_MIME.has(file.type)) {
    throw new Error("Only MP4, WebM, and MOV videos are supported.");
  }
  if (file.size > CAST_VIDEO_MAX_BYTES) {
    throw new Error("Video must be 250MB or smaller.");
  }
}

export function validateCastThumbnailUpload(file: File) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) {
    throw new Error("Thumbnail must be JPEG, PNG, or WebP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Thumbnail must be 5MB or smaller.");
  }
}

export async function uploadCastVideoAsset(options: {
  file: File;
  kind: "video" | "thumbnail";
  noticeId?: string;
}) {
  validateCastVideoUpload(options.file);
  const supabase = getServiceSupabase();
  const ext = options.file.name.split(".").pop() || (options.kind === "video" ? "mp4" : "jpg");
  const folder = options.noticeId ?? `draft-${Date.now()}`;
  const path = `${folder}/${options.kind}-${Date.now()}-${sanitizeFileName(options.file.name || `upload.${ext}`)}`;

  const buffer = Buffer.from(await options.file.arrayBuffer());
  const { error } = await supabase.storage.from(CAST_VIDEO_BUCKET).upload(path, buffer, {
    contentType: options.file.type,
    upsert: false
  });

  if (error) {
    throw new Error(error.message || "Unable to upload cast video.");
  }

  const { data } = await supabase.storage.from(CAST_VIDEO_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  return {
    storage_path: path,
    signed_url: data?.signedUrl ?? null,
    mime_type: options.file.type,
    file_size_bytes: options.file.size
  };
}

export async function uploadCastThumbnailAsset(file: File, noticeId?: string) {
  validateCastThumbnailUpload(file);
  const supabase = getServiceSupabase();
  const ext = file.name.split(".").pop() || "jpg";
  const folder = noticeId ?? `draft-${Date.now()}`;
  const path = `${folder}/thumbnail-${Date.now()}-${sanitizeFileName(file.name || `thumb.${ext}`)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(CAST_VIDEO_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw new Error(error.message || "Unable to upload thumbnail.");
  const { data } = await supabase.storage.from(CAST_VIDEO_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  return {
    storage_path: path,
    signed_url: data?.signedUrl ?? null
  };
}
