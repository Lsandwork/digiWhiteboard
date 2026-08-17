import { isFullAdminRole } from "@/lib/admin/users";
import type { TlLodgingAreaKey } from "./constants";

export type TlOvernightLodgingArea = "den" | "petite_suite" | "suite";

export type TlOvernightReservationTypeMapping = {
  /** Gingr reservation_type.id — Fitdog: 4 Den, 12 Petite Suite, 3 Suite. */
  id: string;
  areaKey: TlOvernightLodgingArea;
  /** Substring match against reservation_type.type / name (case-insensitive). */
  labelContains: string;
};

export type TlDigiBoardDisplaySettings = {
  /** TV / public board title. */
  displayTitle: string;
  /** When false, public board can show disabled state. */
  enabled: boolean;
  /** Show OTHER / SPECIAL schedule rows on the board. */
  showOtherSpecial: boolean;
  /** Prefer run_name lodging labels when back_of_house provides them. */
  preferBackOfHouseLodging: boolean;
};

export type TlDigiBoardProtectedFlags = {
  /** When true, overnight type ids/labels cannot be cleared to empty via patch. */
  lockOvernightTypeMappings: boolean;
  /** Legacy flag — no longer forces false; kept for config compatibility. */
  lockAdministrationStatusUnavailable: boolean;
};

export type TlDigiBoardConfig = {
  lodging: {
    overnightReservationTypes: TlOvernightReservationTypeMapping[];
    /** Area keys allowed on the overnight medication board. */
    approvedAreaKeys: TlOvernightLodgingArea[];
  };
  display: TlDigiBoardDisplaySettings;
  protected: TlDigiBoardProtectedFlags;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const DEFAULT_TL_DIGI_BOARD_CONFIG: TlDigiBoardConfig = {
  lodging: {
    overnightReservationTypes: [
      { id: "4", areaKey: "den", labelContains: "Overnight: Den" },
      { id: "12", areaKey: "petite_suite", labelContains: "Overnight: Petite Suite" },
      { id: "3", areaKey: "suite", labelContains: "Overnight: Suite" }
    ],
    approvedAreaKeys: ["den", "petite_suite", "suite"]
  },
  display: {
    displayTitle: "Team Lead Alerts + Reminders",
    enabled: true,
    showOtherSpecial: true,
    preferBackOfHouseLodging: true
  },
  protected: {
    lockOvernightTypeMappings: true,
    lockAdministrationStatusUnavailable: false
  },
  updatedAt: null,
  updatedBy: null
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function readBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  const token = String(value).trim().toLowerCase();
  if (token === "true" || token === "1" || token === "yes") return true;
  if (token === "false" || token === "0" || token === "no") return false;
  return fallback;
}

const AREA_KEYS = new Set<TlOvernightLodgingArea>(["den", "petite_suite", "suite"]);

function parseAreaKey(value: unknown): TlOvernightLodgingArea | null {
  const text = readString(value);
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/\s+/g, "_") as TlOvernightLodgingArea;
  return AREA_KEYS.has(normalized) ? normalized : null;
}

function parseOvernightMapping(value: unknown): TlOvernightReservationTypeMapping | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = readString(row.id);
  const areaKey = parseAreaKey(row.areaKey);
  const labelContains = readString(row.labelContains);
  if (!id || !areaKey || !labelContains) return null;
  return { id, areaKey, labelContains };
}

export function parseTlDigiBoardConfig(value: unknown): TlDigiBoardConfig {
  const root = asRecord(value);
  if (!root) return { ...DEFAULT_TL_DIGI_BOARD_CONFIG, display: { ...DEFAULT_TL_DIGI_BOARD_CONFIG.display } };

  const lodgingRaw = asRecord(root.lodging);
  const displayRaw = asRecord(root.display) ?? root;
  const protectedRaw = asRecord(root.protected);

  const defaults = DEFAULT_TL_DIGI_BOARD_CONFIG;

  let overnightReservationTypes = defaults.lodging.overnightReservationTypes;
  if (lodgingRaw && Array.isArray(lodgingRaw.overnightReservationTypes)) {
    const parsed = lodgingRaw.overnightReservationTypes
      .map(parseOvernightMapping)
      .filter((row): row is TlOvernightReservationTypeMapping => Boolean(row));
    if (parsed.length) overnightReservationTypes = parsed;
  }

  let approvedAreaKeys = defaults.lodging.approvedAreaKeys;
  if (lodgingRaw && Array.isArray(lodgingRaw.approvedAreaKeys)) {
    const parsed = lodgingRaw.approvedAreaKeys
      .map(parseAreaKey)
      .filter((key): key is TlOvernightLodgingArea => Boolean(key));
    if (parsed.length) approvedAreaKeys = [...new Set(parsed)];
  }

  // Support legacy flat displayTitle/enabled at root (admin panel stubs).
  const displayTitle =
    readString(displayRaw?.displayTitle) ??
    readString(root.displayTitle) ??
    defaults.display.displayTitle;

  return {
    lodging: {
      overnightReservationTypes,
      approvedAreaKeys
    },
    display: {
      displayTitle,
      enabled: readBool(displayRaw?.enabled ?? root.enabled, defaults.display.enabled),
      showOtherSpecial: readBool(displayRaw?.showOtherSpecial, defaults.display.showOtherSpecial),
      preferBackOfHouseLodging: readBool(
        displayRaw?.preferBackOfHouseLodging,
        defaults.display.preferBackOfHouseLodging
      )
    },
    protected: {
      lockOvernightTypeMappings: readBool(
        protectedRaw?.lockOvernightTypeMappings,
        defaults.protected.lockOvernightTypeMappings
      ),
      lockAdministrationStatusUnavailable: readBool(
        protectedRaw?.lockAdministrationStatusUnavailable,
        defaults.protected.lockAdministrationStatusUnavailable
      )
    },
    updatedAt: readString(root.updatedAt),
    updatedBy: readString(root.updatedBy)
  };
}

export function canManageTlDigiBoardConfig(role?: string | null): boolean {
  return isFullAdminRole(role);
}

/** Canonical lodging area used on board rows (singular keys). */
export function toBoardLodgingAreaKey(areaKey: TlOvernightLodgingArea | null): TlLodgingAreaKey | null {
  return areaKey;
}

/** Flat admin-panel view of config (title/enabled + audit fields). */
export function toTlDigiBoardAdminConfigView(config: TlDigiBoardConfig) {
  return {
    displayTitle: config.display.displayTitle,
    enabled: config.display.enabled,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
    lodging: config.lodging,
    display: config.display,
    protected: config.protected
  };
}
