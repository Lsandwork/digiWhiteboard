import { CR80_PX, DEFAULT_BLEED_MM, DEFAULT_DPI, DEFAULT_SAFE_MM, TEMPLATE_SCHEMA_VERSION } from "@/lib/card-studio/constants";
import type { CardElement, CardElementType, CardSideDesign, CardTemplateDocument } from "@/lib/card-studio/types";

export function createElementId() {
  return `element_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function emptySide(dpi = DEFAULT_DPI): CardSideDesign {
  return {
    width: CR80_PX.width,
    height: CR80_PX.height,
    dpi,
    background: "#0b1b2b",
    elements: []
  };
}

export function emptyTemplateDocument(): CardTemplateDocument {
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    size: "cr80",
    dpi: DEFAULT_DPI,
    bleedMm: DEFAULT_BLEED_MM,
    safeMm: DEFAULT_SAFE_MM,
    sides: "both",
    front: emptySide(DEFAULT_DPI),
    back: emptySide(DEFAULT_DPI)
  };
}

const ELEMENT_DEFAULTS: Partial<Record<CardElementType, Partial<CardElement>>> = {
  text: { width: 280, height: 36 },
  rich_text: { width: 320, height: 72 },
  image: { width: 160, height: 160 },
  member_photo: { width: 168, height: 210 },
  logo: { width: 96, height: 96 },
  svg: { width: 96, height: 96 },
  shape: { width: 160, height: 80 },
  rectangle: { width: 200, height: 80 },
  rounded_rectangle: { width: 200, height: 80 },
  circle: { width: 96, height: 96 },
  line: { width: 240, height: 4 },
  icon: { width: 40, height: 40 },
  qr_code: { width: 96, height: 96 },
  barcode: { width: 240, height: 64 },
  signature: { width: 180, height: 56 },
  watermark: { width: 280, height: 80 },
  background: { width: CR80_PX.width, height: CR80_PX.height, x: 0, y: 0 },
  dynamic_field: { width: 280, height: 32 },
  date: { width: 180, height: 28 },
  expiration_date: { width: 180, height: 28 },
  member_number: { width: 200, height: 28 },
  membership_type: { width: 200, height: 28 },
  location: { width: 200, height: 28 },
  custom_field: { width: 220, height: 28 },
  guilloche: { width: CR80_PX.width, height: CR80_PX.height },
  microtext: { width: 320, height: 16 },
  ghost_photo: { width: 80, height: 100 },
  hologram_indicator: { width: 64, height: 64 },
  uv_indicator: { width: 64, height: 24 }
};

export function createElement(type: CardElementType, overrides: Partial<CardElement> = {}): CardElement {
  const defaults = ELEMENT_DEFAULTS[type] ?? {};
  const merged: CardElement = {
    id: createElementId(),
    type,
    x: 48,
    y: 48,
    width: 160,
    height: 48,
    rotation: 0,
    locked: false,
    hidden: false,
    groupId: null,
    properties: defaultProperties(type),
    ...defaults,
    ...overrides
  };
  merged.type = type;
  merged.properties = { ...defaultProperties(type), ...(defaults.properties ?? {}), ...(overrides.properties ?? {}) };
  return merged;
}

export function defaultProperties(type: CardElementType): Record<string, unknown> {
  switch (type) {
    case "text":
    case "rich_text":
    case "dynamic_field":
    case "date":
    case "expiration_date":
    case "member_number":
    case "membership_type":
    case "location":
    case "custom_field":
    case "microtext":
      return {
        text: defaultText(type),
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: type === "microtext" ? 6 : 16,
        fontWeight: 600,
        italic: false,
        underline: false,
        letterSpacing: 0,
        lineHeight: 1.2,
        color: "#f8fafc",
        textAlign: "left",
        verticalAlign: "middle",
        opacity: 1
      };
    case "member_photo":
    case "ghost_photo":
      return {
        src: "",
        fit: "cover",
        frame: "rounded_id",
        cropX: 50,
        cropY: 50,
        zoom: 1,
        rotate: 0,
        brightness: 0,
        contrast: 0,
        exposure: 0,
        saturation: 0,
        opacity: type === "ghost_photo" ? 0.28 : 1,
        borderRadius: 12
      };
    case "logo":
    case "image":
    case "svg":
    case "icon":
    case "signature":
    case "watermark":
      return {
        src: type === "logo" ? "" : "",
        fit: "contain",
        opacity: type === "watermark" ? 0.18 : 1,
        brightness: 0,
        contrast: 0,
        rotate: 0
      };
    case "qr_code":
      return {
        contentType: "verification_url",
        value: "{{member.card_uuid}}",
        errorCorrection: "M",
        foreground: "#0b1b2b",
        background: "#ffffff"
      };
    case "barcode":
      return {
        symbology: "code128",
        value: "{{member.barcode}}",
        humanReadable: true,
        quietZone: 8,
        foreground: "#0b1b2b",
        background: "#ffffff"
      };
    case "rectangle":
    case "rounded_rectangle":
    case "circle":
    case "shape":
    case "line":
    case "background":
    case "guilloche":
    case "hologram_indicator":
    case "uv_indicator":
      return {
        fill: type === "background" ? "#0b1b2b" : "rgba(77,163,255,0.18)",
        borderColor: "#4da3ff",
        borderWidth: type === "line" ? 2 : 1,
        borderRadius: type === "rounded_rectangle" ? 16 : 0,
        opacity: 1,
        shadow: false
      };
    default:
      return {};
  }
}

function defaultText(type: CardElementType) {
  switch (type) {
    case "dynamic_field":
      return "{{member.name}}";
    case "date":
      return "{{member.issue_date}}";
    case "expiration_date":
      return "Exp {{member.expiration_date}}";
    case "member_number":
      return "{{member.member_number}}";
    case "membership_type":
      return "{{member.membership_type}}";
    case "location":
      return "{{member.location}}";
    case "custom_field":
      return "{{member.custom_field}}";
    case "microtext":
      return "FITDOG MEMBER • AUTHORIZED USE ONLY • {{member.card_uuid}}";
    default:
      return "Text";
  }
}

export function cloneDocument(doc: CardTemplateDocument): CardTemplateDocument {
  return JSON.parse(JSON.stringify(doc)) as CardTemplateDocument;
}

export function parseTemplateDocument(value: unknown): CardTemplateDocument {
  if (!value || typeof value !== "object") return emptyTemplateDocument();
  const raw = value as Partial<CardTemplateDocument>;
  const base = emptyTemplateDocument();
  return {
    ...base,
    ...raw,
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : TEMPLATE_SCHEMA_VERSION,
    front: normalizeSide(raw.front, base.front),
    back: normalizeSide(raw.back, base.back)
  };
}

function normalizeSide(side: Partial<CardSideDesign> | undefined, fallback: CardSideDesign): CardSideDesign {
  return {
    width: side?.width ?? fallback.width,
    height: side?.height ?? fallback.height,
    dpi: side?.dpi ?? fallback.dpi,
    background: side?.background ?? fallback.background,
    elements: Array.isArray(side?.elements) ? side.elements.map(normalizeElement) : []
  };
}

function normalizeElement(element: CardElement): CardElement {
  return {
    id: element.id || createElementId(),
    type: element.type,
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    width: Number(element.width) || 40,
    height: Number(element.height) || 40,
    rotation: Number(element.rotation) || 0,
    locked: Boolean(element.locked),
    hidden: Boolean(element.hidden),
    name: element.name,
    groupId: element.groupId ?? null,
    properties: element.properties && typeof element.properties === "object" ? element.properties : {}
  };
}

export function migrateTemplateDocument(doc: CardTemplateDocument): CardTemplateDocument {
  if (doc.schemaVersion === TEMPLATE_SCHEMA_VERSION) return doc;
  return { ...doc, schemaVersion: TEMPLATE_SCHEMA_VERSION };
}
