import { createHash } from "node:crypto";
import type { CastTvMediaRecord } from "@/lib/cast-tv/types";

export const CAST_TV_DISPLAY_MAX_EDGE = 1920;
export const CAST_TV_DISPLAY_JPEG_QUALITY = 88;
export const CAST_TV_DUPLICATE_MESSAGE = "This photo is already on CAST-TV.";

const UUID_STEM =
  /^[0-9a-f]{8}[- ][0-9a-f]{4}[- ][0-9a-f]{4}[- ][0-9a-f]{4}[- ][0-9a-f]{12}$/i;

export type CastTvImageKind = "jpeg" | "png" | "webp" | "gif" | "heic" | "json" | "empty" | "unknown";

export type TranscodedCastTvJpeg = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  contentHash: string;
  pixelHash: string;
  originalHash: string;
};

function sha256Hex(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function basenameCastTvFile(name: string) {
  const trimmed = String(name || "").trim().replace(/\\/g, "/");
  return trimmed.split("/").pop() || trimmed;
}

export function isUuidCastTvFileName(fileName: string) {
  const stem = basenameCastTvFile(fileName)
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  return UUID_STEM.test(stem);
}

export function normalizeCastTvFileName(fileName: string) {
  return basenameCastTvFile(fileName).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Original upload names only — recovered UUID object names are not duplicate keys. */
export function originalCastTvFileNameKey(fileName: string): string | null {
  const normalized = normalizeCastTvFileName(fileName);
  if (!normalized || isUuidCastTvFileName(normalized)) return null;
  return normalized;
}

export function isLocalCastTvAsset(record: Pick<CastTvMediaRecord, "public_url" | "storage_path" | "bucket">) {
  const src = String(record.public_url || "");
  if (src.startsWith("/assets/")) return true;
  return !record.bucket && String(record.storage_path || "").startsWith("builtin/");
}

export function isBuiltinMarketingCastTvItem(
  item: Pick<CastTvMediaRecord, "id" | "storage_path" | "public_url" | "bucket">
) {
  return (
    String(item.id || "").startsWith("builtin-marketing-") ||
    normalizeCastTvStoragePath(item.storage_path).startsWith("builtin/marketing/") ||
    isLocalCastTvAsset(item)
  );
}

export function isUploadedCastTvMedia(item: Pick<CastTvMediaRecord, "id" | "storage_path" | "public_url" | "bucket">) {
  return !isBuiltinMarketingCastTvItem(item) && !isLegacyCastTvDumpPath(item.storage_path);
}

export function normalizeCastTvStoragePath(storagePath: string) {
  return String(storagePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

export function isCastTvSidecarPath(storagePath: string) {
  const path = normalizeCastTvStoragePath(storagePath);
  const base = basenameCastTvFile(path).toLowerCase();
  return base === "library.json" || base === "heartbeats.json" || base.endsWith(".json");
}

/** Old `cast_tv_media` dump recovered from the bucket root (`media/<uuid>`). */
export function isLegacyCastTvDumpPath(storagePath: string) {
  const path = normalizeCastTvStoragePath(storagePath);
  if (!path) return false;
  return path === "media" || path.startsWith("media/");
}

export function isCanonicalCastTvStoragePath(storagePath: string) {
  const path = normalizeCastTvStoragePath(storagePath);
  return path.startsWith("cast-tv/") && path.length > "cast-tv/".length && !isCastTvSidecarPath(path);
}

export function isRecoverableCastTvStoragePath(storagePath: string) {
  if (isLegacyCastTvDumpPath(storagePath) || isCastTvSidecarPath(storagePath)) return false;
  return isCanonicalCastTvStoragePath(storagePath);
}

export function castTvMediaKeepScore(item: CastTvMediaRecord) {
  let score = 0;
  if (isLocalCastTvAsset(item)) score += 400;
  if (isCanonicalCastTvStoragePath(item.storage_path)) score += 100;
  if (!isLegacyCastTvDumpPath(item.storage_path)) score += 40;
  if (item.is_enabled !== false) score += 20;
  if (item.display_ready) score += 10;
  if (originalCastTvFileNameKey(item.file_name)) score += 8;
  if (item.content_hash || item.pixel_hash) score += 2;
  return score;
}

function castTvMediaDuplicateKeys(item: CastTvMediaRecord) {
  return [
    `id:${item.id}`,
    `path:${item.bucket || ""}:${normalizeCastTvStoragePath(item.storage_path)}`,
    item.content_hash ? `hash:${String(item.content_hash).trim().toLowerCase()}` : "",
    item.pixel_hash ? `pixel:${String(item.pixel_hash).trim().toLowerCase()}` : "",
    originalCastTvFileNameKey(item.file_name) ? `file:${originalCastTvFileNameKey(item.file_name)}` : ""
  ].filter(Boolean);
}

export function castTvImageDisplaySrc(
  record: Pick<CastTvMediaRecord, "id" | "media_type" | "public_url" | "storage_path" | "bucket" | "updated_at">
) {
  if (record.media_type === "video") return record.public_url || "";
  if (isLocalCastTvAsset(record)) return record.public_url || "";
  return `/api/cast-tv/media/file?id=${encodeURIComponent(record.id)}&v=${encodeURIComponent(record.updated_at)}`;
}

export function sniffCastTvImageKind(bytes: Buffer): CastTvImageKind {
  if (!bytes.length) return "empty";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes.slice(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  if (bytes.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.slice(8, 12).toString("ascii").toLowerCase();
    if (/heic|heif|mif1|msf1|avif/.test(brand)) return "heic";
  }
  const start = bytes.subarray(0, 64).toString("utf8").trimStart();
  if (start.startsWith("{") || start.startsWith("[")) return "json";
  return "unknown";
}

export function isDecodableCastTvImageKind(kind: CastTvImageKind) {
  return kind === "jpeg" || kind === "png" || kind === "webp" || kind === "heic" || kind === "gif";
}

async function loadSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
}

export async function transcodeCastTvDisplayImage(input: Buffer): Promise<TranscodedCastTvJpeg> {
  const kind = sniffCastTvImageKind(input);
  if (!isDecodableCastTvImageKind(kind)) {
    throw new Error("This file is not a valid photo. Upload a JPG, PNG, WEBP, or HEIC image.");
  }

  const sharp = await loadSharp();
  let failOn: "error" | "none" = "error";
  try {
    const meta = await sharp(input, { failOn: "error", animated: false }).rotate().metadata();
    if (!meta.width || !meta.height) throw new Error("empty");
  } catch {
    failOn = "none";
    const meta = await sharp(input, { failOn: "none", animated: false }).rotate().metadata();
    if (!meta.width || !meta.height) {
      throw new Error("This file is not a valid photo. Upload a JPG, PNG, WEBP, or HEIC image.");
    }
  }

  const { data, info } = await sharp(input, { failOn, animated: false })
    .rotate()
    .resize(CAST_TV_DISPLAY_MAX_EDGE, CAST_TV_DISPLAY_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true
    })
    .toColorspace("srgb")
    .jpeg({
      quality: CAST_TV_DISPLAY_JPEG_QUALITY,
      progressive: false,
      chromaSubsampling: "4:2:0"
    })
    .toBuffer({ resolveWithObject: true });

  if (!data.length || info.format !== "jpeg") {
    throw new Error("Could not convert this photo for CAST-TV.");
  }

  const width = info.width % 2 === 0 ? info.width : info.width - 1;
  const height = info.height % 2 === 0 ? info.height : info.height - 1;
  const even =
    width !== info.width || height !== info.height
      ? await sharp(data)
          .extract({ left: 0, top: 0, width: Math.max(width, 2), height: Math.max(height, 2) })
          .jpeg({
            quality: CAST_TV_DISPLAY_JPEG_QUALITY,
            progressive: false,
            chromaSubsampling: "4:2:0"
          })
          .toBuffer()
      : data;

  const pixelRaw = await sharp(even)
    .resize(16, 16, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  return {
    buffer: even,
    mimeType: "image/jpeg",
    width: Math.max(width, 2),
    height: Math.max(height, 2),
    contentHash: sha256Hex(even),
    pixelHash: sha256Hex(pixelRaw),
    originalHash: sha256Hex(input)
  };
}

export function matchCastTvDuplicate(
  media: CastTvMediaRecord[],
  input: {
    fileName: string;
    fileSize?: number | null;
    contentHash?: string | null;
    pixelHash?: string | null;
    originalHash?: string | null;
    ignoreId?: string | null;
  }
): CastTvMediaRecord | null {
  const nameKey = originalCastTvFileNameKey(input.fileName);
  const hashes = new Set(
    [input.contentHash, input.pixelHash, input.originalHash]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );

  for (const row of media) {
    if (input.ignoreId && row.id === input.ignoreId) continue;
    const rowName = originalCastTvFileNameKey(row.file_name);
    if (nameKey && rowName && rowName === nameKey) return row;

    const rowHashes = [row.content_hash, row.pixel_hash]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    if (hashes.size && rowHashes.some((hash) => hashes.has(hash))) return row;
  }

  return null;
}

export function dedupeCastTvMedia(media: CastTvMediaRecord[]): CastTvMediaRecord[] {
  const ranked = [...media].sort(
    (a, b) =>
      castTvMediaKeepScore(b) - castTvMediaKeepScore(a) ||
      a.display_order - b.display_order ||
      a.created_at.localeCompare(b.created_at)
  );
  const seen = new Set<string>();
  const keptIds = new Set<string>();

  for (const item of ranked) {
    const keys = castTvMediaDuplicateKeys(item);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    keptIds.add(item.id);
  }

  return media
    .filter((item) => keptIds.has(item.id))
    .map((item, index) => ({ ...item, display_order: index + 1 }));
}

/**
 * Drops recovered `media/` dump copies and auto-seeded lobby builtins when
 * uploaded CAST-TV photos exist. Re-enables photos that repair disabled after
 * a storage timeout. Does not empty the playlist when the dump is the only content.
 */
export function purgeDuplicateCastTvMedia(media: CastTvMediaRecord[]): {
  kept: CastTvMediaRecord[];
  removed: CastTvMediaRecord[];
} {
  const usable = media
    .filter((item) => !isCastTvSidecarPath(item.storage_path) && !isCastTvSidecarPath(item.file_name))
    .map((item) => restoreRepairDisabledCastTvItem(item));
  const uploaded = usable.filter((item) => isUploadedCastTvMedia(item));
  const dump = usable.filter((item) => isLegacyCastTvDumpPath(item.storage_path));
  const builtins = usable.filter((item) => isBuiltinMarketingCastTvItem(item));
  const source = uploaded.length ? uploaded : dump.length ? dump : builtins;
  const kept = dedupeCastTvMedia(source);
  const keptIds = new Set(kept.map((item) => item.id));
  const removed = media.filter((item) => !keptIds.has(item.id));
  return { kept, removed };
}

function restoreRepairDisabledCastTvItem(item: CastTvMediaRecord): CastTvMediaRecord {
  if (item.is_enabled === false && item.display_ready !== true && !isBuiltinMarketingCastTvItem(item)) {
    return { ...item, is_enabled: true };
  }
  return item;
}

export function jpegFileNameFrom(fileName: string) {
  const base = basenameCastTvFile(fileName).replace(/\.[^.]+$/, "") || "cast-tv-photo";
  return `${base}.jpg`;
}

export function isCastTvDuplicateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /already (exists|on CAST-TV)|duplicate/i.test(message);
}
