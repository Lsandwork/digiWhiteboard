import { resolveTemplateString } from "@/lib/card-studio/dynamic-fields";
import type { CardElement, CardSideDesign, MemberCardContext } from "@/lib/card-studio/types";
import { publicVerificationPath } from "@/lib/card-studio/verify";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fillOf(el: CardElement, fallback = "#4da3ff") {
  return String(el.properties.fill ?? el.properties.background ?? fallback);
}

export function verificationUrlFor(member: MemberCardContext, baseUrl: string) {
  const token = member.cardUuid ?? "";
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}${publicVerificationPath(token)}`;
}

export function renderSideSvg(
  side: CardSideDesign,
  member: MemberCardContext,
  options?: { verificationBaseUrl?: string; qrSvg?: Record<string, string>; barcodeSvg?: Record<string, string> }
): string {
  const parts: string[] = [];
  const bg = side.background ?? "#0b1b2b";
  parts.push(`<rect width="${side.width}" height="${side.height}" fill="${esc(bg)}" />`);

  for (const el of side.elements) {
    if (el.hidden) continue;
    const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.width / 2} ${el.height / 2})`;
    parts.push(`<g transform="${transform}" opacity="${Number(el.properties.opacity ?? 1)}">`);
    parts.push(renderElement(el, member, options));
    parts.push(`</g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side.width}" height="${side.height}" viewBox="0 0 ${side.width} ${side.height}">${parts.join("")}</svg>`;
}

function renderElement(
  el: CardElement,
  member: MemberCardContext,
  options?: { verificationBaseUrl?: string; qrSvg?: Record<string, string>; barcodeSvg?: Record<string, string> }
) {
  const radius = Number(el.properties.borderRadius ?? (el.type === "circle" ? el.width / 2 : 0));
  switch (el.type) {
    case "background":
    case "rectangle":
    case "rounded_rectangle":
    case "shape":
    case "guilloche":
      const strokeWidth = el.type === "background" ? 0 : Number(el.properties.borderWidth ?? 0);
      const stroke = strokeWidth > 0 ? esc(String(el.properties.borderColor ?? "none")) : "none";
      return `<rect width="${el.width}" height="${el.height}" rx="${radius}" fill="${esc(fillOf(el))}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    case "circle":
      return `<ellipse cx="${el.width / 2}" cy="${el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${esc(fillOf(el))}" />`;
    case "line":
      return `<rect width="${el.width}" height="${Math.max(1, el.height)}" fill="${esc(String(el.properties.borderColor ?? "#4da3ff"))}" />`;
    case "qr_code":
      return options?.qrSvg?.[el.id] ?? `<rect width="${el.width}" height="${el.height}" fill="#fff" /><text x="8" y="${el.height / 2}" font-size="10" fill="#0b1b2b">QR</text>`;
    case "barcode":
      if (options?.barcodeSvg?.[el.id]) return options.barcodeSvg[el.id];
      if (el.properties.keepArtworkWhenEmpty) return "";
      return `<rect width="${el.width}" height="${el.height}" fill="#fff" /><text x="8" y="${el.height / 2}" font-size="10" fill="#0b1b2b">BARCODE</text>`;
    case "svg":
    case "icon": {
      const markup = String(el.properties.markup ?? "");
      if (markup) return markup;
      const src = resolveTemplateString(String(el.properties.src ?? ""), member);
      if (!src) return "";
      return `<image href="${esc(src)}" width="${el.width}" height="${el.height}" preserveAspectRatio="xMidYMid meet" />`;
    }
    case "member_photo":
    case "image":
    case "logo":
    case "signature":
    case "watermark":
    case "ghost_photo": {
      const src = resolveTemplateString(String(el.properties.src ?? ""), member);
      const rx = radius || (el.type === "member_photo" ? 16 : 0);
      if (!src) {
        if (el.properties.keepArtworkWhenEmpty) return "";
        return `<rect width="${el.width}" height="${el.height}" rx="${rx}" fill="#e8e8e8" stroke="#F37021" stroke-width="2"/><text x="${el.width / 2}" y="${el.height / 2}" text-anchor="middle" fill="#1F2D3D" font-size="14" font-weight="700">Replace photo</text>`;
      }
      const clipId = `clip_${el.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
      const ratio = el.properties.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice";
      const cover = el.type === "member_photo"
        ? `<rect width="${el.width}" height="${el.height}" rx="${rx}" fill="#ffffff"/>`
        : "";
      return `${cover}<defs><clipPath id="${clipId}"><rect width="${el.width}" height="${el.height}" rx="${rx}"/></clipPath></defs><image href="${esc(src)}" width="${el.width}" height="${el.height}" preserveAspectRatio="${ratio}" clip-path="url(#${clipId})"/>`;
    }
    default: {
      const raw = String(el.properties.text ?? "");
      let text = resolveTemplateString(raw, member);
      if (el.properties.textTransform === "uppercase") text = text.toUpperCase();
      if (!text && el.properties.keepArtworkWhenEmpty) return "";
      const size = Number(el.properties.fontSize ?? 16);
      const weight = Number(el.properties.fontWeight ?? 600);
      const color = String(el.properties.color ?? "#f8fafc");
      const italic = el.properties.italic ? "italic" : "normal";
      const anchor =
        el.properties.textAlign === "center" ? "middle" : el.properties.textAlign === "right" ? "end" : "start";
      const x = el.properties.textAlign === "center" ? el.width / 2 : el.properties.textAlign === "right" ? el.width : 0;
      const y = el.height / 2 + size / 3;
      const fill = el.properties.background ? `<rect width="${el.width}" height="${el.height}" fill="${esc(String(el.properties.background))}" />` : "";
      return `${fill}<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" font-style="${italic}" font-family="${esc(String(el.properties.fontFamily ?? "Arial, Helvetica, sans-serif"))}" fill="${esc(color)}" text-anchor="${anchor}">${esc(text)}</text>`;
    }
  }
}

export function cr80ViewBox(width: number, height: number) {
  return { width, height, aspect: width / height };
}
