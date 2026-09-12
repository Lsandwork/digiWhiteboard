import type { BarcodeSymbology } from "@/lib/card-studio/types";
import { evaluateUpcA } from "@/lib/card-studio/upc-a";

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

function pngSize(png: Buffer) {
  if (png.length < 24 || png.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Standards-compliant barcode via bwip-js.
 * UPC-A is letterboxed in the slot (uniform scale). Never a decorative fake barcode.
 */
export async function renderBarcodeSvg(options: {
  symbology: BarcodeSymbology;
  value: string;
  width: number;
  height: number;
  humanReadable: boolean;
  foreground?: string;
  background?: string;
  quietZone?: number;
}) {
  const text = options.value.trim();
  if (!text) {
    throw new Error("Barcode value is empty. Gingr will not check in this card.");
  }
  const symbology = options.symbology || "code128";
  if (symbology === "upca") {
    const upc = evaluateUpcA(text);
    if (upc.status !== "VALID" || !upc.value) {
      throw new Error(upc.message);
    }
  }
  const quiet = Math.max(10, Number(options.quietZone ?? 12));
  const bwip = await import("bwip-js");
  const png = await bwip.toBuffer({
    bcid: BWIP_MAP[symbology] || "code128",
    text: symbology === "upca" ? evaluateUpcA(text).value! : text,
    scale: 8,
    height: Math.max(16, Math.round((options.height / 8) * 0.55)),
    includetext: options.humanReadable,
    textxalign: "center",
    textsize: 11,
    paddingwidth: Math.max(12, Math.round(quiet / 2)),
    paddingheight: 8,
    backgroundcolor: (options.background ?? "#ffffff").replace("#", ""),
    barcolor: (options.foreground ?? "#1F2D3D").replace("#", ""),
    parsefnc: false
  });
  const b64 = png.toString("base64");
  if (!b64 || png.length < 80) {
    throw new Error("Barcode encoder produced an empty image. The card was not marked printed.");
  }
  const size = pngSize(png);
  const title = escapeXml(symbology === "upca" ? evaluateUpcA(text).value! : text);
  if (size && size.width > 0 && size.height > 0) {
    const scale = Math.min(options.width / size.width, options.height / size.height);
    const dw = size.width * scale;
    const dh = size.height * scale;
    const dx = (options.width - dw) / 2;
    const dy = (options.height - dh) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}"><rect width="${options.width}" height="${options.height}" fill="${escapeXml(options.background ?? "#ffffff")}"/><image href="data:image/png;base64,${b64}" x="${dx}" y="${dy}" width="${dw}" height="${dh}" preserveAspectRatio="none" /><title>${title}</title></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}"><image href="data:image/png;base64,${b64}" width="${options.width}" height="${options.height}" preserveAspectRatio="xMidYMid meet" /><title>${title}</title></svg>`;
}
