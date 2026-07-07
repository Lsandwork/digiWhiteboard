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

export function buildCastVideoStoragePath(options: {
  fileName: string;
  kind: "video" | "thumbnail";
  noticeId?: string;
}) {
  const ext = options.fileName.split(".").pop() || (options.kind === "video" ? "mp4" : "jpg");
  const folder = options.noticeId ?? `draft-${Date.now()}`;
  return `${folder}/${options.kind}-${Date.now()}-${sanitizeFileName(options.fileName || `upload.${ext}`)}`;
}

export async function createCastVideoSignedUpload(options: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: "video" | "thumbnail";
  noticeId?: string;
}) {
  if (options.kind === "video") {
    validateCastVideoUpload({ name: options.fileName, type: options.mimeType, size: options.fileSize } as File);
  } else {
    validateCastThumbnailUpload({ name: options.fileName, type: options.mimeType, size: options.fileSize } as File);
  }

  const supabase = getServiceSupabase();
  const storagePath = buildCastVideoStoragePath({
    fileName: options.fileName,
    kind: options.kind,
    noticeId: options.noticeId
  });

  const { data, error } = await supabase.storage.from(CAST_VIDEO_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Unable to prepare cast video upload.");
  }

  return {
    storage_path: storagePath,
    signed_upload_url: data.signedUrl,
    token: data.token,
    mime_type: options.mimeType,
    file_size_bytes: options.fileSize
  };
}

export async function finalizeCastVideoUpload(options: {
  storagePath: string;
  mimeType: string;
  fileSize: number;
}) {
  const supabase = getServiceSupabase();
  const { data } = await supabase.storage.from(CAST_VIDEO_BUCKET).createSignedUrl(options.storagePath, 60 * 60 * 24);
  return {
    storage_path: options.storagePath,
    signed_url: data?.signedUrl ?? null,
    mime_type: options.mimeType,
    file_size_bytes: options.fileSize
  };
}

export async function uploadCastVideoAsset(options: {
  file: File;
  kind: "video" | "thumbnail";
  noticeId?: string;
}) {
  validateCastVideoUpload(options.file);
  const supabase = getServiceSupabase();
  const path = buildCastVideoStoragePath({
    fileName: options.file.name,
    kind: options.kind,
    noticeId: options.noticeId
  });

  const buffer = Buffer.from(await options.file.arrayBuffer());
  const { error } = await supabase.storage.from(CAST_VIDEO_BUCKET).upload(path, buffer, {
    contentType: options.file.type,
    upsert: false
  });

  if (error) {
    throw new Error(error.message || "Unable to upload cast video.");
  }

  return finalizeCastVideoUpload({
    storagePath: path,
    mimeType: options.file.type,
    fileSize: options.file.size
  });
}

export async function uploadCastThumbnailAsset(file: File, noticeId?: string) {
  validateCastThumbnailUpload(file);
  const supabase = getServiceSupabase();
  const path = buildCastVideoStoragePath({
    fileName: file.name,
    kind: "thumbnail",
    noticeId
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(CAST_VIDEO_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw new Error(error.message || "Unable to upload thumbnail.");
  return finalizeCastVideoUpload({
    storagePath: path,
    mimeType: file.type,
    fileSize: file.size
  });
}
