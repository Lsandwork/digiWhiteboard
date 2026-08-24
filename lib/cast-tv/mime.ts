export const CAST_TV_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const CAST_TV_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export const CAST_TV_HEIC_MIME = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence"
]);

export const CAST_TV_ALLOWED_MIME = new Set([
  ...CAST_TV_IMAGE_MIME,
  ...CAST_TV_VIDEO_MIME,
  ...CAST_TV_HEIC_MIME
]);

export const CAST_TV_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const CAST_TV_VIDEO_MAX_BYTES = 250 * 1024 * 1024;

/** Stay under Vercel’s ~4.5MB request body limit after multipart overhead. */
export const CAST_TV_SERVER_UPLOAD_MAX_BYTES = 3_500_000;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  qt: "video/quicktime"
};

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heif",
  "video/x-m4v": "video/mp4"
};

export function fileExtension(fileName: string) {
  return (fileName.split(".").pop() || "").trim().toLowerCase();
}

export function inferCastTvMimeType(fileName: string, mimeType?: string | null) {
  const raw = String(mimeType ?? "")
    .trim()
    .toLowerCase();
  if (raw && raw !== "application/octet-stream") {
    return MIME_ALIASES[raw] ?? raw;
  }
  return EXT_MIME[fileExtension(fileName)] || raw;
}

export function isHeicCastTvUpload(fileName: string, mimeType?: string | null) {
  const mime = inferCastTvMimeType(fileName, mimeType);
  const ext = fileExtension(fileName);
  return CAST_TV_HEIC_MIME.has(mime) || ext === "heic" || ext === "heif";
}

export function mediaTypeForMime(mimeType: string, fileName = ""): "image" | "video" | null {
  const mime = inferCastTvMimeType(fileName, mimeType);
  if (CAST_TV_IMAGE_MIME.has(mime) || isHeicCastTvUpload(fileName, mime)) return "image";
  if (CAST_TV_VIDEO_MIME.has(mime)) return "video";
  return null;
}

export function validateCastTvUpload(file: { name: string; type: string; size: number }) {
  const mime = inferCastTvMimeType(file.name, file.type);
  const mediaType = mediaTypeForMime(mime, file.name);
  if (!mediaType) {
    throw new Error("Upload JPG, JPEG, PNG, WEBP, HEIC, MP4, WEBM, or MOV files only.");
  }
  const maxBytes = mediaType === "image" ? CAST_TV_IMAGE_MAX_BYTES : CAST_TV_VIDEO_MAX_BYTES;
  if (file.size <= 0) {
    throw new Error("File is empty.");
  }
  if (file.size > maxBytes) {
    throw new Error(
      mediaType === "image" ? "Images must be 20MB or smaller." : "Videos must be 250MB or smaller."
    );
  }
  return { mediaType, mimeType: mime };
}

/** FormData fallback only for small HEIC files if the signed-URL path fails. JPEGs never go through Vercel. */
export function shouldUseCastTvServerUpload(file: { name: string; type: string; size: number }) {
  if (file.size <= 0 || file.size > CAST_TV_SERVER_UPLOAD_MAX_BYTES) return false;
  validateCastTvUpload(file);
  return isHeicCastTvUpload(file.name, file.type);
}
