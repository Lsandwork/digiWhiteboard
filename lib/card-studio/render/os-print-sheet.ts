import { CR80_INCHES, CR80_PX } from "@/lib/card-studio/constants";
import type { PrintMode } from "@/lib/card-studio/types";

export function buildOsPrintHtml(options: {
  frontSvg?: string | null;
  backSvg?: string | null;
  mode: PrintMode;
  jobId?: string;
  cardNumber?: string | null;
  memberName?: string | null;
}) {
  const pages: string[] = [];
  if (options.mode !== "back" && options.frontSvg) {
    pages.push(cardPage("FRONT", options.frontSvg, options));
  }
  if (options.mode !== "front" && options.backSvg) {
    pages.push(cardPage("BACK — flip the sheet if this printer is not duplex", options.backSvg, options));
  }
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Card Studio OS print ${options.jobId ?? ""}</title>
  <style>
    @page { size: letter portrait; margin: 0.5in; }
    html, body { margin: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    h1 { font-size: 12px; margin: 0 0 8px; letter-spacing: 0.08em; }
    .meta { font-size: 11px; color: #444; margin-bottom: 16px; }
    .frame {
      width: ${CR80_INCHES.width}in;
      height: ${CR80_INCHES.height}in;
      position: relative;
      margin: 24px auto 0;
    }
    .crop {
      position: absolute;
      width: 10px;
      height: 10px;
      border-color: #111;
      border-style: solid;
    }
    .crop-tl { top: -10px; left: -10px; border-width: 1px 0 0 1px; }
    .crop-tr { top: -10px; right: -10px; border-width: 1px 1px 0 0; }
    .crop-bl { bottom: -10px; left: -10px; border-width: 0 0 1px 1px; }
    .crop-br { bottom: -10px; right: -10px; border-width: 0 1px 1px 0; }
    .art {
      width: ${CR80_INCHES.width}in;
      height: ${CR80_INCHES.height}in;
      overflow: hidden;
    }
    .art svg { width: 100%; height: 100%; display: block; }
    .note { font-size: 11px; margin-top: 18px; text-align: center; color: #333; }
    @media print {
      .no-print { display: none !important; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <p class="no-print" style="padding:12px;font-size:13px;">Choose your normal office printer in the dialog. Paper: Letter. Card size is true CR80 (${CR80_INCHES.width} in × ${CR80_INCHES.height}in / ${CR80_PX.width}×${CR80_PX.height}px at 300 DPI). Cut on the crop marks.</p>
  ${pages.join("")}
</body>
</html>`;
}

function cardPage(label: string, svg: string, options: { jobId?: string; cardNumber?: string | null; memberName?: string | null }) {
  return `<section class="sheet">
    <h1>${escapeHtml(label)}</h1>
    <div class="meta">${escapeHtml([options.memberName, options.cardNumber, options.jobId].filter(Boolean).join(" · "))}</div>
    <div class="frame">
      <span class="crop crop-tl"></span>
      <span class="crop crop-tr"></span>
      <span class="crop crop-bl"></span>
      <span class="crop crop-br"></span>
      <div class="art">${svg}</div>
    </div>
    <p class="note">CR80 / ID-1 · ${CR80_INCHES.width} in × ${CR80_INCHES.height} in · do not scale in the printer dialog (set Actual size / 100%).</p>
  </section>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function osPrintUsesDialog(printer: { adapter_id?: string | null; adapterId?: string | null; id?: string }) {
  const adapter = printer.adapter_id || printer.adapterId || "";
  return adapter === "generic-os" || printer.id === "os-office";
}
