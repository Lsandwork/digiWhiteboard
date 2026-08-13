export const MAX_HR_WRITE_UP_UPLOAD_BYTES = 8 * 1024 * 1024;

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif"
};

const TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heif",
  "application/x-pdf": "application/pdf"
};

export const ALLOWED_HR_WRITE_UP_UPLOAD_TYPES = new Set(Object.values(TYPE_BY_EXTENSION));

export const GEMINI_WRITE_UP_INLINE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

export function inferHrWriteUpUploadContentType(filename?: string | null, mime?: string | null) {
  const declared = String(mime || "")
    .trim()
    .toLowerCase()
    .split(";")[0]!
    .trim();
  const aliased = TYPE_ALIASES[declared] || declared;
  if (ALLOWED_HR_WRITE_UP_UPLOAD_TYPES.has(aliased)) return aliased;
  const ext = String(filename || "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
  return (ext && TYPE_BY_EXTENSION[ext]) || null;
}

export function geminiInlineMimeForWriteUp(filename?: string | null, mime?: string | null) {
  const inferred = inferHrWriteUpUploadContentType(filename, mime);
  if (inferred && GEMINI_WRITE_UP_INLINE_TYPES.has(inferred)) return inferred;
  return null;
}

export function sanitizeHrWriteUpUploadFilename(filename?: string | null) {
  const base = String(filename || "write-up")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  return base || "write-up";
}

export function assertHrWriteUpUploadFile(input: { name?: string | null; type?: string | null; size?: number | null }) {
  const size = Number(input.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Choose a write-up file to upload.");
  }
  if (size > MAX_HR_WRITE_UP_UPLOAD_BYTES) {
    throw new Error("Write-up file must be 8 MB or smaller.");
  }
  const contentType = inferHrWriteUpUploadContentType(input.name, input.type);
  if (!contentType) {
    throw new Error("Upload a PDF or image of the paper write-up.");
  }
  return {
    contentType,
    filename: sanitizeHrWriteUpUploadFilename(input.name)
  };
}
