import { isLocalCastTvAsset } from "@/lib/cast-tv/display-image";
import type { CastTvMediaRecord } from "@/lib/cast-tv/types";

/** Keep this client-safe — do not import library-store from admin thumbnails. */
const CAST_TV_PUBLIC_BUCKET = "lobby-slideshow";

export const CAST_TV_THUMB_MAX_EDGE = 320;
export const CAST_TV_THUMB_QUALITY = 55;

export function castTvStorageThumbUrl(
  record: Pick<CastTvMediaRecord, "id" | "media_type" | "public_url" | "storage_path" | "bucket" | "updated_at" | "storage_missing">
) {
  if (record.storage_missing) return null;
  if (record.media_type === "video") return null;
  if (isLocalCastTvAsset(record)) return record.public_url || null;

  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const bucket = record.bucket || CAST_TV_PUBLIC_BUCKET;
  const path = String(record.storage_path || "").replace(/^\/+/, "");
  if (!supabaseUrl || !path) {
    return `/api/cast-tv/media/file?id=${encodeURIComponent(record.id)}&kind=thumb&v=${encodeURIComponent(record.updated_at)}`;
  }

  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const params = new URLSearchParams({
    width: String(CAST_TV_THUMB_MAX_EDGE),
    height: "180",
    resize: "contain",
    quality: String(CAST_TV_THUMB_QUALITY),
    v: record.updated_at
  });
  return `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${encodedPath}?${params.toString()}`;
}

export function castTvFileThumbSrc(record: Pick<CastTvMediaRecord, "id" | "updated_at">) {
  return `/api/cast-tv/media/file?id=${encodeURIComponent(record.id)}&kind=thumb&fallback=1&v=${encodeURIComponent(record.updated_at)}`;
}
