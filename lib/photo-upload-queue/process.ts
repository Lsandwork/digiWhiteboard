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
};

function isHeic(mime: string, fileName: string) {
  const lower = mime.toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return lower.includes("heic") || lower.includes("heif") || ext === "heic" || ext === "heif";
}

export async function processUploadedPhoto(file: {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<ProcessedPhotoUpload> {
  validatePhotoUploadFile(file);
  const input = Buffer.from(await file.arrayBuffer());
  const heic = isHeic(file.type, file.name);
  let convertedFromHeic = false;
  let pipeline = sharp(input, { failOn: "none" }).rotate();

  try {
    const meta = await pipeline.metadata();
    if (heic || meta.format === "heif") {
      convertedFromHeic = true;
    }
  } catch {
    // continue; sharp may still convert
  }

  let working: Buffer;
  let mimeType = "image/jpeg";
  let extension = "jpg";

  try {
    working = await sharp(input, { failOn: "none" }).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    if (heic) convertedFromHeic = true;
  } catch (error) {
    if (heic) {
      throw new Error(
        "HEIC conversion failed on the server. Please export the photo as JPG from your phone/computer and try again."
      );
    }
    throw error instanceof Error ? error : new Error("Unable to process image.");
  }

  const image = sharp(working, { failOn: "none" });
  const metadata = await image.metadata();
  const thumbnailBuffer = await sharp(working)
    .resize(480, 480, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const gingrReadyBuffer = await sharp(working)
    .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return {
    originalBuffer: working,
    thumbnailBuffer,
    gingrReadyBuffer,
    mimeType,
    extension,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    sha256: sha256Hex(working),
    convertedFromHeic
  };
}

export async function storeProcessedPhoto(options: {
  supabase: SupabaseClient;
  batchId: string;
  fileName: string;
  processed: ProcessedPhotoUpload;
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
  const gingrPath = buildPhotoStoragePath({
    batchId: options.batchId,
    kind: "gingr-ready",
    fileName: options.fileName,
    ext: "jpg"
  });

  await uploadPhotoBuffer(options.supabase, originalPath, options.processed.originalBuffer, options.processed.mimeType);
  await uploadPhotoBuffer(options.supabase, thumbPath, options.processed.thumbnailBuffer, "image/jpeg");
  await uploadPhotoBuffer(options.supabase, gingrPath, options.processed.gingrReadyBuffer, "image/jpeg");

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
