import sharp from "sharp";
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
    try {
      const jpeg = await sharp(input, { failOn: "none" })
        .rotate()
        .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();
      const fileName = file.name.replace(/\.[^.]+$/, ".jpg");
      return {
        buffer: jpeg,
        mimeType: "image/jpeg",
        fileName,
        mediaType: "image",
        fileSize: jpeg.length,
        storagePath: buildCastTvStoragePath(fileName)
      };
    } catch {
      throw new Error("Could not convert this iPhone photo. Export it as JPG and try again.");
    }
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
