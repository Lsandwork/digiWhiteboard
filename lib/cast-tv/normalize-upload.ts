import { convertHeicBufferToJpeg } from "@/lib/cast-tv/convert-heic";
import { buildCastTvStoragePath } from "@/lib/cast-tv/media";
import { inferCastTvMimeType, isHeicCastTvUpload, validateCastTvUpload } from "@/lib/cast-tv/mime";

export type NormalizedCastTvUpload = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  mediaType: "image" | "video";
  fileSize: number;
  storagePath: string;
};

export async function normalizeCastTvUploadBytes(file: {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<NormalizedCastTvUpload> {
  const { mediaType, mimeType } = validateCastTvUpload(file);
  const input = Buffer.from(await file.arrayBuffer());

  if (mediaType === "video") {
    return {
      buffer: input,
      mimeType,
      fileName: file.name,
      mediaType,
      fileSize: input.length,
      storagePath: buildCastTvStoragePath(file.name)
    };
  }

  if (isHeicCastTvUpload(file.name, mimeType)) {
    const jpeg = await convertHeicBufferToJpeg(input);
    const fileName = file.name.replace(/\.[^.]+$/, ".jpg");
    return {
      buffer: jpeg,
      mimeType: "image/jpeg",
      fileName,
      mediaType: "image",
      fileSize: jpeg.length,
      storagePath: buildCastTvStoragePath(fileName)
    };
  }

  return {
    buffer: input,
    mimeType: inferCastTvMimeType(file.name, mimeType),
    fileName: file.name,
    mediaType,
    fileSize: input.length,
    storagePath: buildCastTvStoragePath(file.name)
  };
}
