/**
 * Text extract from Gingr-exported PDFs.
 * Tries literal Tj strings first, then inflates FlateDecode streams (common on reports).
 */

import zlib from "node:zlib";

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

function collectTjStrings(raw: string, joiner: " " | "\n"): string {
  const chunks: string[] = [];

  const tjLiteral = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjLiteral.exec(raw))) {
    chunks.push(decodePdfLiteral(match[1] ?? ""));
  }

  const tjArray = /\[([\s\S]*?)\]\s*TJ/g;
  while ((match = tjArray.exec(raw))) {
    const inner = match[1] ?? "";
    const parts = inner.matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g);
    let line = "";
    for (const part of parts) {
      line += part[1] != null ? decodePdfLiteral(part[1]) : decodePdfHex(part[2] ?? "");
    }
    if (line.trim()) chunks.push(line);
  }

  return chunks
    .join(joiner)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s{3,}/g, "  ")
    .trim();
}

function inflatePdfStreams(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const pages: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    let body = match[1] ?? "";
    if (body.endsWith("\r")) body = body.slice(0, -1);
    try {
      const inflated = zlib.inflateSync(Buffer.from(body, "latin1"));
      const text = collectTjStrings(inflated.toString("latin1"), "\n");
      if (text) pages.push(text);
    } catch {
      // Not a Flate stream we can decode.
    }
  }
  return pages.join("\n\n").trim();
}

export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const direct = collectTjStrings(raw, " ");
  if (direct.length > 120) return direct;
  const inflated = inflatePdfStreams(buffer);
  return inflated || direct;
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}