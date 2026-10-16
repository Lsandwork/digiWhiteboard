import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { FITDOG_BLACK, FITDOG_ORANGE, FITDOG_WHITE, LOBBY_AD_HEIGHT, LOBBY_AD_WIDTH } from "./constants";
import { loadSharp } from "../sharp-runtime";
import type { CaptionBlock } from "./types";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colorizeLine(line: string, emphasize: string[]): string {
  let remaining = line;
  const parts: string[] = [];
  const tokens = emphasize.filter(Boolean).sort((a, b) => b.length - a.length);
  while (remaining.length) {
    let hit: { index: number; token: string } | null = null;
    for (const token of tokens) {
      const index = remaining.toUpperCase().indexOf(token.toUpperCase());
      if (index >= 0 && (hit == null || index < hit.index)) hit = { index, token: remaining.slice(index, index + token.length) };
    }
    if (!hit) {
      parts.push(`<tspan fill="${FITDOG_WHITE}">${escapeXml(remaining)}</tspan>`);
      break;
    }
    if (hit.index > 0) {
      parts.push(`<tspan fill="${FITDOG_WHITE}">${escapeXml(remaining.slice(0, hit.index))}</tspan>`);
    }
    parts.push(`<tspan fill="${FITDOG_ORANGE}">${escapeXml(hit.token)}</tspan>`);
    remaining = remaining.slice(hit.index + hit.token.length);
  }
  return parts.join("");
}

export function captionSvg(caption: CaptionBlock): string {
  const yBase = caption.region === "upper" ? 140 : 900;
  const lineHeight = 78;
  const texts = caption.lines.map((line, index) => {
    const y = yBase + index * lineHeight;
    return `<text x="960" y="${y}" text-anchor="middle" font-family="Inter, Liberation Sans, Arial, sans-serif" font-size="64" font-weight="800" letter-spacing="1.5" stroke="${FITDOG_BLACK}" stroke-width="14" paint-order="stroke fill">${colorizeLine(line, caption.emphasize)}</text>`;
  });
  const barY = caption.region === "upper" ? 40 : 800;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOBBY_AD_WIDTH}" height="${LOBBY_AD_HEIGHT}">
  <defs>
    <linearGradient id="captionShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="${caption.region === "upper" ? 0.55 : 0}"/>
      <stop offset="1" stop-color="#000000" stop-opacity="${caption.region === "upper" ? 0 : 0.58}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${barY}" width="${LOBBY_AD_WIDTH}" height="240" fill="url(#captionShade)"/>
  ${texts.join("\n  ")}
</svg>`;
}

export async function writeCaptionPng(caption: CaptionBlock, outputPath: string): Promise<string> {
  mkdirSync(join(outputPath, ".."), { recursive: true });
  const sharp = await loadSharp();
  await sharp(Buffer.from(captionSvg(caption))).png().toFile(outputPath);
  return outputPath;
}
