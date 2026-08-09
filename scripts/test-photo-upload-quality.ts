import assert from "node:assert/strict";
import sharp from "sharp";
import { processUploadedPhoto } from "../lib/photo-upload-queue/process";

async function main() {
  const original = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 40, g: 120, b: 200 } }
  })
    .jpeg({ quality: 100 })
    .toBuffer();

  const processed = await processUploadedPhoto({
    name: "yard-play.jpg",
    type: "image/jpeg",
    size: original.length,
    arrayBuffer: async () =>
      original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength)
  });

  assert.equal(processed.preservedOriginal, true, "JPEG originals must not be re-encoded");
  assert.ok(processed.originalBuffer.equals(original), "stored original bytes must match upload");
  assert.equal(processed.mimeType, "image/jpeg");
  assert.ok(processed.thumbnailBuffer.length > 0);
  assert.ok(processed.gingrReadyBuffer.length > 0);
  assert.notEqual(processed.thumbnailBuffer.equals(original), true, "thumbnail is a derived copy");

  console.log("photo-upload-quality: ok", {
    originalBytes: original.length,
    thumbBytes: processed.thumbnailBuffer.length,
    preservedOriginal: processed.preservedOriginal
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
