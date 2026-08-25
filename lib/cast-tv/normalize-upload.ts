import { jpegFileNameFrom, transcodeCastTvDisplayImage } from "@/lib/cast-tv/display-image";
import { buildCastTvStoragePath } from "@/lib/cast-tv/media";
import { validateCastTvUpload } from "@/lib/cast-tv/mime";

export type NormalizedCastTvUpload = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  mediaType: "image" | "video";
  fileSize: number;
  storagePath: string;
  contentHash?: string | null;
  pixelHash?: string | null;
  originalHash?: string | null;
  displayReady: boolean;
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
      storagePath: buildCastTvStoragePath(file.name),
      displayReady: true
    };
  }

  const transcoded = await transcodeCastTvDisplayImage(input);
  const fileName = jpegFileNameFrom(file.name);
  return {
    buffer: transcoded.buffer,
    mimeType: transcoded.mimeType,
    fileName,
    mediaType: "image",
    fileSize: transcoded.buffer.length,
    storagePath: buildCastTvStoragePath(fileName),
    contentHash: transcoded.contentHash,
    pixelHash: transcoded.pixelHash,
    originalHash: transcoded.originalHash,
    displayReady: true
  };
}

