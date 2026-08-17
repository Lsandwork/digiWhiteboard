import { getServiceSupabase } from "@/lib/supabase/server";
import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";
import {
  canManageTlDigiBoardConfig,
  DEFAULT_TL_DIGI_BOARD_CONFIG,
  parseTlDigiBoardConfig,
  toTlDigiBoardAdminConfigView,
  type TlDigiBoardConfig,
  type TlOvernightLodgingArea,
  type TlOvernightReservationTypeMapping
} from "./config";
import { syncTlDigiBoardState } from "./sync";
import type {
  TlAdditionalServicesSummary,
  TlBoardAdditionalServiceRow,
  TlBoardMedicationRow,
  TlBoardSyncMeta,
  TlDigiBoardPublicPayload,
  TlDigiBoardSnapshot,
  TlGingrMedicationRecord,
  TlMedicationSummary
} from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const TL_DIGI_BOARD_CONFIG_KEY = "tl_digi_board_config";
export const TL_DIGI_BOARD_SNAPSHOT_KEY = "tl_digi_board_snapshot";

function resolveSupabase(supabase?: SupabaseClient) {
  return supabase ?? getServiceSupabase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isMedicationRecord(value: unknown): value is TlGingrMedicationRecord {
  const row = asRecord(value);
  if (!row) return false;
  return Boolean(row.gingrMedicationId && row.gingrAnimalId && row.dogName && row.scheduleKind);
}

function parseSummary(value: unknown): TlMedicationSummary {
  const row = asRecord(value);
  return {
    due: Number(row?.due ?? 0) || 0,
    completed: Number(row?.completed ?? 0) || 0,
    remaining: Number(row?.remaining ?? 0) || 0,
    overdue: Number(row?.overdue ?? 0) || 0
  };
}

function parseServicesSummary(value: unknown): TlAdditionalServicesSummary {
  const row = asRecord(value);
  return {
    due: Number(row?.due ?? 0) || 0,
    completed: Number(row?.completed ?? 0) || 0,
    remaining: Number(row?.remaining ?? 0) || 0
  };
}

function isAdditionalServiceRow(value: unknown): value is TlBoardAdditionalServiceRow {
  const row = asRecord(value);
  if (!row) return false;
  return Boolean(row.id && row.gingrServiceId && row.gingrAnimalId && row.dogName && row.serviceName);
}

function parseAdditionalServices(value: unknown): TlBoardAdditionalServiceRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAdditionalServiceRow);
}

function parseMeta(value: unknown): TlBoardSyncMeta {
  const row = asRecord(value);
  return {
    timezone: "America/Los_Angeles",
    currentPeriod: (row?.currentPeriod as TlBoardSyncMeta["currentPeriod"]) ?? null,
    gingrSyncHealth: (row?.gingrSyncHealth as TlBoardSyncMeta["gingrSyncHealth"]) ?? "unknown",
    lastSuccessfulSyncAt: typeof row?.lastSuccessfulSyncAt === "string" ? row.lastSuccessfulSyncAt : null,
    lastAttemptAt: typeof row?.lastAttemptAt === "string" ? row.lastAttemptAt : null,
    lastError: typeof row?.lastError === "string" ? row.lastError : null,
    isStale: Boolean(row?.isStale),
    allClear: Boolean(row?.allClear),
    nextPeriod: (row?.nextPeriod as TlBoardSyncMeta["nextPeriod"]) ?? null,
    nextPeriodStartsAt: typeof row?.nextPeriodStartsAt === "string" ? row.nextPeriodStartsAt : null,
    administrationStatusAvailable: Boolean(row?.administrationStatusAvailable),
    servicesCompletionStatusAvailable: Boolean(row?.servicesCompletionStatusAvailable)
  };
}

function parseRows(value: unknown): TlBoardMedicationRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isMedicationRecord) as TlBoardMedicationRow[];
}

export function parseTlDigiBoardSnapshot(value: unknown): TlDigiBoardSnapshot | null {
  const root = asRecord(value);
  if (!root) return null;
  const medications = Array.isArray(root.medications)
    ? root.medications.filter(isMedicationRecord)
    : [];
  return {
    overdue: parseRows(root.overdue),
    current: parseRows(root.current),
    summary: parseSummary(root.summary),
    additionalServices: parseAdditionalServices(root.additionalServices),
    servicesSummary: parseServicesSummary(root.servicesSummary),
    meta: parseMeta(root.meta),
    medications,
    generatedAt: typeof root.generatedAt === "string" ? root.generatedAt : new Date(0).toISOString()
  };
}

export async function loadTlDigiBoardConfig(supabase?: SupabaseClient): Promise<TlDigiBoardConfig> {
  const client = resolveSupabase(supabase);
  const loaded = await loadAdminSettingsJsonKey(
    client,
    TL_DIGI_BOARD_CONFIG_KEY,
    parseTlDigiBoardConfig,
    DEFAULT_TL_DIGI_BOARD_CONFIG
  );
  return loaded ?? DEFAULT_TL_DIGI_BOARD_CONFIG;
}

export async function loadTlDigiBoardSnapshot(
  supabase?: SupabaseClient
): Promise<TlDigiBoardSnapshot | null> {
  const client = resolveSupabase(supabase);
  const loaded = await loadAdminSettingsJsonKey(
    client,
    TL_DIGI_BOARD_SNAPSHOT_KEY,
    parseTlDigiBoardSnapshot,
    null
  );
  return loaded ?? null;
}

export async function saveTlDigiBoardSnapshot(
  supabase: SupabaseClient,
  snapshot: TlDigiBoardSnapshot
): Promise<boolean> {
  return saveAdminSettingsJsonKey(supabase, TL_DIGI_BOARD_SNAPSHOT_KEY, snapshot);
}

export type UpdateTlDigiBoardConfigActor = {
  role?: string | null;
  email?: string | null;
  userId?: string | null;
};

export type TlDigiBoardConfigPatch = {
  /** Flat admin-panel fields. */
  displayTitle?: string;
  enabled?: boolean;
  lodging?: {
    overnightReservationTypes?: TlOvernightReservationTypeMapping[];
    approvedAreaKeys?: TlOvernightLodgingArea[];
  };
  display?: Partial<TlDigiBoardConfig["display"]>;
  protected?: Partial<TlDigiBoardConfig["protected"]>;
};

function validateOvernightMappings(
  mappings: TlOvernightReservationTypeMapping[],
  lock: boolean
): TlOvernightReservationTypeMapping[] {
  if (!mappings.length) {
    if (lock) {
      throw new Error("Overnight reservation type mappings cannot be cleared.");
    }
    return [];
  }
  for (const row of mappings) {
    if (!row.id?.trim()) throw new Error("Each overnight type mapping requires an id.");
    if (!row.labelContains?.trim()) throw new Error("Each overnight type mapping requires labelContains.");
    if (!["den", "petite_suite", "suite"].includes(row.areaKey)) {
      throw new Error(`Invalid overnight areaKey: ${row.areaKey}`);
    }
  }
  return mappings.map((row) => ({
    id: String(row.id).trim(),
    areaKey: row.areaKey,
    labelContains: String(row.labelContains).trim()
  }));
}

export async function updateTlDigiBoardConfig(
  supabaseOrOptions: SupabaseClient | { patch: TlDigiBoardConfigPatch; actorEmail?: string | null; role?: string | null },
  patchArg?: TlDigiBoardConfigPatch,
  actorArg?: UpdateTlDigiBoardConfigActor
): Promise<TlDigiBoardConfig> {
  let supabase: SupabaseClient;
  let patch: TlDigiBoardConfigPatch;
  let actor: UpdateTlDigiBoardConfigActor;

  if (supabaseOrOptions && typeof supabaseOrOptions === "object" && "patch" in supabaseOrOptions) {
    supabase = getServiceSupabase();
    patch = supabaseOrOptions.patch;
    actor = {
      email: supabaseOrOptions.actorEmail ?? null,
      role: supabaseOrOptions.role ?? "owner_admin"
    };
  } else {
    supabase = supabaseOrOptions as SupabaseClient;
    patch = patchArg ?? {};
    actor = actorArg ?? {};
  }

  if (actor.role != null && !canManageTlDigiBoardConfig(actor.role)) {
    throw new Error("Only full admins can update TL Digi Board config.");
  }

  const current = await loadTlDigiBoardConfig(supabase);
  const next: TlDigiBoardConfig = {
    lodging: {
      overnightReservationTypes: current.lodging.overnightReservationTypes,
      approvedAreaKeys: current.lodging.approvedAreaKeys
    },
    display: { ...current.display },
    protected: { ...current.protected },
    updatedAt: new Date().toISOString(),
    updatedBy: actor.email ?? actor.userId ?? current.updatedBy
  };

  if (typeof patch.displayTitle === "string") {
    next.display.displayTitle = patch.displayTitle.trim() || DEFAULT_TL_DIGI_BOARD_CONFIG.display.displayTitle;
  }
  if (typeof patch.enabled === "boolean") {
    next.display.enabled = patch.enabled;
  }

  if (patch.lodging?.overnightReservationTypes) {
    next.lodging.overnightReservationTypes = validateOvernightMappings(
      patch.lodging.overnightReservationTypes,
      current.protected.lockOvernightTypeMappings
    );
  }
  if (patch.lodging?.approvedAreaKeys) {
    const keys = patch.lodging.approvedAreaKeys.filter((key) =>
      ["den", "petite_suite", "suite"].includes(key)
    );
    if (!keys.length) throw new Error("approvedAreaKeys must include at least one lodging area.");
    next.lodging.approvedAreaKeys = [...new Set(keys)];
  }
  if (patch.display) {
    if (typeof patch.display.displayTitle === "string") {
      next.display.displayTitle =
        patch.display.displayTitle.trim() || DEFAULT_TL_DIGI_BOARD_CONFIG.display.displayTitle;
    }
    if (typeof patch.display.enabled === "boolean") {
      next.display.enabled = patch.display.enabled;
    }
    if (typeof patch.display.showOtherSpecial === "boolean") {
      next.display.showOtherSpecial = patch.display.showOtherSpecial;
    }
    if (typeof patch.display.preferBackOfHouseLodging === "boolean") {
      next.display.preferBackOfHouseLodging = patch.display.preferBackOfHouseLodging;
    }
  }
  if (patch.protected) {
    if (typeof patch.protected.lockOvernightTypeMappings === "boolean") {
      next.protected.lockOvernightTypeMappings = patch.protected.lockOvernightTypeMappings;
    }
    if (current.protected.lockAdministrationStatusUnavailable) {
      next.protected.lockAdministrationStatusUnavailable = true;
    } else if (typeof patch.protected.lockAdministrationStatusUnavailable === "boolean") {
      next.protected.lockAdministrationStatusUnavailable =
        patch.protected.lockAdministrationStatusUnavailable;
    }
  }

  const parsed = parseTlDigiBoardConfig(next);
  const ok = await saveAdminSettingsJsonKey(supabase, TL_DIGI_BOARD_CONFIG_KEY, parsed);
  if (!ok) {
    throw new Error("Unable to persist TL Digi Board config (admin_settings unavailable).");
  }
  return parsed;
}

export async function getTlDigiBoardSnapshot(
  supabase?: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<TlDigiBoardSnapshot> {
  const client = resolveSupabase(supabase);
  const forceRefresh = Boolean(options?.forceRefresh);
  const [config, previous] = await Promise.all([
    loadTlDigiBoardConfig(client),
    loadTlDigiBoardSnapshot(client)
  ]);

  const snapshot = await syncTlDigiBoardState(client, {
    forceRefresh,
    previousSnapshot: previous,
    config
  });

  const shouldPersist =
    forceRefresh ||
    !previous ||
    snapshot.generatedAt !== previous.generatedAt ||
    snapshot.meta.lastAttemptAt !== previous.meta.lastAttemptAt ||
    snapshot.meta.lastSuccessfulSyncAt !== previous.meta.lastSuccessfulSyncAt;

  if (shouldPersist) {
    await saveTlDigiBoardSnapshot(client, snapshot).catch(() => {
      // Read path should still return the in-memory snapshot if persist fails.
    });
  }

  return snapshot;
}

/** Public TV board payload — never includes API keys or secrets. */
export async function loadTlDigiBoardPublicPayload(
  supabase?: SupabaseClient,
  options?: { forceRefresh?: boolean }
): Promise<TlDigiBoardPublicPayload> {
  const client = resolveSupabase(supabase);
  const { loadTlBoardDailyReminders } = await import("./reminders");
  const [config, snapshot, reminders] = await Promise.all([
    loadTlDigiBoardConfig(client),
    getTlDigiBoardSnapshot(client, { forceRefresh: options?.forceRefresh }),
    loadTlBoardDailyReminders(client)
  ]);

  return {
    ...snapshot,
    config: {
      displayTitle: config.display.displayTitle,
      enabled: config.display.enabled
    },
    reminders
  };
}

export { toTlDigiBoardAdminConfigView, canManageTlDigiBoardConfig };
