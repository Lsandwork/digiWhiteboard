import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const CLIPS_DIR = path.join(process.cwd(), "public/assets/fitdog/social-moments/clips");
const BACKUP_DIR = path.join(process.cwd(), "public/assets/fitdog/social-moments/clips-original");
const FFMPEG = ffmpegStatic;

if (!FFMPEG) {
  console.error("ffmpeg-static binary not found.");
  process.exit(1);
}

function compressClip(inputPath: string, outputPath: string) {
  if (!FFMPEG) throw new Error("ffmpeg-static binary not found.");

  const args = [
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "28",
    "-vf",
    "scale='min(720,iw)':-2",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-ac",
    "1",
    outputPath
  ];

  const result = spawnSync(FFMPEG, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${inputPath}`);
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  if (!fs.existsSync(CLIPS_DIR)) {
    console.error(`Clips directory not found: ${CLIPS_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const clips = fs
    .readdirSync(CLIPS_DIR)
    .filter((name) => name.endsWith(".mp4"))
    .sort();

  if (!clips.length) {
    console.error("No MP4 clips found.");
    process.exit(1);
  }

  let totalBefore = 0;
  let totalAfter = 0;

  for (const clip of clips) {
    const inputPath = path.join(CLIPS_DIR, clip);
    const backupPath = path.join(BACKUP_DIR, clip);
    const tempPath = path.join(CLIPS_DIR, `.${clip}.tmp.mp4`);
    const beforeBytes = fs.statSync(inputPath).size;
    totalBefore += beforeBytes;

    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(inputPath, backupPath);
      console.log(`Backed up ${clip}`);
    }

    console.log(`Compressing ${clip} (${formatBytes(beforeBytes)})...`);
    compressClip(inputPath, tempPath);
    fs.renameSync(tempPath, inputPath);

    const afterBytes = fs.statSync(inputPath).size;
    totalAfter += afterBytes;
    const savings = beforeBytes > 0 ? ((1 - afterBytes / beforeBytes) * 100).toFixed(1) : "0";
    console.log(`  → ${formatBytes(afterBytes)} (${savings}% smaller)\n`);
  }

  console.log(`Done. Total: ${formatBytes(totalBefore)} → ${formatBytes(totalAfter)}`);
}

main();
