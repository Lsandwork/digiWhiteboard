import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadSharp } from "../sharp-runtime";
import {
  END_CARD_DURATION_SECONDS,
  END_CARD_HEADLINE,
  FITDOG_BLACK,
  FITDOG_ORANGE,
  FITDOG_WHITE,
  INTER_BOLD,
  INTER_SEMI,
  LOBBY_AD_FPS,
  LOBBY_AD_HEIGHT,
  LOBBY_AD_WIDTH,
  REAL_FITDOG_CIRCLE_BADGE,
  REAL_FITDOG_LOCKUP_LIGHT
} from "./constants";
import { runFfmpeg } from "./ffmpeg";

export const END_CARD_STILL_FILE = "end-card-still.png";

export async function renderEndCardStill(outputDir: string): Promise<string> {
  mkdirSync(outputDir, { recursive: true });
  const sharp = await loadSharp();
  const stillPath = join(outputDir, END_CARD_STILL_FILE);

  const lockup = await sharp(REAL_FITDOG_LOCKUP_LIGHT)
    .resize({ width: 1180, withoutEnlargement: true })
    .png()
    .toBuffer();
  const badge = await sharp(REAL_FITDOG_CIRCLE_BADGE)
    .resize({ width: 168, height: 168 })
    .png()
    .toBuffer();

  const headlineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOBBY_AD_WIDTH}" height="${LOBBY_AD_HEIGHT}">
    <rect width="100%" height="100%" fill="${FITDOG_BLACK}"/>
    <text x="960" y="268" text-anchor="middle" font-family="Inter" font-size="54" font-weight="800" letter-spacing="6" fill="${FITDOG_WHITE}">${END_CARD_HEADLINE[0]}</text>
    <text x="960" y="338" text-anchor="middle" font-family="Inter" font-size="54" font-weight="800" letter-spacing="4" fill="${FITDOG_WHITE}">FOR A '<tspan fill="${FITDOG_ORANGE}">LAZY DAY</tspan>.'</text>
  </svg>`;

  await sharp(Buffer.from(headlineSvg))
    .composite([
      { input: badge, top: 390, left: 876 },
      { input: lockup, top: 590, left: Math.round((LOBBY_AD_WIDTH - 1180) / 2) }
    ])
    .png()
    .toFile(stillPath);

  return stillPath;
}

export async function renderEndCardVideo(outputPath: string, workDir: string): Promise<string> {
  const still = await renderEndCardStill(workDir);
  mkdirSync(join(outputPath, ".."), { recursive: true });
  runFfmpeg(
    [
      "-y",
      "-loop",
      "1",
      "-i",
      still,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t",
      String(END_CARD_DURATION_SECONDS),
      "-vf",
      `fade=t=in:st=0:d=0.35,fade=t=out:st=1.65:d=0.35,fps=${LOBBY_AD_FPS},format=yuv420p`,
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
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ],
    "end-card render"
  );
  return outputPath;
}

export function endCardUsesRealLogo(source: string): boolean {
  return source.includes(REAL_FITDOG_LOCKUP_LIGHT) && source.includes(REAL_FITDOG_CIRCLE_BADGE);
}

export const END_CARD_FONT_PATHS = { INTER_BOLD, INTER_SEMI };
