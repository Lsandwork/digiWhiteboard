import fs from "node:fs";
import path from "node:path";

const MANIFEST_PATH = path.join(process.cwd(), "public/assets/fitdog/social-moments/social-moments.manifest.json");
const CLIPS_DIR = path.join(process.cwd(), "public/assets/fitdog/social-moments/clips");

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as {
    version: number;
    clips: Array<{ id: string; src: string; sizeBytes?: number }>;
    [key: string]: unknown;
  };

  let totalBytes = 0;
  for (const clip of manifest.clips) {
    const filename = path.basename(clip.src);
    const clipPath = path.join(CLIPS_DIR, filename);
    const sizeBytes = fs.statSync(clipPath).size;
    clip.sizeBytes = sizeBytes;
    totalBytes += sizeBytes;
  }

  manifest.version = (manifest.version ?? 0) + 1;
  manifest.preload = "auto";
  manifest.updatedFor = `Re-encoded lobby clips for faster Chromecast playback (${Math.round(totalBytes / (1024 * 1024))} MB total). Service worker + prefetch enabled.`;

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated manifest v${manifest.version} (${totalBytes} bytes total)`);
}

main();
