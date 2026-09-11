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
  if (width < 180) return "Barcode is narrower than recommended for reliable Gingr scanning.";
  if (height < 48 && symbology !== "qr" && symbology !== "datamatrix") {
    return "Barcode height may not meet minimum readability.";
  }
  if (quietZone < 8) return "Quiet zone is below 8px and may reduce scan reliability.";
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

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Real Code 128 (or requested symbology) via bwip-js.
 * Never draws a decorative fake barcode — Gingr scanners would reject it.
 */
export async function renderBarcodeSvg(options: {
  symbology: BarcodeSymbology;
  value: string;
  width: number;
  height: number;
  humanReadable: boolean;
  foreground?: string;
  background?: string;
}) {
  const text = options.value.trim();
  if (!text) {
    throw new Error("Barcode value is empty. Gingr will not check in this card.");
  }
  const bwip = await import("bwip-js");
  const png = await bwip.toBuffer({
    bcid: BWIP_MAP[options.symbology] || "code128",
    text,
    scale: 4,
    height: Math.max(12, options.height / 6),
    includetext: options.humanReadable,
    textxalign: "center",
    textsize: 10,
    paddingwidth: 12,
    paddingheight: 6,
    backgroundcolor: (options.background ?? "#ffffff").replace("#", ""),
    barcolor: (options.foreground ?? "#1F2D3D").replace("#", ""),
    parsefnc: false
  });
  const b64 = png.toString("base64");
  if (!b64 || png.length < 80) {
    throw new Error("Barcode encoder produced an empty image. The card was not marked printed.");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}"><image href="data:image/png;base64,${b64}" width="${options.width}" height="${options.height}" preserveAspectRatio="xMidYMid meet" /><title>${escapeXml(text)}</title></svg>`;
}
