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

export const ALLOWED_HR_WRITE_UP_UPLOAD_TYPES = new Set(Object.values(TYPE_BY_EXTENSION));

export function inferHrWriteUpUploadContentType(filename?: string | null, mime?: string | null) {
  const declared = String(mime || "").trim().toLowerCase();
  if (ALLOWED_HR_WRITE_UP_UPLOAD_TYPES.has(declared)) return declared;
  const ext = String(filename || "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
  return (ext && TYPE_BY_EXTENSION[ext]) || null;
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
