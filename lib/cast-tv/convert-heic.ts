import { transcodeCastTvDisplayImage } from "@/lib/cast-tv/display-image";

export async function convertHeicBufferToJpeg(input: Buffer): Promise<Buffer> {
  try {
    const transcoded = await transcodeCastTvDisplayImage(input);
    return transcoded.buffer;
  } catch {
    throw new Error("Could not convert this iPhone photo. Export it as JPG and try again.");
  }
}
