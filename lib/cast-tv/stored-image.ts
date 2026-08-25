import {
  jpegFileNameFrom,
  transcodeCastTvDisplayImage,
  type TranscodedCastTvJpeg
} from "@/lib/cast-tv/display-image";
import { isLocalCastTvAsset } from "@/lib/cast-tv/display-image";
import {
  CAST_TV_LEGACY_MEDIA_BUCKET,
  CAST_TV_STORAGE_BUCKET,
  isMissingCastTvStorageObject,
  mutateCastTvLibrary,
  publicUrlForCastTvStorage
} from "@/lib/cast-tv/library-store";
import { buildCastTvStoragePath, uploadCastTvObject } from "@/lib/cast-tv/media";
import { mediaTypeForMime } from "@/lib/cast-tv/mime";
import { logCastTvQuery } from "@/lib/cast-tv/query-log";
import type { CastTvMediaRecord } from "@/lib/cast-tv/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type NormalizedStoredCastTvFile = {
  fileName: string;
  mimeType: string;
  storagePath: string;
  fileSize: number;
  bucket?: string | null;
  contentHash?: string | null;
  pixelHash?: string | null;
  originalHash?: string | null;
  displayReady: boolean;
};

export async function downloadCastTvStorageFile(
  supabase: SupabaseClient,
  storagePath: string,
  bucket?: string | null
): Promise<{ bytes: Buffer; bucket: string }> {
  const buckets = bucket
    ? [bucket, CAST_TV_STORAGE_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET]
    : [CAST_TV_STORAGE_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET];
  const unique = [...new Set(buckets.filter(Boolean))];
  let lastMessage = "Unable to read the uploaded CAST-TV file.";
  for (const target of unique) {
    const { data, error } = await supabase.storage.from(target).download(storagePath);
    if (!error && data) {
      return { bytes: Buffer.from(await data.arrayBuffer()), bucket: target };
    }
    lastMessage = error?.message || lastMessage;

    const { data: published } = supabase.storage.from(target).getPublicUrl(storagePath);
    if (!published?.publicUrl) continue;
    try {
      const response = await fetch(published.publicUrl, { cache: "no-store" });
      if (!response.ok) {
        lastMessage = `Unable to read CAST-TV file (${response.status}).`;
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length) return { bytes, bucket: target };
    } catch (caught) {
      lastMessage = caught instanceof Error && caught.message.trim() ? caught.message.trim() : lastMessage;
    }
  }
  throw new Error(lastMessage);
}

export async function probeCastTvStorageExists(
  supabase: SupabaseClient,
  record: Pick<CastTvMediaRecord, "storage_path" | "bucket" | "public_url" | "media_type">
): Promise<"ok" | "missing" | "unknown"> {
  if (isLocalCastTvAsset(record)) return "ok";
  const bucket = record.bucket || CAST_TV_STORAGE_BUCKET;
  const path = record.storage_path;
  const publicUrl =
    record.public_url && !record.public_url.startsWith("/api/")
      ? record.public_url.split("?")[0]
      : publicUrlForCastTvStorage(supabase, path, undefined, bucket);

  const started = Date.now();
  try {
    const head = await fetch(publicUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(2500)
    });
    if (head.status === 404 || head.status === 400) {
      logCastTvQuery({
        name: "storage.head",
        rows: 0,
        durationMs: Date.now() - started,
        cache: "miss",
        trigger: "probe"
      });
      return "missing";
    }
    if (head.ok) {
      logCastTvQuery({
        name: "storage.head",
        rows: 1,
        durationMs: Date.now() - started,
        cache: "miss",
        trigger: "probe"
      });
      return "ok";
    }
  } catch {
    /* try a 1-byte range GET */
  }

  try {
    const ranged = await fetch(publicUrl, {
      method: "GET",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(2500)
    });
    logCastTvQuery({
      name: "storage.range",
      rows: ranged.ok || ranged.status === 206 ? 1 : 0,
      durationMs: Date.now() - started,
      cache: "miss",
      trigger: "probe"
    });
    if (ranged.status === 404 || ranged.status === 400) return "missing";
    if (ranged.ok || ranged.status === 206) return "ok";
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function isMissingCastTvFileError(error: unknown) {
  return isMissingCastTvStorageObject(
    error && typeof error === "object"
      ? (error as { message?: string; statusCode?: string | number })
      : { message: error instanceof Error ? error.message : String(error || "") }
  );
}

export async function markMissingCastTvStorage(supabase: SupabaseClient, ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  return mutateCastTvLibrary(supabase, (library) => {
    const idSet = new Set(uniqueIds);
    const now = new Date().toISOString();
    let changed = false;
    const media = library.media.map((item) => {
      if (!idSet.has(item.id) || item.storage_missing) return item;
      changed = true;
      return {
        ...item,
        storage_missing: true,
        is_enabled: false,
        updated_at: now
      };
    });
    return {
      state: changed ? { ...library, media } : library,
      result: media.filter((item) => idSet.has(item.id) && item.storage_missing)
    };
  });
}

export async function probeAndMarkMissingCastTvMedia(
  supabase: SupabaseClient,
  records: CastTvMediaRecord[]
) {
  const candidates = records.filter(
    (item) => !item.storage_missing && !isLocalCastTvAsset(item) && Boolean(item.storage_path)
  );
  if (!candidates.length) return records;

  const missingIds: string[] = [];
  await Promise.all(
    candidates.map(async (item) => {
      const status = await probeCastTvStorageExists(supabase, item);
      if (status === "missing") missingIds.push(item.id);
    })
  );
  if (!missingIds.length) return records;
  await markMissingCastTvStorage(supabase, missingIds);
  const missing = new Set(missingIds);
  return records.map((item) =>
    missing.has(item.id) ? { ...item, storage_missing: true, is_enabled: false } : item
  );
}

export async function normalizeStoredCastTvImage(
  supabase: SupabaseClient,
  input: {
    fileName: string;
    mimeType: string;
    storagePath: string;
    fileSize: number;
    bucket?: string | null;
  }
): Promise<NormalizedStoredCastTvFile> {
  const mediaType = mediaTypeForMime(input.mimeType, input.fileName);
  if (mediaType === "video") {
    return {
      fileName: input.fileName,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      fileSize: input.fileSize,
      bucket: input.bucket ?? null,
      displayReady: true
    };
  }

  const downloaded = await downloadCastTvStorageFile(supabase, input.storagePath, input.bucket);
  let transcoded: TranscodedCastTvJpeg;
  try {
    transcoded = await transcodeCastTvDisplayImage(downloaded.bytes);
  } catch {
    throw new Error("This upload is not a displayable photo. Upload a JPG, PNG, WEBP, or HEIC image.");
  }

  const fileName = jpegFileNameFrom(input.fileName);
  const lowerPath = input.storagePath.toLowerCase();
  const keepPath = lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg");
  const storagePath = keepPath ? input.storagePath : buildCastTvStoragePath(fileName);
  const bucket = await uploadCastTvObject(
    supabase,
    storagePath,
    transcoded.buffer,
    "image/jpeg",
    downloaded.bucket,
    { upsert: true }
  );

  if (storagePath !== input.storagePath) {
    for (const target of [downloaded.bucket, CAST_TV_STORAGE_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET]) {
      await supabase.storage.from(target).remove([input.storagePath]);
    }
  }

  return {
    fileName,
    mimeType: "image/jpeg",
    storagePath,
    fileSize: transcoded.buffer.length,
    bucket,
    contentHash: transcoded.contentHash,
    pixelHash: transcoded.pixelHash,
    originalHash: transcoded.originalHash,
    displayReady: true
  };
}

/** @deprecated use normalizeStoredCastTvImage — kept for older signed-url complete calls */
export async function convertStoredCastTvHeicIfNeeded(
  supabase: SupabaseClient,
  input: { fileName: string; mimeType: string; storagePath: string; fileSize: number; bucket?: string | null }
) {
  return normalizeStoredCastTvImage(supabase, input);
}
