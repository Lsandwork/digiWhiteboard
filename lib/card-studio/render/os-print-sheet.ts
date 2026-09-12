import { CR80_INCHES, CR80_PX } from "@/lib/card-studio/constants";
import type { PrintMode } from "@/lib/card-studio/types";

/** Hairline trim ticks. Use plain inch offsets — `left: -calc(...)` is invalid CSS. */
const MARK_IN = 0.22;
const GAP_IN = 0.125;
const OUT_IN = Number((MARK_IN + GAP_IN).toFixed(3));
const MARK = `${MARK_IN}in`;
const OUT = `${OUT_IN}in`;

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
    pages.push(cardPage("BACK", options.backSvg, options));
  }
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Card Studio OS print ${escapeHtml(options.jobId ?? "")}</title>
  <style>
    @page { size: letter portrait; margin: 0.6in; }
    html, body { margin: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
    * { outline: none !important; box-shadow: none !important; }
    svg, img, canvas { border: 0 !important; outline: none !important; }
    .sheet { page-break-after: always; text-align: center; }
    .sheet:last-child { page-break-after: auto; }
    h1 { font-size: 11px; margin: 0 0 6px; letter-spacing: 0.12em; font-weight: 700; }
    .meta { font-size: 11px; color: #444; margin-bottom: 12px; }
    .frame {
      width: ${CR80_INCHES.width}in;
      height: ${CR80_INCHES.height}in;
      position: relative;
      display: inline-block;
      margin: ${OUT} auto 0;
      border: 0;
      background: transparent;
    }
    .tick {
      position: absolute;
      background: #111;
      pointer-events: none;
    }
    .tick-h { height: 0.5pt; width: ${MARK}; }
    .tick-v { width: 0.5pt; height: ${MARK}; }
    .tick-h.tl { top: 0; left: -${OUT}; }
    .tick-v.tl { left: 0; top: -${OUT}; }
    .tick-h.tr { top: 0; right: -${OUT}; }
    .tick-v.tr { right: 0; top: -${OUT}; }
    .tick-h.bl { bottom: 0; left: -${OUT}; }
    .tick-v.bl { left: 0; bottom: -${OUT}; }
    .tick-h.br { bottom: 0; right: -${OUT}; }
    .tick-v.br { right: 0; bottom: -${OUT}; }
    .art {
      width: ${CR80_INCHES.width}in;
      height: ${CR80_INCHES.height}in;
      overflow: hidden;
      border: 0;
      background: transparent;
    }
    .art svg {
      width: 100%;
      height: 100%;
      display: block;
      border: 0;
      overflow: hidden;
    }
    .note { font-size: 11px; margin-top: 28px; text-align: center; color: #333; }
    @media print {
      .no-print { display: none !important; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <p class="no-print" style="padding:12px;font-size:13px;text-align:left;">Choose your normal office printer in the dialog. Paper: Letter. Card size is true CR80 (${CR80_INCHES.width} in × ${CR80_INCHES.height}in / ${CR80_PX.width}×${CR80_PX.height}px at 300 DPI). The ticks at each corner are trim marks — they do not print a box around the card. Set Actual size / 100%.</p>
  ${pages.join("")}
</body>
</html>`;
}

function trimMarks() {
  return [
    "tick tick-h tl",
    "tick tick-v tl",
    "tick tick-h tr",
    "tick tick-v tr",
    "tick tick-h bl",
    "tick tick-v bl",
    "tick tick-h br",
    "tick tick-v br"
  ]
    .map((cls) => `<span class="${cls}"></span>`)
    .join("");
}

function cardPage(label: string, svg: string, options: { jobId?: string; cardNumber?: string | null; memberName?: string | null }) {
  return `<section class="sheet">
    <h1>${escapeHtml(label)}</h1>
    <div class="meta">${escapeHtml([options.memberName, options.cardNumber, options.jobId].filter(Boolean).join(" · "))}</div>
    <div class="frame">
      ${trimMarks()}
      <div class="art">${stripPrintChrome(svg)}</div>
    </div>
    <p class="note">CR80 / ID-1 · ${CR80_INCHES.width} in × ${CR80_INCHES.height} in · do not scale in the printer dialog (set Actual size / 100%).</p>
  </section>`;
}

/** Proof sheets must never inherit designer bleed/guide strokes. */
export function stripPrintChrome(svg: string) {
  return svg
    .replace(/\sstroke="#4da3ff"/gi, ' stroke="none"')
    .replace(/\sstroke="#4DA3FF"/g, ' stroke="none"')
    .replace(/\sstroke="rgba\(77,\s*163,\s*255[^"]*"\)/gi, ' stroke="none"');
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
