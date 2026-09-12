import { CR80_PX, DEFAULT_DPI, mmToPx } from "@/lib/card-studio/constants";
import { resolveTemplateString } from "@/lib/card-studio/dynamic-fields";
import { gingrBarcodeValue, typedMemberId } from "@/lib/card-studio/gingr-identity";
import type {
  CardElement,
  CardTemplateDocument,
  MemberCardContext,
  PrinterCapabilities,
  PrintMode,
  ValidationIssue
} from "@/lib/card-studio/types";

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  overrideable: boolean,
  elementId?: string
): ValidationIssue {
  return { severity, code, message, overrideable, elementId };
}

export function validateTemplateDocument(doc: CardTemplateDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (doc.size === "cr80") {
    if (doc.front.width !== CR80_PX.width || doc.front.height !== CR80_PX.height) {
      issues.push(issue("critical", "DIMENSIONS", "Front artwork must use CR80 1011×638 px at 300 DPI.", false));
    }
    if (doc.back.width !== CR80_PX.width || doc.back.height !== CR80_PX.height) {
      issues.push(issue("critical", "DIMENSIONS", "Back artwork must use CR80 1011×638 px at 300 DPI.", false));
    }
  }
  if (doc.dpi < DEFAULT_DPI) {
    issues.push(issue("warning", "DPI", `Template DPI is ${doc.dpi}. Print quality requires at least 300 DPI.`, true));
  }
  for (const side of [doc.front, doc.back] as const) {
    for (const el of side.elements) {
      if (!el.properties.exactArtwork) continue;
      const nativeW = Number(el.properties.nativeWidth ?? 0);
      const nativeH = Number(el.properties.nativeHeight ?? 0);
      if (!nativeW || !nativeH) continue;
      const nativeAspect = nativeW / nativeH;
      const canvasAspect = side.width / side.height;
      if (Math.abs(nativeAspect - canvasAspect) > 0.02) {
        issues.push(
          issue(
            "warning",
            "ARTWORK_ASPECT",
            `Exact artwork is ${nativeW}×${nativeH} and will be letterboxed on CR80 ${side.width}×${side.height}. It will not be stretched.`,
            true,
            el.id
          )
        );
      }
    }
  }
  return issues;
}

export function validateCardForPrint(options: {
  member: MemberCardContext;
  template: CardTemplateDocument;
  sides: PrintMode;
  printerOnline: boolean;
  capabilities: PrinterCapabilities | null;
  photoNaturalWidth?: number | null;
  photoFrameWidth?: number | null;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { member, template, sides, printerOnline, capabilities } = options;

  if (!member.name && !member.dogName) {
    issues.push(issue("critical", "MEMBER", "A member or dog must be selected before printing.", false));
  }
  const barcodeEls = [...template.front.elements, ...template.back.elements].filter((el) => el.type === "barcode" && !el.hidden);
  if (barcodeEls.length) {
    const value = gingrBarcodeValue(member);
    if (!typedMemberId(value)) {
      issues.push(
        issue(
          "critical",
          "GINGR_BARCODE",
          "Type a Member ID number. That number is encoded as the barcode. FIT- card serials are not used.",
          false
        )
      );
    }
  }
  if (!template) {
    issues.push(issue("critical", "TEMPLATE", "A template version is required.", false));
  }

  issues.push(...validateTemplateDocument(template));

  if (!printerOnline) {
    issues.push(
      issue(
        "critical",
        "PRINTER_OFFLINE",
        "RuffOps couldn't reach the selected printer. The card will NOT be marked as printed.",
        false
      )
    );
  }

  if (sides === "duplex" && capabilities && !capabilities.automaticDuplex && !capabilities.manualFlip) {
    issues.push(
      issue(
        "critical",
        "UNSUPPORTED_DUPLEX",
        "This printer does not support automatic duplex printing. Manual back-side printing is available.",
        false
      )
    );
  }

  if (sides === "duplex" && capabilities && !capabilities.automaticDuplex && capabilities.manualFlip) {
    issues.push(
      issue(
        "warning",
        "MANUAL_DUPLEX",
        "This printer does not support automatic duplex printing. Manual back-side printing is available.",
        true
      )
    );
  }

  const sidesToCheck = sides === "back" ? (["back"] as const) : sides === "front" ? (["front"] as const) : (["front", "back"] as const);
  const bleedPx = mmToPx(template.bleedMm, template.dpi);
  const safePx = mmToPx(template.safeMm, template.dpi);

  for (const side of sidesToCheck) {
    const design = template[side];
    if (!design.elements.length && (sides === "duplex" || sides === side)) {
      issues.push(issue("critical", "SIDE_EMPTY", `${side} artwork is required for this print mode.`, false));
    }
    for (const el of design.elements) {
      if (el.hidden) continue;
      issues.push(...validateElement(el, member, design.width, design.height, bleedPx, safePx));
    }
  }

  if (options.photoNaturalWidth && options.photoFrameWidth && options.photoNaturalWidth < options.photoFrameWidth) {
    issues.push(
      issue(
        "warning",
        "PHOTO_LOW_RESOLUTION",
        "The selected photo is lower resolution than the print frame. It will not be silently upscaled to hide this.",
        true
      )
    );
  }

  return issues;
}

function validateElement(
  el: CardElement,
  member: MemberCardContext,
  canvasW: number,
  canvasH: number,
  bleedPx: number,
  safePx: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const text = String(el.properties.text ?? el.properties.value ?? "");
  if (text.includes("{{") && resolveTemplateString(text, member).includes("{{")) {
    issues.push(issue("critical", "DYNAMIC_FIELD", `Dynamic field could not be resolved on ${el.type}.`, false, el.id));
  }

  if (el.type === "member_photo") {
    const src = resolveTemplateString(String(el.properties.src ?? ""), member);
    if (!src) {
      issues.push(issue("warning", "PHOTO_MISSING", "Member photo is missing. Print anyway only if this card does not require a photo.", true, el.id));
    }
  }

  const outsideSafe = el.x < safePx || el.y < safePx || el.x + el.width > canvasW - safePx || el.y + el.height > canvasH - safePx;
  if (outsideSafe && (el.type === "text" || el.type === "dynamic_field" || el.type === "qr_code" || el.type === "barcode")) {
    issues.push(issue("warning", "SAFE_AREA", "An element sits outside the safe area and may be clipped.", true, el.id));
  }

  const outsidePrintable = el.x < -bleedPx || el.y < -bleedPx || el.x + el.width > canvasW + bleedPx || el.y + el.height > canvasH + bleedPx;
  if (outsidePrintable) {
    issues.push(issue("critical", "NON_PRINTABLE", "An element extends into a non-printable region.", false, el.id));
  }

  if (el.type === "qr_code" && (el.width < 64 || el.height < 64)) {
    issues.push(issue("warning", "QR_SIZE", "QR code may be too small for reliable scanning at 300 DPI.", true, el.id));
  }

  if (el.type === "barcode") {
    if (el.x < 12 || el.x + el.width > canvasW - 12) {
      issues.push(issue("warning", "BARCODE_EDGE", "BARCODE TOO CLOSE TO EDGE", true, el.id));
    }
    if (el.width < 180 || el.height < 48) {
      issues.push(issue("warning", "BARCODE_TOO_SMALL", "BARCODE TOO SMALL", true, el.id));
    }
    if (el.height < 40) {
      issues.push(issue("warning", "BARCODE_HEIGHT", "Barcode height may not meet readability requirements.", true, el.id));
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: ValidationIssue[], allowOverride: boolean) {
  return issues.some((item) => item.severity === "critical" || (!allowOverride && item.severity === "warning" && !item.overrideable));
}
