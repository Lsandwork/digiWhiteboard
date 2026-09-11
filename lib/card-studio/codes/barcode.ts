import type { BarcodeSymbology } from "@/lib/card-studio/types";

export const BARCODE_LABELS: Record<BarcodeSymbology, string> = {
  code128: "Code 128",
  code39: "Code 39",
  ean13: "EAN-13",
  ean8: "EAN-8",
  upca: "UPC-A",
  itf: "ITF",
  pdf417: "PDF417",
  datamatrix: "Data Matrix",
  qr: "QR"
};

export function suggestedSymbologies(value: string): BarcodeSymbology[] {
  const trimmed = value.trim();
  if (/^\d{13}$/.test(trimmed)) return ["ean13", "code128"];
  if (/^\d{12}$/.test(trimmed)) return ["upca", "ean13", "code128"];
  if (/^\d{8}$/.test(trimmed)) return ["ean8", "code128"];
  if (/^\d+$/.test(trimmed)) return ["code128", "itf", "code39"];
  if (/^[A-Z0-9\-\.\ \$\/\+\%]+$/i.test(trimmed)) return ["code128", "code39"];
  return ["code128", "qr", "pdf417", "datamatrix"];
}

export function barcodeReadableWarning(symbology: BarcodeSymbology, width: number, height: number, quietZone: number) {
  if (width < 120) return "Barcode is narrower than recommended for reliable scanning.";
  if (height < 40 && symbology !== "qr" && symbology !== "datamatrix") {
    return "Barcode height may not meet minimum readability.";
  }
  if (quietZone < 6) return "Quiet zone is below 6px and may reduce scan reliability.";
  return null;
}

const BWIP_MAP: Record<BarcodeSymbology, string> = {
  code128: "code128",
  code39: "code39",
  ean13: "ean13",
  ean8: "ean8",
  upca: "upca",
  itf: "interleaved2of5",
  pdf417: "pdf417",
  datamatrix: "datamatrix",
  qr: "qrcode"
};

export function barcodeSvgFallback(value: string, width: number, height: number, humanReadable: boolean) {
  const bars: string[] = [`<rect width="${width}" height="${height}" fill="#ffffff" />`];
  let seed = 0;
  for (let i = 0; i < value.length; i++) seed = (seed * 31 + value.charCodeAt(i)) >>> 0;
  const usable = width - 16;
  const barCount = 48;
  const w = usable / barCount;
  for (let i = 0; i < barCount; i++) {
    if ((seed >> (i % 16)) & 1) {
      bars.push(`<rect x="${8 + i * w}" y="6" width="${Math.max(1, w * 0.7)}" height="${height - (humanReadable ? 22 : 12)}" fill="#0b1b2b" />`);
    }
  }
  if (humanReadable) {
    bars.push(
      `<text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="11" font-family="Arial" fill="#0b1b2b">${escapeXml(value)}</text>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars.join("")}</svg>`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function renderBarcodeSvg(options: {
  symbology: BarcodeSymbology;
  value: string;
  width: number;
  height: number;
  humanReadable: boolean;
  foreground?: string;
  background?: string;
}) {
  try {
    const bwip = await import("bwip-js");
    const png = await bwip.toBuffer({
      bcid: BWIP_MAP[options.symbology],
      text: options.value,
      scale: 3,
      height: Math.max(8, options.height / 8),
      includetext: options.humanReadable,
      textxalign: "center",
      backgroundcolor: (options.background ?? "#ffffff").replace("#", ""),
      barcolor: (options.foreground ?? "#0b1b2b").replace("#", "")
    });
    const b64 = png.toString("base64");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}"><image href="data:image/png;base64,${b64}" width="${options.width}" height="${options.height}" /></svg>`;
  } catch {
    return barcodeSvgFallback(options.value, options.width, options.height, options.humanReadable);
  }
}
