import { randomUUID } from "node:crypto";
import { LOBBY_SLIDESHOW_BUCKET } from "@/lib/lobby/slideshow-uploads";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Stay under Vercel’s ~4.5MB request body limit after multipart overhead. */
export const PUSH_NOTICE_IMAGE_MAX_BYTES = 3_500_000;
export const PUSH_NOTICE_IMAGE_MAX_URL_LENGTH = 2000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png"
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

export function inferPushNoticeImageContentType(filename?: string | null, mime?: string | null) {
  const declared = String(mime || "")
    .trim()
    .toLowerCase()
    .split(";")[0]!
    .trim();
  const aliased = TYPE_ALIASES[declared] || declared;
  if (ALLOWED_MIME.has(aliased)) return aliased;

  const ext = String(filename || "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return null;
}

export function sanitizePushNoticeImageFilename(filename?: string | null) {
  const base = String(filename || "notice-image")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  return base || "notice-image";
}

export function assertPushNoticeImageUpload(input: {
  name?: string | null;
  type?: string | null;
  size?: number | null;
}) {
  const size = Number(input.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Choose an image to upload.");
  }
  if (size > PUSH_NOTICE_IMAGE_MAX_BYTES) {
    throw new Error("Notice images must be 3.5 MB or smaller.");
  }
  const contentType = inferPushNoticeImageContentType(input.name, input.type);
  if (!contentType) {
    throw new Error("Upload a JPG, PNG, WEBP, or GIF image.");
  }
  return {
    contentType,
    filename: sanitizePushNoticeImageFilename(input.name)
  };
}

export function normalizePushNoticeImageUrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Data URLs are preview-only (demo) — allow them past the short https URL length cap.
  if (raw.startsWith("data:image/")) {
    if (raw.length > 400_000) {
      throw new Error("Inline image is too large. Upload the file instead.");
    }
    return raw;
  }

  if (raw.length > PUSH_NOTICE_IMAGE_MAX_URL_LENGTH) {
    throw new Error("Image URL is too long.");
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw.slice(0, PUSH_NOTICE_IMAGE_MAX_URL_LENGTH);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Image URL must be a valid http(s) link.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Image URL must use http or https.");
  }
  return parsed.toString();
}

function buildStoragePath(filename: string, contentType: string) {
  const ext = EXT_BY_MIME[contentType] || filename.split(".").pop()?.toLowerCase() || "jpg";
  const safe = sanitizePushNoticeImageFilename(filename).replace(/\.[^.]+$/, "");
  return `push-notices/${Date.now()}-${randomUUID().slice(0, 8)}-${safe}.${ext}`;
}

export async function uploadPushNoticeImage(
  supabase: SupabaseClient,
  input: {
    bytes: Uint8Array;
    filename: string;
    contentType: string;
  }
) {
  const storagePath = buildStoragePath(input.filename, input.contentType);
  // Fresh Uint8Array + Blob — same pattern as photo-upload-queue (avoids Buffer corruption).
  const bytes = Uint8Array.from(input.bytes);
  const body = new Blob([bytes], { type: input.contentType });
  const { error } = await supabase.storage.from(LOBBY_SLIDESHOW_BUCKET).upload(storagePath, body, {
    contentType: input.contentType,
    upsert: false,
    cacheControl: "3600"
  });
  if (error) {
    throw new Error(error.message || "Unable to upload notice image.");
  }

  const { data } = supabase.storage.from(LOBBY_SLIDESHOW_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) {
    throw new Error("Unable to resolve public image URL.");
  }

  return {
    image_url: data.publicUrl,
    storage_path: storagePath,
    content_type: input.contentType
  };
}
