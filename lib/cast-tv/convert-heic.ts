import { CAST_TV_BUCKET, buildCastTvStoragePath, uploadCastTvObject } from "@/lib/cast-tv/media";
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

  const { data, error } = await supabase.storage.from(CAST_TV_BUCKET).download(input.storagePath);
  if (error || !data) {
    throw new Error(error?.message || "Unable to read the uploaded iPhone photo.");
  }

  const jpeg = await convertHeicBufferToJpeg(Buffer.from(await data.arrayBuffer()));
  const fileName = input.fileName.replace(/\.[^.]+$/, ".jpg");
  const storagePath = buildCastTvStoragePath(fileName);
  await uploadCastTvObject(supabase, storagePath, jpeg, "image/jpeg");
  await supabase.storage.from(CAST_TV_BUCKET).remove([input.storagePath]);

  return {
    fileName,
    mimeType: "image/jpeg",
    storagePath,
    fileSize: jpeg.length
  };
}
