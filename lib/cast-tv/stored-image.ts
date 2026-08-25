import {
  jpegFileNameFrom,
  transcodeCastTvDisplayImage,
  type TranscodedCastTvJpeg
} from "@/lib/cast-tv/display-image";
import {
  CAST_TV_LEGACY_MEDIA_BUCKET,
  CAST_TV_STORAGE_BUCKET
} from "@/lib/cast-tv/library-store";
import { buildCastTvStoragePath, uploadCastTvObject } from "@/lib/cast-tv/media";
import { mediaTypeForMime } from "@/lib/cast-tv/mime";

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
  }
  throw new Error(lastMessage);
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
