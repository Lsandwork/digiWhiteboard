"use client";

import { buildOsPrintHtml } from "@/lib/card-studio/render/os-print-sheet";
import type { PrintMode } from "@/lib/card-studio/types";

export function openOsPrintDialog(options: {
  frontSvg?: string | null;
  backSvg?: string | null;
  mode: PrintMode;
  jobId?: string;
  cardNumber?: string | null;
  memberName?: string | null;
}) {
  const html = buildOsPrintHtml(options);
  const popup = window.open("", "card-studio-os-print", "width=980,height=760");
  if (!popup) {
    throw new Error("The browser blocked the print window. Allow pop-ups, then print again.");
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    popup.print();
  }, 250);
}
