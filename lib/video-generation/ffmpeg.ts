import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

function fromFfmpegStatic(): string | null {
  try {
    const require = createRequire(join(process.cwd(), "package.json"));
    const resolved = require("ffmpeg-static") as string | null;
    return resolved || null;
  } catch {
    return null;
  }
}

export function resolveFfmpeg(): string {
  return process.env.FFMPEG_PATH?.trim() || fromFfmpegStatic() || "ffmpeg";
}

export function resolveFfprobe(): string {
  return process.env.FFPROBE_PATH?.trim() || "ffprobe";
}

export function runFfmpeg(args: string[], label: string) {
  const bin = resolveFfmpeg();
  const result = spawnSync(bin, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim().slice(-4000);
    throw new Error(`${label} failed (ffmpeg exit ${result.status}): ${detail}`);
  }
}

export function probeJson(filePath: string): {
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
} {
  const result = spawnSync(
    resolveFfprobe(),
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${(result.stderr || "").trim()}`);
  }
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  return {
    duration: Number(parsed.format?.duration || 0),
    width: video?.width || 0,
    height: video?.height || 0,
    videoCodec: video?.codec_name || null,
    audioCodec: audio?.codec_name || null
  };
}
