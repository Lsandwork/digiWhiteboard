import { FITDOG_BRAND } from "@/lib/fitdog-dashboard/assets";

/** ISO/IEC 7810 ID-1 / CR80 */
export const CARD_SIZE_ID = "cr80" as const;

export const CR80_MM = { width: 85.6, height: 53.98 } as const;
export const CR80_INCHES = { width: 3.375, height: 2.125 } as const;

export const DEFAULT_DPI = 300;

export const CR80_PX = {
  width: 1011,
  height: 638
} as const;

export const DEFAULT_BLEED_MM = 3;
export const DEFAULT_SAFE_MM = 3;

export const CARD_STUDIO_STORAGE_BUCKET = "card-studio-assets";

export const TEMPLATE_SCHEMA_VERSION = 1 as const;

export const CARD_STUDIO_PATHS = {
  root: "/card-studio",
  templates: "/card-studio/templates",
  designer: "/card-studio/designer",
  members: "/card-studio/members",
  printCenter: "/card-studio/print-center",
  printers: "/card-studio/printers",
  printQueue: "/card-studio/print-queue",
  issued: "/card-studio/issued",
  history: "/card-studio/history",
  settings: "/card-studio/settings",
  create: "/card-studio/create",
  batch: "/card-studio/batch",
  forbidden: "/card-studio/forbidden"
} as const;

export const CARD_STUDIO_NAV = [
  { href: CARD_STUDIO_PATHS.root, id: "dashboard", label: "Dashboard" },
  { href: CARD_STUDIO_PATHS.templates, id: "templates", label: "Templates" },
  { href: CARD_STUDIO_PATHS.designer, id: "designer", label: "Card Designer" },
  { href: CARD_STUDIO_PATHS.members, id: "members", label: "Members" },
  { href: CARD_STUDIO_PATHS.printCenter, id: "print-center", label: "Print Center" },
  { href: CARD_STUDIO_PATHS.printers, id: "printers", label: "Printers" },
  { href: CARD_STUDIO_PATHS.printQueue, id: "print-queue", label: "Print Queue" },
  { href: CARD_STUDIO_PATHS.issued, id: "issued", label: "Issued Cards" },
  { href: CARD_STUDIO_PATHS.history, id: "history", label: "Card History" },
  { href: CARD_STUDIO_PATHS.settings, id: "settings", label: "Settings" }
] as const;

export const TEMPLATE_CATEGORIES = [
  "standard_member",
  "vip_member",
  "club_sports_vip",
  "training",
  "boarding",
  "staff",
  "vendor",
  "guest",
  "puppy",
  "senior_dog",
  "founder"
] as const;

export const TEMPLATE_CATEGORY_LABELS: Record<(typeof TEMPLATE_CATEGORIES)[number], string> = {
  standard_member: "Standard Member",
  vip_member: "VIP Member",
  club_sports_vip: "Club + Sports VIP",
  training: "Training",
  boarding: "Boarding",
  staff: "Staff",
  vendor: "Vendor",
  guest: "Guest",
  puppy: "Puppy",
  senior_dog: "Senior Dog",
  founder: "Founder"
};

export const TEMPLATE_STATES = ["draft", "active", "archived"] as const;

export const CARD_STATES = [
  "draft",
  "queued",
  "printed",
  "active",
  "expired",
  "revoked",
  "lost",
  "damaged",
  "replaced"
] as const;

export const PRINT_JOB_STATES = [
  "queued",
  "preparing",
  "rendering",
  "sending",
  "printing",
  "completed",
  "failed",
  "cancelled",
  "retrying",
  "paused",
  "unknown"
] as const;

export const REPRINT_REASONS = [
  "lost_card",
  "damaged_card",
  "updated_photo",
  "membership_upgrade",
  "printer_error",
  "incorrect_print",
  "other"
] as const;

export const REPRINT_REASON_LABELS: Record<(typeof REPRINT_REASONS)[number], string> = {
  lost_card: "Lost Card",
  damaged_card: "Damaged Card",
  updated_photo: "Updated Photo",
  membership_upgrade: "Membership Upgrade",
  printer_error: "Printer Error",
  incorrect_print: "Incorrect Print",
  other: "Other"
};

export const FITDOG_APPROVED_LOGO = FITDOG_BRAND.logoBadge256;
export const FITDOG_APPROVED_WORDMARK = FITDOG_BRAND.wordmark;
export const FITDOG_APPROVED_LOGO_64 = FITDOG_BRAND.logoBadge64;

export const FITDOG_CARD_COLORS = {
  cyan: "#4da3ff",
  sky: "#7dd3fc",
  navy: "#0b1b2b",
  ink: "#0f172a",
  paper: "#f8fafc",
  gold: "#d4af37"
} as const;

export const DYNAMIC_FIELD_KEYS = [
  "member.name",
  "member.first_name",
  "member.last_name",
  "member.member_number",
  "member.membership_type",
  "member.location",
  "member.issue_date",
  "member.expiration_date",
  "member.photo",
  "member.qr_code",
  "member.barcode",
  "member.card_uuid",
  "member.status",
  "member.dog_name",
  "member.dog_breed",
  "member.email",
  "member.custom_field"
] as const;

export function mmToPx(mm: number, dpi = DEFAULT_DPI) {
  return (mm / 25.4) * dpi;
}

export function inchesToPx(inches: number, dpi = DEFAULT_DPI) {
  return inches * dpi;
}

export function cr80AspectRatio() {
  return CR80_MM.width / CR80_MM.height;
}
