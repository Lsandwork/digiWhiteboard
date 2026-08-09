import sharp from "sharp";
import {
  buildPhotoStoragePath,
  sha256Hex,
  uploadPhotoBuffer,
  validatePhotoUploadFile
} from "@/lib/photo-upload-queue/storage";
import type { PhotoItemStatus } from "@/lib/photo-upload-queue/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type ProcessedPhotoUpload = {
  originalBuffer: Buffer;
  thumbnailBuffer: Buffer;
  gingrReadyBuffer: Buffer;
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
  sha256: string;
  convertedFromHeic: boolean;
  /** True when original bytes were stored without lossy re-encode */
  preservedOriginal: boolean;
};

function isHeic(mime: string, fileName: string) {
  const lower = mime.toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return lower.includes("heic") || lower.includes("heif") || ext === "heic" || ext === "heif";
}

function extensionForFormat(format: string | undefined, fileName: string): { mime: string; ext: string } {
  const fileExt = (fileName.split(".").pop() || "").toLowerCase();
  if (format === "jpeg" || format === "jpg" || fileExt === "jpg" || fileExt === "jpeg") {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (format === "png" || fileExt === "png") return { mime: "image/png", ext: "png" };
  if (format === "webp" || fileExt === "webp") return { mime: "image/webp", ext: "webp" };
  return { mime: "image/jpeg", ext: "jpg" };
}

/**
 * Process an uploaded photo:
 * - Preserve original bytes for JPEG/PNG/WEBP (no quality loss)
 * - Convert HEIC/HEIF → high-quality JPEG only when required
 * - Thumbnails + gingr-ready are derived copies (compressed for speed/size)
 */
export async function processUploadedPhoto(file: {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<ProcessedPhotoUpload> {
  validatePhotoUploadFile(file);
  const input = Buffer.from(await file.arrayBuffer());
  const heic = isHeic(file.type, file.name);

  let meta: { format?: string; width?: number; height?: number } = {};
  try {
    meta = await sharp(input, { failOn: "none" }).rotate().metadata();
  } catch {
    meta = {};
  }

  const needsHeicConvert = heic || meta.format === "heif";
  let originalBuffer: Buffer;
  let mimeType: string;
  let extension: string;
  let convertedFromHeic = false;
  let preservedOriginal = false;

  if (needsHeicConvert) {
    try {
      // Highest practical JPEG quality for HEIC sources — phones require conversion.
      originalBuffer = await sharp(input, { failOn: "none" })
        .rotate()
        .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();
      convertedFromHeic = true;
      mimeType = "image/jpeg";
      extension = "jpg";
    } catch {
      throw new Error(
        "HEIC conversion failed on the server. Please export the photo as JPG from your phone and try again."
      );
    }
  } else if (meta.format === "jpeg" || meta.format === "png" || meta.format === "webp") {
    // Keep original bytes — do not re-encode (prevents quality distortion).
    originalBuffer = input;
    const mapped = extensionForFormat(meta.format, file.name);
    mimeType = mapped.mime;
    extension = mapped.ext;
    preservedOriginal = true;
  } else {
    // Unknown / exotic formats → high-quality JPEG once.
    originalBuffer = await sharp(input, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    mimeType = "image/jpeg";
    extension = "jpg";
  }

  // Derive previews from a normalized oriented pipeline without mutating stored original when preserved.
  const oriented = sharp(input, { failOn: "none" }).rotate();
  const [thumbnailBuffer, gingrReadyBuffer, orientedMeta] = await Promise.all([
    oriented
      .clone()
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer(),
    oriented
      .clone()
      .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer(),
    oriented.metadata()
  ]);

  return {
    originalBuffer,
    thumbnailBuffer,
    gingrReadyBuffer,
    mimeType,
    extension,
    width: orientedMeta.width ?? meta.width ?? null,
    height: orientedMeta.height ?? meta.height ?? null,
    sha256: sha256Hex(originalBuffer),
    convertedFromHeic,
    preservedOriginal
  };
}

export async function storeProcessedPhoto(options: {
  supabase: SupabaseClient;
  batchId: string;
  fileName: string;
  processed: ProcessedPhotoUpload;
  /** Skip gingr-ready storage for faster library uploads (generated on export if missing). */
  skipGingrReady?: boolean;
}) {
  const originalPath = buildPhotoStoragePath({
    batchId: options.batchId,
    kind: "originals",
    fileName: options.fileName,
    ext: options.processed.extension
  });
  const thumbPath = buildPhotoStoragePath({
    batchId: options.batchId,
    kind: "thumbnails",
    fileName: options.fileName,
    ext: "jpg"
  });
  const gingrPath = options.skipGingrReady
    ? null
    : buildPhotoStoragePath({
        batchId: options.batchId,
        kind: "gingr-ready",
        fileName: options.fileName,
        ext: "jpg"
      });

  const uploads = [
    uploadPhotoBuffer(
      options.supabase,
      originalPath,
      options.processed.originalBuffer,
      options.processed.mimeType,
      { skipIntegrityCheck: true }
    ),
    uploadPhotoBuffer(options.supabase, thumbPath, options.processed.thumbnailBuffer, "image/jpeg", {
      skipIntegrityCheck: true
    })
  ];
  if (gingrPath) {
    uploads.push(
      uploadPhotoBuffer(options.supabase, gingrPath, options.processed.gingrReadyBuffer, "image/jpeg", {
        skipIntegrityCheck: true
      })
    );
  }
  await Promise.all(uploads);

  return {
    original_storage_path: originalPath,
    thumbnail_storage_path: thumbPath,
    gingr_ready_storage_path: gingrPath,
    stored_filename: originalPath.split("/").pop() || options.fileName,
    mime_type: options.processed.mimeType,
    file_size: options.processed.originalBuffer.length,
    width: options.processed.width,
    height: options.processed.height,
    sha256_hash: options.processed.sha256
  };
}

export function deriveItemStatus(options: {
  dogCount: number;
  hasDuplicate: boolean;
  duplicateOverride: boolean;
  excluded: boolean;
  failed?: boolean;
  alreadyExported?: boolean;
  alreadyUploaded?: boolean;
}): PhotoItemStatus {
  if (options.failed) return "failed";
  if (options.excluded) return "excluded";
  if (options.alreadyUploaded) return "uploaded_to_gingr";
  if (options.alreadyExported) return "included_in_export";
  if (options.hasDuplicate && !options.duplicateOverride) return "needs_review";
  if (options.dogCount <= 0) return "needs_dog_assignment";
  return "ready_for_gingr";
}

export function buildExportFileName(options: {
  serviceDate: string;
  dogNames: string[];
  category: string;
  index: number;
}) {
  const date = options.serviceDate || new Date().toISOString().slice(0, 10);
  const dogs = options.dogNames
    .map((name) => name.trim().replace(/[^a-zA-Z0-9]+/g, ""))
    .filter(Boolean)
    .slice(0, 3);
  const dogPart = dogs.length ? dogs.join("-") : "Dog";
  const category = (options.category || "Photo").replace(/[^a-zA-Z0-9]+/g, "");
  const index = String(options.index).padStart(3, "0");
  const base = `${date}_${dogPart}_${category || "Photo"}_${index}`.slice(0, 120);
  return `${base}.jpg`;
}
