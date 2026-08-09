import { createHash, randomUUID } from "node:crypto";
import {
  MEDIA_VIDEO_ALLOWED_MIME,
  MEDIA_VIDEO_MAX_BYTES,
  PHOTO_UPLOAD_BUCKET
} from "@/lib/photo-upload-queue/types";
import {
  buildPhotoStoragePath,
  createPhotoSignedUrl,
  sanitizePhotoFileName
} from "@/lib/photo-upload-queue/storage";
import { getServiceSupabase } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof getServiceSupabase>;

export function validateMediaVideoUpload(input: { name: string; type: string; size: number }) {
  const mime = (input.type || "").toLowerCase();
  const ext = input.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExt = new Set(["mp4", "webm", "mov"]);
  if (!MEDIA_VIDEO_ALLOWED_MIME.has(mime) && !allowedExt.has(ext)) {
    throw new Error("Only MP4, WebM, and MOV videos are supported.");
  }
  if (input.size <= 0) throw new Error("File is empty.");
  if (input.size > MEDIA_VIDEO_MAX_BYTES) {
    throw new Error("Each video must be 250MB or smaller.");
  }
}

export function validateMediaPosterUpload(input: { name: string; type: string; size: number }) {
  const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  const mime = (input.type || "").toLowerCase();
  if (!allowed.has(mime)) {
    throw new Error("Video preview must be JPEG, PNG, or WebP.");
  }
  if (input.size <= 0 || input.size > 5 * 1024 * 1024) {
    throw new Error("Video preview must be 5MB or smaller.");
  }
}

function extensionForVideo(fileName: string, mimeType: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "mp4" || ext === "webm" || ext === "mov") return ext;
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("quicktime")) return "mov";
  return "mp4";
}

export async function createMediaVideoSignedUpload(options: {
  batchId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: "video" | "poster";
}) {
  if (options.kind === "video") {
    validateMediaVideoUpload({
      name: options.fileName,
      type: options.mimeType,
      size: options.fileSize
    });
  } else {
    validateMediaPosterUpload({
      name: options.fileName,
      type: options.mimeType,
      size: options.fileSize
    });
  }

  const supabase = getServiceSupabase();
  const storagePath =
    options.kind === "video"
      ? buildPhotoStoragePath({
          batchId: options.batchId,
          kind: "originals",
          fileName: options.fileName,
          ext: extensionForVideo(options.fileName, options.mimeType)
        })
      : buildPhotoStoragePath({
          batchId: options.batchId,
          kind: "thumbnails",
          fileName: options.fileName || "poster.jpg",
          ext: "jpg"
        });

  const { data, error } = await supabase.storage
    .from(PHOTO_UPLOAD_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Unable to prepare media upload.");
  }

  return {
    storage_path: storagePath,
    signed_upload_url: data.signedUrl,
    token: data.token,
    mime_type: options.mimeType,
    file_size_bytes: options.fileSize,
    bucket: PHOTO_UPLOAD_BUCKET
  };
}

export async function assertStorageObjectExists(supabase: SupabaseClient, storagePath: string) {
  const folder = storagePath.includes("/") ? storagePath.slice(0, storagePath.lastIndexOf("/")) : "";
  const fileName = storagePath.includes("/")
    ? storagePath.slice(storagePath.lastIndexOf("/") + 1)
    : storagePath;
  const { data, error } = await supabase.storage
    .from(PHOTO_UPLOAD_BUCKET)
    .list(folder || undefined, { search: fileName, limit: 5 });
  if (error) throw new Error(error.message || "Unable to verify uploaded media.");
  const match = (data ?? []).find((row) => row.name === fileName);
  if (!match) throw new Error("Uploaded media was not found in cloud storage.");
  return Number((match.metadata as { size?: number } | null | undefined)?.size ?? 0);
}

/** Prefer client content hash; fall back to a stable storage fingerprint (no full download). */
export function resolveMediaSha256(input: {
  clientSha256?: string | null;
  storagePath: string;
  fileSize: number;
  fileName: string;
}) {
  const client = String(input.clientSha256 || "").trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(client)) return client;
  return createHash("sha256")
    .update(`${input.storagePath}:${input.fileSize}:${input.fileName}`)
    .digest("hex");
}

export async function createMediaPlaybackUrl(storagePath: string) {
  return createPhotoSignedUrl(getServiceSupabase(), storagePath);
}

export function buildVideoStoredFilename(fileName: string) {
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizePhotoFileName(fileName)}`;
}
