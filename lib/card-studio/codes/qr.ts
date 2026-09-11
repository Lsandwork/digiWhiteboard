import type { QrContentType } from "@/lib/card-studio/types";
import { resolveTemplateString } from "@/lib/card-studio/dynamic-fields";
import type { MemberCardContext } from "@/lib/card-studio/types";
import { publicVerificationPath } from "@/lib/card-studio/verify";

export function qrPayload(options: {
  contentType: QrContentType;
  value: string;
  member: MemberCardContext;
  verificationBaseUrl: string;
}) {
  const resolved = resolveTemplateString(options.value, options.member);
  switch (options.contentType) {
    case "verification_url": {
      const token = resolved || options.member.cardUuid || "";
      return `${options.verificationBaseUrl.replace(/\/$/, "")}${publicVerificationPath(token)}`;
    }
    case "member_profile":
      return `fitdog-member:${options.member.memberNumber ?? options.member.cardUuid ?? ""}`;
    case "custom_url":
    case "text":
    case "structured":
      return resolved;
    case "contact":
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${options.member.name}`,
        options.member.email ? `EMAIL:${options.member.email}` : "",
        "END:VCARD"
      ]
        .filter(Boolean)
        .join("\n");
    default:
      return resolved;
  }
}

/** Compact QR-like SVG placeholder that remains square (no distortion). Real modules come from qrcode when available. */
export function qrSvgFallback(payload: string, size: number, foreground = "#0b1b2b", background = "#ffffff") {
  const modules = 21;
  const cell = size / modules;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) hash = (hash * 33 + payload.charCodeAt(i)) >>> 0;
  const rects: string[] = [`<rect width="${size}" height="${size}" fill="${background}" />`];
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      const finder = (x < 7 && y < 7) || (x >= modules - 7 && y < 7) || (x < 7 && y >= modules - 7);
      const bit = finder || ((hash >> ((x * 3 + y) % 16)) & 1);
      if (bit) rects.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${foreground}" />`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rects.join("")}</svg>`;
}

export async function renderQrSvg(payload: string, size: number, foreground = "#0b1b2b", background = "#ffffff") {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toString(payload, {
      type: "svg",
      margin: 1,
      width: size,
      color: { dark: foreground, light: background },
      errorCorrectionLevel: "M"
    });
  } catch {
    return qrSvgFallback(payload, size, foreground, background);
  }
}
