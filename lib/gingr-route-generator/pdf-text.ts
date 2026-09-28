/**
 * Best-effort text extract from a Gingr-exported PDF (no extra PDF library).
 * Handles literal Tj/TJ strings used by typical reservation report prints.
 */

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
    return out;
  }
  return String.fromCharCode(...bytes);
}

export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];

  const tjLiteral = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjLiteral.exec(raw))) {
    chunks.push(decodePdfLiteral(match[1] ?? ""));
  }

  const tjArray = /\[(.*?)\]\s*TJ/gs;
  while ((match = tjArray.exec(raw))) {
    const inner = match[1] ?? "";
    const parts = inner.matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g);
    let line = "";
    for (const part of parts) {
      line += part[1] != null ? decodePdfLiteral(part[1]) : decodePdfHex(part[2] ?? "");
    }
    if (line.trim()) chunks.push(line);
  }

  const text = chunks
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s{3,}/g, "  ")
    .trim();
  return text;
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}
