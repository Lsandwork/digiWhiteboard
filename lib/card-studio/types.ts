import type {
  CARD_STATES,
  CARD_SIZE_ID,
  PRINT_JOB_STATES,
  REPRINT_REASONS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATES
} from "@/lib/card-studio/constants";

export type CardSizeId = typeof CARD_SIZE_ID | "custom";

export type TemplateState = (typeof TEMPLATE_STATES)[number];
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export type CardState = (typeof CARD_STATES)[number];
export type PrintJobState = (typeof PRINT_JOB_STATES)[number];
export type ReprintReason = (typeof REPRINT_REASONS)[number];

export type CardSide = "front" | "back";

export type CardElementType =
  | "text"
  | "rich_text"
  | "image"
  | "member_photo"
  | "logo"
  | "svg"
  | "shape"
  | "rectangle"
  | "rounded_rectangle"
  | "circle"
  | "line"
  | "icon"
  | "qr_code"
  | "barcode"
  | "signature"
  | "watermark"
  | "background"
  | "dynamic_field"
  | "date"
  | "expiration_date"
  | "member_number"
  | "membership_type"
  | "location"
  | "custom_field"
  | "guilloche"
  | "microtext"
  | "ghost_photo"
  | "hologram_indicator"
  | "uv_indicator";

export type PhotoFramePreset = "portrait" | "square" | "circle" | "rounded_id" | "passport";

export type BarcodeSymbology =
  | "code128"
  | "code39"
  | "ean13"
  | "ean8"
  | "upca"
  | "itf"
  | "pdf417"
  | "datamatrix"
  | "qr";

export type QrContentType =
  | "member_profile"
  | "verification_url"
  | "custom_url"
  | "text"
  | "contact"
  | "structured";

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

export type CardElement = {
  id: string;
  type: CardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  groupId?: string | null;
  properties: Record<string, unknown>;
};

export type CardSideDesign = {
  width: number;
  height: number;
  dpi: number;
  background?: string;
  elements: CardElement[];
};

export type CardTemplateDocument = {
  schemaVersion: number;
  size: CardSizeId;
  dpi: number;
  bleedMm: number;
  safeMm: number;
  sides: "front" | "back" | "both";
  front: CardSideDesign;
  back: CardSideDesign;
};

export type PrinterCapabilities = {
  color: boolean;
  monochrome: boolean;
  duplex: boolean;
  automaticDuplex: boolean;
  manualFlip: boolean;
  edgeToEdge: boolean;
  resolution: number;
  uv: boolean;
  lamination: boolean;
  magneticStripe: boolean;
  smartCard: boolean;
  contactless: boolean;
  usb: boolean;
  ethernet: boolean;
  wifi: boolean;
  osDriver: boolean;
  nativeIntegration: boolean;
};

export type PrinterConnection = "usb" | "ethernet" | "wifi" | "os" | "simulator";

export type PrinterStatusCode =
  | "online"
  | "offline"
  | "busy"
  | "ribbon_empty"
  | "card_stock_empty"
  | "error"
  | "unknown"
  | "adapter_not_installed";

export type MemberCardContext = {
  fitdogOwnerId: string | null;
  fitdogDogId: string | null;
  gingrAnimalId: string | null;
  opsDogId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  memberNumber: string | null;
  membershipType: string | null;
  location: string | null;
  status: string;
  dogName: string | null;
  dogBreed: string | null;
  photoUrl: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  cardUuid: string | null;
  customField: string | null;
};

export type PrintMode = "front" | "back" | "duplex";

export type PrintResultStatus = "success" | "failed" | "unknown";

export type PrintAdapterResult = {
  status: PrintResultStatus;
  message: string;
  raw?: Record<string, unknown>;
};

export type ValidationIssue = {
  severity: "critical" | "warning";
  code: string;
  message: string;
  elementId?: string;
  overrideable: boolean;
};

export type CardStudioSettings = {
  defaultCardSize: CardSizeId;
  defaultDpi: number;
  defaultSafeMm: number;
  defaultBleedMm: number;
  defaultPrinterId: string | null;
  defaultTemplateId: string | null;
  verificationBaseUrl: string;
  barcodeDefaultSymbology: BarcodeSymbology;
  printBridgeRequired: boolean;
};
