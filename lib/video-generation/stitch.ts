import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeCaptionPng } from "./captions";
import { LOBBY_AD_FPS, LOBBY_AD_HEIGHT, LOBBY_AD_WIDTH } from "./constants";
import { runFfmpeg } from "./ffmpeg";
import type { LobbyAdScene } from "./types";

export type StitchClip = {
  scene: LobbyAdScene;
  inputPath: string;
};

function normalizeFilter(index: number, duration: number): string[] {
  const v = `[${index}:v]trim=0:${duration},setpts=PTS-STARTPTS,scale=${LOBBY_AD_WIDTH}:${LOBBY_AD_HEIGHT}:force_original_aspect_ratio=decrease,pad=${LOBBY_AD_WIDTH}:${LOBBY_AD_HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${LOBBY_AD_FPS},format=yuv420p[v${index}]`;
  const a = `[${index}:a]atrim=0:${duration},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${index}]`;
  return [v, a];
}

export async function overlayCaption(inputPath: string, scene: LobbyAdScene, outputPath: string, workDir: string) {
  mkdirSync(workDir, { recursive: true });
  const captionPath = join(workDir, `${scene.id}-caption.png`);
  await writeCaptionPng(scene.caption, captionPath);
  runFfmpeg(
    [
      "-y",
      "-i",
      inputPath,
      "-i",
      captionPath,
      "-filter_complex",
      `[0:v]scale=${LOBBY_AD_WIDTH}:${LOBBY_AD_HEIGHT}:force_original_aspect_ratio=decrease,pad=${LOBBY_AD_WIDTH}:${LOBBY_AD_HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${LOBBY_AD_FPS}[base];[base][1:v]overlay=0:0,format=yuv420p[v]`,
      "-map",
      "[v]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ],
    `caption overlay ${scene.id}`
  );
}

export async function stitchLobbyAd(clips: StitchClip[], outputPath: string, workDir: string): Promise<string> {
  if (!clips.length) throw new Error("No clips to stitch.");
  mkdirSync(join(outputPath, ".."), { recursive: true });
  mkdirSync(workDir, { recursive: true });

  const prepared: string[] = [];
  for (const clip of clips) {
    const captioned = join(workDir, `${clip.scene.id}.captioned.mp4`);
    if (clip.scene.id === "end-card") {
      // Headline already lives on the real-logo still. Do not burn a second caption layer.
      runFfmpeg(["-y", "-i", clip.inputPath, "-c", "copy", captioned], `copy ${clip.scene.id}`);
    } else {
      await overlayCaption(clip.inputPath, clip.scene, captioned, workDir);
    }
    const trimmed = join(workDir, `${clip.scene.id}.trimmed.mp4`);
    runFfmpeg(
      [
        "-y",
        "-i",
        captioned,
        "-t",
        String(clip.scene.targetDurationSeconds),
        "-vf",
        `scale=${LOBBY_AD_WIDTH}:${LOBBY_AD_HEIGHT}:force_original_aspect_ratio=decrease,pad=${LOBBY_AD_WIDTH}:${LOBBY_AD_HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${LOBBY_AD_FPS},format=yuv420p`,
        "-af",
        "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        trimmed
      ],
      `trim ${clip.scene.id}`
    );
    prepared.push(trimmed);
  }

  const listFile = join(workDir, "concat.txt");
  writeFileSync(listFile, prepared.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n") + "\n");

  runFfmpeg(
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(LOBBY_AD_FPS),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      outputPath
    ],
    "final concat"
  );

  return outputPath;
}

export function stitchGraphPreview(clips: StitchClip[]): string {
  return clips
    .map((clip, index) => normalizeFilter(index, clip.scene.targetDurationSeconds).join(";"))
    .join(";");
}
