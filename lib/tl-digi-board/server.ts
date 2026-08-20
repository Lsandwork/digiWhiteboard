import { getServiceSupabase } from "@/lib/supabase/server";
import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";
import { TL_BOARD_PUBLIC_LOAD_TIMEOUT_MS } from "./constants";
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
import {
  buildUnavailableTlBoardSnapshot,
  rehydrateTlBoardSnapshot,
  tlBoardSnapshotNeedsBackgroundSync
} from "./board-state";
import type {
  TlAdditionalServicesSummary,
  TlBoardAdditionalServiceRow,
  TlBoardMedicationRow,
  TlBoardPackageGroupWalkRow,
  TlBoardPackageGroupWalksSummary,
  TlBoardSyncMeta,
  TlDigiBoardPublicPayload,
  TlDigiBoardSnapshot,
  TlGingrMedicationRecord,
  TlMedicationSummary,
  TlServiceTypeAuditRow
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

function parseAdministrationStatus(value: unknown): import("./types").TlGingrAdministrationStatus {
  if (
    value === "not_administered" ||
    value === "administered" ||
    value === "owner_administered" ||
    value === "partially_administered" ||
    value === "prepared" ||
    value === "refused" ||
    value === "n_a" ||
    value === "unable_to_administer"
  ) {
    return value;
  }
  return "not_administered";
}

function isMedicationRecord(value: unknown): value is TlGingrMedicationRecord {
  const row = asRecord(value);
  if (!row) return false;
  return Boolean(row.gingrMedicationId && row.gingrAnimalId && row.dogName && row.scheduleKind);
}

function parseMedicationRecord(value: unknown): TlGingrMedicationRecord | null {
  if (!isMedicationRecord(value)) return null;
  return {
    ...value,
    administrationStatus: parseAdministrationStatus(value.administrationStatus),
    gingrReportStatusLabel:
      typeof value.gingrReportStatusLabel === "string" && value.gingrReportStatusLabel.trim()
        ? value.gingrReportStatusLabel
        : null
  };
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
    remaining: Number(row?.remaining ?? 0) || 0,
    knownIncomplete: Number(row?.knownIncomplete ?? row?.remaining ?? 0) || 0,
    completionUnknown: Number(row?.completionUnknown ?? 0) || 0
  };
}

function parseServicesAudit(value: unknown): TlDigiBoardSnapshot["meta"]["servicesCompletionAudit"] {
  const row = asRecord(value);
  if (!row) return null;
  const perType = Array.isArray(row.perType)
    ? row.perType
        .map((entry) => {
          const typeRow = asRecord(entry);
          if (!typeRow || typeof typeRow.serviceType !== "string") return null;
          return {
            serviceType: typeRow.serviceType,
            status:
              typeRow.status === "pass" || typeRow.status === "fail" || typeRow.status === "not_scheduled_today"
                ? typeRow.status
                : "not_scheduled_today",
            scheduledToday: Number(typeRow.scheduledToday ?? 0) || 0,
            reliable: Number(typeRow.reliable ?? 0) || 0,
            unreliable: Number(typeRow.unreliable ?? 0) || 0,
            complete: Number(typeRow.complete ?? 0) || 0,
            incomplete: Number(typeRow.incomplete ?? 0) || 0,
            unknown: Number(typeRow.unknown ?? 0) || 0,
            unknownSamples: Array.isArray(typeRow.unknownSamples)
              ? typeRow.unknownSamples.map(String)
              : []
          };
        })
        .filter(Boolean)
    : [];
  return {
    auditedAt: typeof row.auditedAt === "string" ? row.auditedAt : new Date(0).toISOString(),
    serviceDate: typeof row.serviceDate === "string" ? row.serviceDate : "",
    reservationCount: Number(row.reservationCount ?? 0) || 0,
    allReliable: Boolean(row.allReliable),
    allRequiredTypesPass: Boolean(row.allRequiredTypesPass),
    perType: perType as TlServiceTypeAuditRow[],
    issues: Array.isArray(row.issues) ? row.issues.map(String) : [],
    completionSource: typeof row.completionSource === "string" ? row.completionSource : "reservation.complete",
    documentationPath:
      typeof row.documentationPath === "string"
        ? row.documentationPath
        : "docs/tl-digi-board/ADDITIONAL_SERVICES_GINGR.md"
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

function isPackageGroupWalkRow(value: unknown): value is TlBoardPackageGroupWalkRow {
  const row = asRecord(value);
  if (!row) return false;
  return Boolean(
    row.id &&
      row.gingrAnimalId &&
      row.dogName &&
      row.packageName &&
      (row.packageKey === "monthly_unlimited" || row.packageKey === "twenty_day_plus")
  );
}

function parsePackageGroupWalks(value: unknown): TlBoardPackageGroupWalkRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPackageGroupWalkRow);
}

function parseMatchCounts(value: unknown) {
  const row = asRecord(value);
  return {
    csvOwners: Number(row?.csvOwners ?? 0) || 0,
    uniqueExactMatches: Number(row?.uniqueExactMatches ?? 0) || 0,
    zeroMatches: Number(row?.zeroMatches ?? 0) || 0,
    ambiguousMatches: Number(row?.ambiguousMatches ?? 0) || 0
  };
}

function parseCsvOwnerResolutionLookup(
  value: unknown
): NonNullable<TlBoardPackageGroupWalksSummary["lookup"]>["csvOwnerResolution"] {
  const row = asRecord(value);
  if (!row) return undefined;
  const today = asRecord(row.today);
  return {
    httpStatus: row.httpStatus == null ? null : Number(row.httpStatus) || null,
    totalRows: Number(row.totalRows ?? 0) || 0,
    stableIdField: row.stableIdField == null ? null : String(row.stableIdField),
    firstNameField: row.firstNameField == null ? null : String(row.firstNameField),
    lastNameField: row.lastNameField == null ? null : String(row.lastNameField),
    activeDeletedField: row.activeDeletedField == null ? null : String(row.activeDeletedField),
    ownerIdNamespaceVerified: Boolean(row.ownerIdNamespaceVerified),
    sanitizedOwnerFieldNames: Array.isArray(row.sanitizedOwnerFieldNames)
      ? row.sanitizedOwnerFieldNames.map(String).slice(0, 80)
      : [],
    monthlyUnlimited: parseMatchCounts(row.monthlyUnlimited),
    twentyDayPlus: parseMatchCounts(row.twentyDayPlus),
    today: {
      checkedInReservations: Number(today?.checkedInReservations ?? 0) || 0,
      uniqueCheckedInOwners: Number(today?.uniqueCheckedInOwners ?? 0) || 0,
      eligiblePackageOwnersCurrentlyCheckedIn:
        Number(today?.eligiblePackageOwnersCurrentlyCheckedIn ?? 0) || 0,
      eligibleDogsCurrentlyCheckedIn: Number(today?.eligibleDogsCurrentlyCheckedIn ?? 0) || 0,
      unresolvedPackageOwners: Number(today?.unresolvedPackageOwners ?? 0) || 0,
      ambiguousPackageOwners: Number(today?.ambiguousPackageOwners ?? 0) || 0
    },
    error: row.error == null ? null : String(row.error)
  };
}

function parsePackageGroupWalksSummary(value: unknown): TlBoardPackageGroupWalksSummary {
  const row = asRecord(value);
  const lookupRow = asRecord(row?.lookup);
  const captured = asRecord(lookupRow?.capturedIds);
  return {
    eligible: Number(row?.eligible ?? 0) || 0,
    remaining: Number(row?.remaining ?? 0) || 0,
    completed: Number(row?.completed ?? 0) || 0,
    lookup: lookupRow
      ? {
          packageSourceAvailable: Boolean(lookupRow.packageSourceAvailable),
          sources: Array.isArray(lookupRow.sources) ? lookupRow.sources.map(String) : [],
          capturedIds: {
            monthly_unlimited:
              captured?.monthly_unlimited == null ? null : String(captured.monthly_unlimited),
            twenty_day_plus:
              captured?.twenty_day_plus == null ? null : String(captured.twenty_day_plus)
          },
          uniqueCheckedInOwners: Number(lookupRow.uniqueCheckedInOwners ?? 0) || 0,
          packageRowsInspected: Number(lookupRow.packageRowsInspected ?? 0) || 0,
          qualifying: Number(lookupRow.qualifying ?? 0) || 0,
          attempts: asRecord(lookupRow.attempts)
            ? Object.fromEntries(
                Object.entries(asRecord(lookupRow.attempts)!).map(([name, value]) => {
                  const attempt = asRecord(value);
                  return [
                    name,
                    {
                      ok: Boolean(attempt?.ok),
                      httpStatus:
                        attempt?.httpStatus == null ? null : Number(attempt.httpStatus) || null,
                      rows: Number(attempt?.rows ?? 0) || 0
                    }
                  ];
                })
              )
            : undefined,
          ownerFieldNames: Array.isArray(lookupRow.ownerFieldNames)
            ? lookupRow.ownerFieldNames.map(String).slice(0, 80)
            : undefined,
          csvOwnerResolution: parseCsvOwnerResolutionLookup(lookupRow.csvOwnerResolution)
        }
      : undefined
  };
}

function parseSourceHealth(value: unknown): import("./types").TlGingrSourceHealth {
  if (value === "ok" || value === "stale" || value === "error" || value === "unevaluated") return value;
  return "unevaluated";
}

function parseBoardState(value: unknown): import("./types").TlBoardDisplayState {
  if (
    value === "INITIAL_LOADING" ||
    value === "LIVE" ||
    value === "STALE" ||
    value === "CONNECTION_ERROR" ||
    value === "EMPTY_VALID" ||
    value === "PARTIAL_DATA_ERROR"
  ) {
    return value;
  }
  return "STALE";
}

function parseMeta(value: unknown): TlBoardSyncMeta {
  const row = asRecord(value);
  const gingrSyncHealth = (row?.gingrSyncHealth as TlBoardSyncMeta["gingrSyncHealth"]) ?? "unknown";
  const lastSuccessfulSyncAt = typeof row?.lastSuccessfulSyncAt === "string" ? row.lastSuccessfulSyncAt : null;
  const isStale = Boolean(row?.isStale);
  const allClear = Boolean(row?.allClear);
  const medicationsHealth = parseSourceHealth(row?.medicationsHealth) === "unevaluated"
    ? allClear
      ? "ok"
      : gingrSyncHealth === "live"
        ? "ok"
        : lastSuccessfulSyncAt
          ? "stale"
          : gingrSyncHealth === "unknown"
            ? "unevaluated"
            : "error"
    : parseSourceHealth(row?.medicationsHealth);
  const servicesHealth = parseSourceHealth(row?.servicesHealth) === "unevaluated"
    ? medicationsHealth
    : parseSourceHealth(row?.servicesHealth);
  return {
    timezone: "America/Los_Angeles",
    currentPeriod: (row?.currentPeriod as TlBoardSyncMeta["currentPeriod"]) ?? null,
    gingrSyncHealth,
    lastSuccessfulSyncAt,
    lastAttemptAt: typeof row?.lastAttemptAt === "string" ? row.lastAttemptAt : null,
    lastError: typeof row?.lastError === "string" ? row.lastError : null,
    isStale,
    allClear,
    medicationsHealth,
    servicesHealth,
    packageGroupWalksHealth: parseSourceHealth(row?.packageGroupWalksHealth),
    medicationsAllClear: typeof row?.medicationsAllClear === "boolean" ? row.medicationsAllClear : allClear,
    servicesAllClear: typeof row?.servicesAllClear === "boolean" ? row.servicesAllClear : allClear,
    packageGroupWalksAllClear: Boolean(row?.packageGroupWalksAllClear),
    boardState: row?.boardState ? parseBoardState(row.boardState) : allClear ? "EMPTY_VALID" : gingrSyncHealth === "live" ? "LIVE" : lastSuccessfulSyncAt ? "STALE" : "CONNECTION_ERROR",
    nextPeriod: (row?.nextPeriod as TlBoardSyncMeta["nextPeriod"]) ?? null,
    nextPeriodStartsAt: typeof row?.nextPeriodStartsAt === "string" ? row.nextPeriodStartsAt : null,
    administrationStatusAvailable: Boolean(row?.administrationStatusAvailable),
    servicesCompletionStatusAvailable: Boolean(row?.servicesCompletionStatusAvailable),
    servicesCompletionAudit: parseServicesAudit(row?.servicesCompletionAudit)
  };
}

function parseRows(value: unknown): TlBoardMedicationRow[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseMedicationRecord).filter(Boolean) as TlBoardMedicationRow[];
}

export function parseTlDigiBoardSnapshot(value: unknown): TlDigiBoardSnapshot | null {
  const root = asRecord(value);
  if (!root) return null;
  const medications = Array.isArray(root.medications)
    ? (root.medications.map(parseMedicationRecord).filter(Boolean) as TlGingrMedicationRecord[])
    : [];
  return {
    overdue: parseRows(root.overdue),
    current: parseRows(root.current),
    summary: parseSummary(root.summary),
    additionalServices: parseAdditionalServices(root.additionalServices),
    servicesSummary: parseServicesSummary(root.servicesSummary),
    packageGroupWalks: parsePackageGroupWalks(root.packageGroupWalks),
    packageGroupWalksSummary: parsePackageGroupWalksSummary(root.packageGroupWalksSummary),
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
  const { loadTlDigiBoardSnapshotFromStore } = await import("./snapshot-store");
  return loadTlDigiBoardSnapshotFromStore(client);
}

export async function saveTlDigiBoardSnapshot(
  supabase: SupabaseClient,
  snapshot: TlDigiBoardSnapshot
): Promise<boolean> {
  const { saveTlDigiBoardSnapshotToStore } = await import("./snapshot-store");
  return saveTlDigiBoardSnapshotToStore(supabase, snapshot);
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
  // Do not read tl_digi_board_config from the 7MiB admin_settings default blob.
  // That lookup starves the TV GET connection pool. Fitdog overnight mappings
  // are already in DEFAULT_TL_DIGI_BOARD_CONFIG.
  const previous = await loadTlDigiBoardSnapshot(client).catch(() => null);

  const persist = async (snapshot: TlDigiBoardSnapshot) => {
    const shouldPersist =
      forceRefresh ||
      !previous ||
      snapshot.generatedAt !== previous.generatedAt ||
      snapshot.meta.lastAttemptAt !== previous.meta.lastAttemptAt ||
      snapshot.meta.lastSuccessfulSyncAt !== previous.meta.lastSuccessfulSyncAt;
    if (!shouldPersist) return;
    await saveTlDigiBoardSnapshot(client, snapshot).catch(() => {
      // Sync result is still returned if persist fails.
    });
  };

  return syncTlDigiBoardState(client, {
    forceRefresh,
    previousSnapshot: previous,
    config: DEFAULT_TL_DIGI_BOARD_CONFIG,
    persist
  });
}

export function assembleTlDigiBoardPublicPayload(options: {
  config: TlDigiBoardConfig;
  snapshot: TlDigiBoardSnapshot | null;
  reminders: TlDigiBoardPublicPayload["reminders"];
  now?: Date;
  forceRefresh?: boolean;
}): { payload: TlDigiBoardPublicPayload; needsBackgroundSync: boolean } {
  const now = options.now ?? new Date();
  const snapshot = options.snapshot
    ? rehydrateTlBoardSnapshot(options.snapshot, now)
    : buildUnavailableTlBoardSnapshot(
        now,
        "No Gingr snapshot is stored yet. Background sync will retry automatically."
      );

  return {
    payload: {
      ...snapshot,
      config: {
        displayTitle: options.config.display.displayTitle,
        enabled: options.config.display.enabled
      },
      reminders: options.reminders
    },
    needsBackgroundSync: tlBoardSnapshotNeedsBackgroundSync(options.snapshot, now, {
      forceRefresh: options.forceRefresh
    })
  };
}

/** Public TV board payload — never includes API keys or secrets. Never waits on Gingr. */
export async function loadTlDigiBoardPublicPayload(
  supabase?: SupabaseClient,
  options?: { forceRefresh?: boolean; now?: Date }
): Promise<{ payload: TlDigiBoardPublicPayload; needsBackgroundSync: boolean }> {
  const client = resolveSupabase(supabase);
  const { DEFAULT_TL_DIGI_BOARD_CONFIG } = await import("./config");
  const { withTimeoutFallback } = await import("@/lib/server-ttl-cache");

  const snapshot = await withTimeoutFallback(
    loadTlDigiBoardSnapshot(client).catch(() => null),
    TL_BOARD_PUBLIC_LOAD_TIMEOUT_MS,
    null
  );

  const assembled = assembleTlDigiBoardPublicPayload({
    config: DEFAULT_TL_DIGI_BOARD_CONFIG,
    snapshot,
    reminders: [],
    now: options?.now,
    forceRefresh: options?.forceRefresh
  });

  // Snapshots only refresh on the Gingr sync cadence, but a completion has to
  // leave the TV promptly. Overlay stored completions here — bounded, and on
  // failure the row simply stays until the next sync instead of the card blanking.
  const walks = assembled.payload.packageGroupWalks;
  if (walks.length) {
    const { applyPackageGroupWalkCompletionsToRows } = await import(
      "@/lib/package-group-walks/tl-board"
    );
    const overlay = await withTimeoutFallback(
      applyPackageGroupWalkCompletionsToRows(client, walks, { now: options?.now }).catch(() => null),
      900,
      null
    );
    if (overlay && overlay.completedCount > 0) {
      assembled.payload.packageGroupWalks = overlay.rows;
      assembled.payload.packageGroupWalksSummary = {
        ...assembled.payload.packageGroupWalksSummary,
        remaining: overlay.rows.length,
        completed: assembled.payload.packageGroupWalksSummary.completed + overlay.completedCount
      };
    }
  }

  return assembled;
}

export { toTlDigiBoardAdminConfigView, canManageTlDigiBoardConfig };
