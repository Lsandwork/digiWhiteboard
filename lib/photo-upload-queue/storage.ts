import { createHash, randomUUID } from "node:crypto";
import {
  PHOTO_UPLOAD_ALLOWED_MIME,
  PHOTO_UPLOAD_BUCKET,
  PHOTO_UPLOAD_MAX_BYTES,
  PHOTO_UPLOAD_SIGNED_URL_SECONDS
} from "@/lib/photo-upload-queue/types";
import { getServiceSupabase } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof getServiceSupabase>;

export function sanitizePhotoFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "photo";
}

export function validatePhotoUploadFile(input: { name: string; type: string; size: number }) {
  const mime = (input.type || "").toLowerCase();
  const ext = input.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExt = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);
  if (!PHOTO_UPLOAD_ALLOWED_MIME.has(mime) && !allowedExt.has(ext)) {
    throw new Error("Only JPG, JPEG, PNG, HEIC, and WEBP photos are supported.");
  }
  if (input.size <= 0) throw new Error("File is empty.");
  if (input.size > PHOTO_UPLOAD_MAX_BYTES) {
    throw new Error("Each photo must be 25MB or smaller.");
  }
}

export function sha256Hex(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function buildPhotoStoragePath(options: {
  batchId: string;
  kind: "originals" | "thumbnails" | "gingr-ready" | "exports";
  fileName: string;
  ext?: string;
}) {
  const safe = sanitizePhotoFileName(options.fileName);
  const ext = (options.ext || options.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${options.kind}/${options.batchId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safe}.${ext}`;
}

export async function uploadPhotoBuffer(
  supabase: SupabaseClient,
  path: string,
  buffer: Buffer,
  contentType: string
) {
  // Use Blob + a fresh Uint8Array so Vercel/undici never UTF-8–stringifies Node Buffers
  // (that corruption turns JPEG SOI FF D8 FF into EF BF BD and breaks Preview/Safari).
  const bytes = Uint8Array.from(buffer);
  const body = new Blob([bytes], { type: contentType || "application/octet-stream" });
  const { error } = await supabase.storage.from(PHOTO_UPLOAD_BUCKET).upload(path, body, {
    contentType,
    upsert: false
  });
  if (error) throw new Error(error.message || "Unable to upload photo to storage.");

  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const fileName = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
  const { data: listed, error: listError } = await supabase.storage
    .from(PHOTO_UPLOAD_BUCKET)
    .list(folder || undefined, { search: fileName, limit: 5 });
  if (!listError) {
    const match = (listed ?? []).find((row) => row.name === fileName);
    const storedSize = Number(
      (match?.metadata as { size?: number } | null | undefined)?.size ?? 0
    );
    if (storedSize > 0 && storedSize !== bytes.byteLength) {
      await supabase.storage.from(PHOTO_UPLOAD_BUCKET).remove([path]);
      throw new Error(
        "Photo storage integrity check failed (file was corrupted during upload). Please try again."
      );
    }
  }

  return path;
}

export async function createPhotoSignedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresIn = PHOTO_UPLOAD_SIGNED_URL_SECONDS
) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(PHOTO_UPLOAD_BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function downloadPhotoBuffer(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from(PHOTO_UPLOAD_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Unable to download photo.");
  return Buffer.from(await data.arrayBuffer());
}

export async function removePhotoPaths(supabase: SupabaseClient, paths: string[]) {
  const clean = paths.filter(Boolean);
  if (!clean.length) return;
  await supabase.storage.from(PHOTO_UPLOAD_BUCKET).remove(clean);
}
