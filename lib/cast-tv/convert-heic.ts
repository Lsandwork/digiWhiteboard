import { CAST_TV_LEGACY_MEDIA_BUCKET, CAST_TV_STORAGE_BUCKET } from "@/lib/cast-tv/library-store";
import { buildCastTvStoragePath, uploadCastTvObject } from "@/lib/cast-tv/media";
import { isHeicCastTvUpload } from "@/lib/cast-tv/mime";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function convertHeicBufferToJpeg(input: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  try {
    return await sharp(input, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
  } catch {
    throw new Error("Could not convert this iPhone photo. Export it as JPG and try again.");
  }
}

export async function convertStoredCastTvHeicIfNeeded(
  supabase: SupabaseClient,
  input: { fileName: string; mimeType: string; storagePath: string; fileSize: number }
) {
  if (!isHeicCastTvUpload(input.fileName, input.mimeType)) {
    return input;
  }

  const buckets = [CAST_TV_STORAGE_BUCKET, CAST_TV_LEGACY_MEDIA_BUCKET];
  let file: Blob | null = null;
  for (const bucket of buckets) {
    const { data, error } = await supabase.storage.from(bucket).download(input.storagePath);
    if (!error && data) {
      file = data;
      break;
    }
  }
  if (!file) {
    throw new Error("Unable to read the uploaded iPhone photo.");
  }

  const jpeg = await convertHeicBufferToJpeg(Buffer.from(await file.arrayBuffer()));
  const fileName = input.fileName.replace(/\.[^.]+$/, ".jpg");
  const storagePath = buildCastTvStoragePath(fileName);
  await uploadCastTvObject(supabase, storagePath, jpeg, "image/jpeg");
  for (const bucket of buckets) {
    await supabase.storage.from(bucket).remove([input.storagePath]);
  }

  return {
    fileName,
    mimeType: "image/jpeg",
    storagePath,
    fileSize: jpeg.length
  };
}
