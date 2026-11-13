import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import { fetchGingrBackOfHouse, type GingrBackOfHouseRecord } from "@/lib/gingr-board-sync";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { buildTlBoardMedicationRows, buildTlBoardSyncMeta, rehydrateTlBoardSnapshot } from "./board-state";
import {
  DEFAULT_TL_DIGI_BOARD_CONFIG,
  type TlDigiBoardConfig,
  type TlOvernightLodgingArea
} from "./config";
import { TL_GINGR_MEDICATION_SYNC_INTERVAL_MS, TL_GINGR_SYNC_BUDGET_MS } from "./constants";
import { loadTlBoardReservationsForAdditionalServices } from "./gingr-reservation-services";
import { requireTlGingrApiKey } from "./gingr-auth";
import {
  fetchGingrMedicationInfo,
  resolveGingrMedicationInfo
} from "./gingr-medication";
import {
  extractAdministrationRecordsFromHistory,
  fetchGingrMedicationReportHistory,
  resolveAdministrationForSchedule
} from "./gingr-medication-report";
import {
  isApprovedOvernightLodging,
  lodgingLabelForArea,
  matchOvernightLodgingArea,
  parseRunName
} from "./lodging";
import type { TlLodgingAreaKey } from "./constants";
import { buildTlGingrMedicationRecords } from "./normalize";
import { enrichTlBoardMedicationPhotos } from "./animal-photos";
import { syncTlBoardAdditionalServices } from "./additional-services";
import {
  EMPTY_PACKAGE_GROUP_WALKS_SUMMARY,
  syncTlBoardPackageGroupWalks
} from "@/lib/package-group-walks/tl-board";
import type { TlDigiBoardSnapshot, TlGingrMedicationRecord } from "./types";
import { logTlGingrSyncEvent } from "./observability";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

type OvernightDog = {
  animalId: string;
  dogName: string;
  reservationId: string | null;
  reservationTypeId: string | null;
  reservationTypeName: string | null;
  photoUrl: string | null;
  overnightAreaKey: TlOvernightLodgingArea;
};

type LodgingInfo = {
  runName: string | null;
  areaName: string | null;
  reservationId: string | null;
  photoUrl: string | null;
  parsedAreaKey: TlOvernightLodgingArea | null;
  runLabel: string | null;
  lodgingLabel: string | null;
};

let lastSyncAt = 0;
let inFlightSync: Promise<TlDigiBoardSnapshot> | null = null;

const MEDICATION_FETCH_CONCURRENCY = 4;
const MEDICATION_FETCH_DELAY_MS = 50;
const TL_RESERVATIONS_LOAD_RETRIES = 2;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
      if (MEDICATION_FETCH_DELAY_MS > 0) await sleep(MEDICATION_FETCH_DELAY_MS);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function mapReservationWithType(row: unknown): {
  animalId: string;
  dogName: string;
  reservationId: string | null;
  reservationTypeId: string | null;
  reservationTypeName: string | null;
  photoUrl: string | null;
} | null {
  const record = asRecord(row);
  if (!record) return null;

  const animalField = record.animal ?? record.pet ?? record.dog;
  const animal =
    asRecord(animalField) ||
    (typeof animalField === "string" || typeof animalField === "number" ? { id: animalField } : null);
  const type = asRecord(record.type) || asRecord(record.reservation_type);

  const animalId = pickString(
    animal?.id,
    record.animal_id,
    typeof animalField === "string" || typeof animalField === "number" ? animalField : null
  );
  const dogName = pickString(
    animal?.name,
    animal?.first_name,
    record.animal_name,
    record.pet_name,
    record.dog_name
  );
  if (!animalId || !dogName) return null;

  return {
    animalId,
    dogName,
    reservationId: pickString(record.reservation_id, record.id),
    reservationTypeId: pickString(type?.id, record.type_id, record.reservation_type_id),
    reservationTypeName: pickString(type?.name, type?.type, record.type_name, record.type, record.reservation_type),
    photoUrl: pickString(animal?.image, animal?.image_url, animal?.photo_url, record.photo_url, record.image_url)
  };
}

/** Map merged checked-in reservations to overnight lodging dogs (shared with additional-services pull). */
export function buildOvernightDogsFromReservations(
  reservations: GingrReservation[],
  config: TlDigiBoardConfig
): OvernightDog[] {
  const overnight: OvernightDog[] = [];
  const seen = new Set<string>();
  for (const row of reservations) {
    const mapped = mapReservationWithType(row);
    if (!mapped) continue;
    const areaKey = matchOvernightLodgingArea(mapped.reservationTypeName, mapped.reservationTypeId, config);
    if (!areaKey || !isApprovedOvernightLodging(areaKey, config)) continue;
    if (seen.has(mapped.animalId)) continue;
    seen.add(mapped.animalId);
    overnight.push({
      animalId: mapped.animalId,
      dogName: mapped.dogName,
      reservationId: mapped.reservationId,
      reservationTypeId: mapped.reservationTypeId,
      reservationTypeName: mapped.reservationTypeName,
      photoUrl: mapped.photoUrl,
      overnightAreaKey: areaKey
    });
  }
  return overnight;
}

function normalizeStoredLodgingAreaKey(
  key: TlLodgingAreaKey | null | undefined
): TlOvernightLodgingArea | null {
  if (!key) return null;
  if (key === "dens") return "den";
  if (key === "petite_suites") return "petite_suite";
  if (key === "suites") return "suite";
  if (key === "den" || key === "petite_suite" || key === "suite") return key;
  return null;
}

/** Last-known animal ids when Gingr reservations are temporarily unavailable. */
function overnightDogsFromPreviousSnapshot(
  previous: TlDigiBoardSnapshot | null,
  config: TlDigiBoardConfig
): OvernightDog[] {
  if (!previous) return [];
  const overnight: OvernightDog[] = [];
  const seen = new Set<string>();

  const push = (input: {
    animalId: string;
    dogName: string;
    reservationId: string | null;
    reservationTypeName: string | null;
    photoUrl: string | null;
    areaKey: TlOvernightLodgingArea | null;
  }) => {
    const areaKey = input.areaKey;
    if (!areaKey || !isApprovedOvernightLodging(areaKey, config)) return;
    if (seen.has(input.animalId)) return;
    seen.add(input.animalId);
    overnight.push({
      animalId: input.animalId,
      dogName: input.dogName,
      reservationId: input.reservationId,
      reservationTypeId: null,
      reservationTypeName: input.reservationTypeName,
      photoUrl: input.photoUrl,
      overnightAreaKey: areaKey
    });
  };

  for (const med of previous.medications) {
    push({
      animalId: med.gingrAnimalId,
      dogName: med.dogName,
      reservationId: med.gingrReservationId,
      reservationTypeName: null,
      photoUrl: med.photoUrl,
      areaKey: normalizeStoredLodgingAreaKey(med.lodgingAreaKey)
    });
  }
  for (const svc of previous.additionalServices) {
    push({
      animalId: svc.gingrAnimalId,
      dogName: svc.dogName,
      reservationId: svc.gingrReservationId,
      reservationTypeName: null,
      photoUrl: svc.photoUrl,
      areaKey: parseRunName(svc.lodgingLabel).areaKey
    });
  }
  return overnight;
}

function shouldPreservePreviousTlBoardOnEmptyReservations(
  previous: TlDigiBoardSnapshot | null,
  config: TlDigiBoardConfig = DEFAULT_TL_DIGI_BOARD_CONFIG
) {
  return overnightDogsFromPreviousSnapshot(previous, config).length > 0;
}

export const __shouldPreservePreviousTlBoardOnEmptyReservationsForTests =
  shouldPreservePreviousTlBoardOnEmptyReservations;

async function loadTlBoardReservationBundle(now: Date) {
  let lastError: unknown;
  for (let attempt = 0; attempt < TL_RESERVATIONS_LOAD_RETRIES; attempt += 1) {
    try {
      return await loadTlBoardReservationsForAdditionalServices(now);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < TL_RESERVATIONS_LOAD_RETRIES) await sleep(400);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gingr reservations failed.");
}

function lodgingFromBackOfHouseRecord(record: GingrBackOfHouseRecord): LodgingInfo {
  const runName = pickString(record.run_name);
  const parsed = parseRunName(runName);
  return {
    runName,
    areaName: pickString(record.area_name),
    reservationId: pickString(record.id),
    photoUrl: pickString(record.photo_url, record.image_url, record.image),
    parsedAreaKey: parsed.areaKey,
    runLabel: parsed.runLabel,
    lodgingLabel: parsed.lodgingLabel
  };
}

async function loadLodgingMapByAnimal(): Promise<Map<string, LodgingInfo>> {
  const map = new Map<string, LodgingInfo>();
  try {
    const board = await fetchGingrBackOfHouse({
      allReservationTypes: true,
      apiKey: requireTlGingrApiKey()
    });
    const records = [...(board.checking_in ?? []), ...(board.checking_out ?? [])] as GingrBackOfHouseRecord[];
    for (const record of records) {
      const animalId = pickString(record.animal_id);
      if (!animalId) continue;
      const lodging = lodgingFromBackOfHouseRecord(record);
      const existing = map.get(animalId);
      // Prefer records that include a run_name.
      if (!existing || (!existing.runName && lodging.runName)) {
        map.set(animalId, lodging);
      }
    }
  } catch {
    // Lodging enrichment is best-effort.
  }
  return map;
}

function resolveLodgingForDog(dog: OvernightDog, lodgingMap: Map<string, LodgingInfo>, config: TlDigiBoardConfig) {
  const fromBoh = lodgingMap.get(dog.animalId) ?? null;
  const preferBoh = config.display.preferBackOfHouseLodging;

  const areaKey =
    (preferBoh && fromBoh?.parsedAreaKey) || dog.overnightAreaKey || fromBoh?.parsedAreaKey || null;
  const runName = fromBoh?.runName ?? null;
  const runLabel = fromBoh?.runLabel ?? null;
  const lodgingLabel =
    (preferBoh && fromBoh?.lodgingLabel) ||
    lodgingLabelForArea(areaKey, runLabel) ||
    fromBoh?.lodgingLabel ||
    lodgingLabelForArea(dog.overnightAreaKey, null);

  return {
    lodgingAreaKey: areaKey,
    lodgingRunName: runName,
    lodgingLabel,
    photoUrl: fromBoh?.photoUrl || dog.photoUrl,
    reservationId: dog.reservationId || fromBoh?.reservationId || null
  };
}

function emptySnapshot(partial: {
  medications?: TlGingrMedicationRecord[];
  additionalServices?: TlDigiBoardSnapshot["additionalServices"];
  servicesSummary?: TlDigiBoardSnapshot["servicesSummary"];
  packageGroupWalks?: TlDigiBoardSnapshot["packageGroupWalks"];
  packageGroupWalksSummary?: TlDigiBoardSnapshot["packageGroupWalksSummary"];
  lastSuccessfulSyncAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  syncSucceeded: boolean;
  administrationStatusAvailable?: boolean;
  servicesCompletionStatusAvailable?: boolean;
  servicesCompletionAudit?: TlDigiBoardSnapshot["meta"]["servicesCompletionAudit"];
  medicationsHealth?: import("./types").TlGingrSourceHealth;
  servicesHealth?: import("./types").TlGingrSourceHealth;
  packageGroupWalksHealth?: import("./types").TlGingrSourceHealth;
  now?: Date;
}): TlDigiBoardSnapshot {
  const now = partial.now ?? new Date();
  const medications = partial.medications ?? [];
  const built = buildTlBoardMedicationRows({
    medications,
    now,
    lastSuccessfulSyncAt: partial.lastSuccessfulSyncAt ?? null,
    lastAttemptAt: partial.lastAttemptAt ?? now.toISOString(),
    lastError: partial.lastError ?? null,
    syncSucceeded: partial.syncSucceeded,
    administrationStatusAvailable: partial.administrationStatusAvailable
  });
  const servicesHealth = partial.servicesHealth;
  const medicationsHealth = partial.medicationsHealth;
  const meta = buildTlBoardSyncMeta(
    {
      medications,
      now,
      lastSuccessfulSyncAt: partial.lastSuccessfulSyncAt ?? null,
      lastAttemptAt: partial.lastAttemptAt ?? now.toISOString(),
      lastError: partial.lastError ?? null,
      syncSucceeded: partial.syncSucceeded,
      administrationStatusAvailable: partial.administrationStatusAvailable,
      servicesCompletionStatusAvailable: partial.servicesCompletionStatusAvailable,
      servicesCompletionAudit: partial.servicesCompletionAudit,
      medicationsHealth,
      servicesHealth,
      packageGroupWalksHealth: partial.packageGroupWalksHealth,
      servicesRemaining: (partial.servicesSummary ?? { remaining: 0 }).remaining,
      packageGroupWalksRemaining: (partial.packageGroupWalksSummary ?? { remaining: 0 }).remaining
    },
    built.summary
  );

  return {
    overdue: built.overdue,
    current: built.current,
    summary: built.summary,
    additionalServices: partial.additionalServices ?? [],
    servicesSummary: partial.servicesSummary ?? {
      due: 0,
      completed: 0,
      remaining: 0,
      knownIncomplete: 0,
      completionUnknown: 0
    },
    packageGroupWalks: partial.packageGroupWalks ?? [],
    packageGroupWalksSummary: partial.packageGroupWalksSummary ?? {
      ...EMPTY_PACKAGE_GROUP_WALKS_SUMMARY
    },
    meta,
    medications,
    generatedAt: now.toISOString()
  };
}

export type SyncTlDigiBoardStateOptions = {
  forceRefresh?: boolean;
  previousSnapshot?: TlDigiBoardSnapshot | null;
  config?: TlDigiBoardConfig;
  now?: Date;
  persist?: (snapshot: TlDigiBoardSnapshot) => Promise<void>;
};

async function withSyncBudget(
  work: Promise<TlDigiBoardSnapshot>,
  previous: TlDigiBoardSnapshot | null,
  now: Date
): Promise<TlDigiBoardSnapshot> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      work.then((snapshot) => ({ kind: "ok" as const, snapshot })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timeoutId = setTimeout(() => resolve({ kind: "timeout" }), TL_GINGR_SYNC_BUDGET_MS);
      })
    ]);
    if (raced.kind === "ok") return raced.snapshot;

    const message = `TL Gingr sync exceeded ${TL_GINGR_SYNC_BUDGET_MS}ms budget`;
    logTlGingrSyncEvent(previous?.meta.lastSuccessfulSyncAt ? "GINGR_DATA_STALE" : "GINGR_SYNC_FAILURE", {
      error: message,
      hadPrevious: Boolean(previous),
      lastSuccessfulSyncAt: previous?.meta.lastSuccessfulSyncAt ?? null
    });
    if (previous) {
      return emptySnapshot({
        medications: previous.medications,
        additionalServices: previous.additionalServices,
        servicesSummary: previous.servicesSummary,
        packageGroupWalks: previous.packageGroupWalks,
        packageGroupWalksSummary: previous.packageGroupWalksSummary,
        lastSuccessfulSyncAt: previous.meta.lastSuccessfulSyncAt,
        lastAttemptAt: now.toISOString(),
        lastError: message,
        syncSucceeded: false,
        administrationStatusAvailable: previous.meta.administrationStatusAvailable,
        servicesCompletionStatusAvailable: previous.meta.servicesCompletionStatusAvailable,
        servicesCompletionAudit: previous.meta.servicesCompletionAudit,
        medicationsHealth: previous.medications.length ? "stale" : "error",
        servicesHealth: previous.additionalServices.length ? "stale" : "error",
        packageGroupWalksHealth: previous.packageGroupWalks?.length ? "stale" : "error",
        now
      });
    }
    return emptySnapshot({
      medications: [],
      additionalServices: [],
      servicesSummary: { due: 0, completed: 0, remaining: 0, knownIncomplete: 0, completionUnknown: 0 },
      packageGroupWalks: [],
      packageGroupWalksSummary: { ...EMPTY_PACKAGE_GROUP_WALKS_SUMMARY },
      lastSuccessfulSyncAt: null,
      lastAttemptAt: now.toISOString(),
      lastError: message,
      syncSucceeded: false,
      medicationsHealth: "error",
      servicesHealth: "error",
      packageGroupWalksHealth: "error",
      now
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Sync overnight medication board state from Gingr.
 * On Gingr failure: return previous last-known-good (if provided) marked stale —
 * never present an empty board as ALL CLEAR after a failed sync.
 *
 * Concurrent callers share one in-flight Gingr pull (TV `after()` + cron).
 * Callers that hit the sync budget still return last-known-good; the in-flight
 * work continues and `persist` writes the real result when it finishes.
 */
export async function syncTlDigiBoardState(
  _supabase: SupabaseClient,
  options?: SyncTlDigiBoardStateOptions
): Promise<TlDigiBoardSnapshot> {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const forceRefresh = Boolean(options?.forceRefresh);
  const previous = options?.previousSnapshot ?? null;

  if (
    !forceRefresh &&
    previous?.meta.lastSuccessfulSyncAt &&
    (previous.meta.medicationsHealth === "ok" ||
      previous.meta.medicationsHealth === "stale" ||
      previous.meta.gingrSyncHealth === "live") &&
    (lastSyncAt > 0
      ? nowMs - lastSyncAt < TL_GINGR_MEDICATION_SYNC_INTERVAL_MS
      : nowMs - new Date(previous.meta.lastSuccessfulSyncAt).getTime() < TL_GINGR_MEDICATION_SYNC_INTERVAL_MS)
  ) {
    return rehydrateTlBoardSnapshot(previous, now);
  }

  if (!inFlightSync) {
    inFlightSync = runTlDigiBoardSync(_supabase, options).finally(() => {
      inFlightSync = null;
    });
  }

  if (options?.persist) {
    const persist = options.persist;
    void inFlightSync.then((snapshot) => persist(snapshot).catch(() => undefined));
  }

  return withSyncBudget(inFlightSync, previous, now);
}

async function runTlDigiBoardSync(
  _supabase: SupabaseClient,
  options?: SyncTlDigiBoardStateOptions
): Promise<TlDigiBoardSnapshot> {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const config = options?.config ?? DEFAULT_TL_DIGI_BOARD_CONFIG;
  const previous = options?.previousSnapshot ?? null;

  lastSyncAt = nowMs;
  const attemptedAt = now.toISOString();

  try {
    let reservationBundle: Awaited<ReturnType<typeof loadTlBoardReservationsForAdditionalServices>> | null = null;
    let reservationsLoadError: string | null = null;
    try {
      reservationBundle = await loadTlBoardReservationBundle(now);
    } catch (error) {
      reservationsLoadError = error instanceof Error ? error.message : "Gingr reservations failed.";
    }

    const overnightDogs = reservationBundle
      ? buildOvernightDogsFromReservations(reservationBundle.reservations, config)
      : overnightDogsFromPreviousSnapshot(previous, config);

    if (
      reservationBundle &&
      !overnightDogs.length &&
      shouldPreservePreviousTlBoardOnEmptyReservations(previous, config)
    ) {
      throw new Error("Gingr reservations returned no checked-in overnight dogs; preserving last-known TL board.");
    }

    if (reservationsLoadError && !overnightDogs.length) {
      throw new Error(reservationsLoadError);
    }

    const [additionalServicesResult, packageGroupWalksResult] = await Promise.all([
      (reservationBundle
        ? syncTlBoardAdditionalServices({ config, now, preloaded: reservationBundle })
        : Promise.reject(new Error(reservationsLoadError ?? "Gingr reservations unavailable."))
      ).catch((error) => ({
        services: previous?.additionalServices ?? [],
        summary: previous?.servicesSummary ?? {
          due: 0,
          completed: 0,
          remaining: 0,
          knownIncomplete: 0,
          completionUnknown: 0
        },
        completionStatusAvailable: previous?.meta.servicesCompletionStatusAvailable ?? false,
        audit: previous?.meta.servicesCompletionAudit ?? null,
        error: error instanceof Error ? error.message : "additional_services_sync_failed"
      })),
      // Contained failure: a broken Package Group Walks card must never take down
      // Medication Reminders or Additional Services.
      syncTlBoardPackageGroupWalks(_supabase, { now }).catch((error) => ({
        rows: previous?.packageGroupWalks ?? [],
        summary: previous?.packageGroupWalksSummary ?? { ...EMPTY_PACKAGE_GROUP_WALKS_SUMMARY },
        ok: false,
        error: error instanceof Error ? error.message : "package_group_walks_sync_failed",
        packageSourceAvailable: false,
        packageSources: []
      }))
    ]);
    const lodgingMap = await loadLodgingMapByAnimal();
    const serviceDate = todayInLosAngeles(now);

    const perDogResults = await mapPool(overnightDogs, MEDICATION_FETCH_CONCURRENCY, async (dog) => {
      try {
        const lodging = resolveLodgingForDog(dog, lodgingMap, config);
        const reservationId = lodging.reservationId;

        const [payload, historyResult] = await Promise.all([
          fetchGingrMedicationInfo(dog.animalId),
          reservationId
            ? fetchGingrMedicationReportHistory(reservationId)
                .then((history) => ({ ok: true as const, history }))
                .catch((error) => ({
                  ok: false as const,
                  error: error instanceof Error ? error.message : "medication_report_history_failed"
                }))
            : Promise.resolve({ ok: false as const, error: "missing_reservation_id" })
        ]);

        const resolvedInfo = resolveGingrMedicationInfo(payload);
        const resolved = resolvedInfo.schedules;
        const administrationByScheduleId = new Map<
          string,
          ReturnType<typeof resolveAdministrationForSchedule>
        >();
        let administrationStatusAvailable = false;

        if (historyResult.ok) {
          const adminRecords = extractAdministrationRecordsFromHistory(historyResult.history, {
            reservationId
          });
          administrationStatusAvailable = true;
          for (const schedule of resolved) {
            administrationByScheduleId.set(
              String(schedule.item.id),
              resolveAdministrationForSchedule({
                records: adminRecords,
                animalMedicationScheduleId: String(schedule.item.id),
                serviceDate
              })
            );
          }
        }

        let records = buildTlGingrMedicationRecords(
          resolved,
          {
            gingrAnimalId: dog.animalId,
            gingrReservationId: reservationId,
            dogName: dog.dogName,
            photoUrl: lodging.photoUrl,
            lodgingAreaKey: lodging.lodgingAreaKey,
            lodgingRunName: lodging.lodgingRunName,
            lodgingLabel: lodging.lodgingLabel,
            serviceDate,
            now,
            animalMedicationNotes: resolvedInfo.animalMedicationNotes
          },
          administrationByScheduleId
        );
        if (!config.display.showOtherSpecial) {
          records = records.filter(
            (row) => row.scheduleKind !== "other_special" || row.gingrScheduleLabel === "NOTES"
          );
        }
        return {
          ok: true as const,
          records,
          administrationStatusAvailable,
          historyError: historyResult.ok ? null : historyResult.error
        };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "medication_info_failed"
        };
      }
    });

    const medications: TlGingrMedicationRecord[] = [];
    const medErrors: string[] = [];
    const historyWarnings: string[] = [];
    let administrationStatusAvailable = false;

    for (const result of perDogResults) {
      if (result.ok) {
        medications.push(...result.records);
        if (result.administrationStatusAvailable) {
          administrationStatusAvailable = true;
        } else if (result.historyError && result.historyError !== "missing_reservation_id") {
          if (historyWarnings.length < 2) historyWarnings.push(result.historyError);
        }
      } else {
        medErrors.push(result.error);
      }
    }

    // If every medication pull failed and we had overnight dogs, treat as sync failure.
    if (overnightDogs.length > 0 && medications.length === 0 && medErrors.length === overnightDogs.length) {
      throw new Error(medErrors[0] || "All medication_info requests failed.");
    }

    const lastErrorParts = [
      ...(reservationsLoadError ? [reservationsLoadError] : []),
      ...medErrors.slice(0, 2),
      ...historyWarnings.slice(0, 1)
    ];
    const additionalServices = additionalServicesResult.services;
    const servicesSummary = additionalServicesResult.summary;
    const servicesCompletionStatusAvailable = additionalServicesResult.completionStatusAvailable;
    const servicesCompletionAudit =
      "audit" in additionalServicesResult ? additionalServicesResult.audit : null;
    const additionalServicesError =
      "error" in additionalServicesResult ? additionalServicesResult.error : null;

    if (additionalServicesError) {
      lastErrorParts.push(additionalServicesError);
    }
    const packageGroupWalks = packageGroupWalksResult.rows;
    const packageGroupWalksSummary = packageGroupWalksResult.summary;
    if (packageGroupWalksResult.error) {
      lastErrorParts.push(packageGroupWalksResult.error);
    }
    const lastError = lastErrorParts.length ? lastErrorParts.join("; ") : null;
    const medicationsHealth: import("./types").TlGingrSourceHealth = reservationsLoadError
      ? "stale"
      : "ok";
    const servicesHealth = additionalServicesError
      ? previous?.additionalServices?.length
        ? ("stale" as const)
        : ("error" as const)
      : ("ok" as const);
    const packageGroupWalksHealth = packageGroupWalksResult.ok
      ? ("ok" as const)
      : packageGroupWalks.length
        ? ("stale" as const)
        : ("error" as const);

    const medicationsWithPhotos = await enrichTlBoardMedicationPhotos(medications);

    const syncSucceeded = !reservationsLoadError;
    const lastSuccessfulSyncAt = syncSucceeded
      ? attemptedAt
      : previous?.meta.lastSuccessfulSyncAt ?? attemptedAt;

    const built = buildTlBoardMedicationRows({
      medications: medicationsWithPhotos,
      now,
      lastSuccessfulSyncAt,
      lastAttemptAt: attemptedAt,
      lastError,
      syncSucceeded,
      administrationStatusAvailable,
      medicationsHealth
    });
    const meta = buildTlBoardSyncMeta(
      {
        medications: medicationsWithPhotos,
        now,
        lastSuccessfulSyncAt,
        lastAttemptAt: attemptedAt,
        lastError,
        syncSucceeded,
        administrationStatusAvailable,
        servicesCompletionStatusAvailable,
        servicesCompletionAudit,
        medicationsHealth,
        servicesHealth,
        packageGroupWalksHealth,
        servicesRemaining: servicesSummary.remaining,
        packageGroupWalksRemaining: packageGroupWalksSummary.remaining
      },
      built.summary
    );

    logTlGingrSyncEvent(
      syncSucceeded && previous && previous.meta.medicationsHealth !== "ok"
        ? "GINGR_SYNC_RECOVERED"
        : syncSucceeded
          ? "GINGR_SYNC_SUCCESS"
          : "GINGR_DATA_STALE",
      {
        medicationCount: medicationsWithPhotos.length,
        servicesCount: additionalServices.length,
        packageGroupWalkCount: packageGroupWalks.length,
        servicesHealth,
        packageGroupWalksHealth,
        period: meta.currentPeriod,
        lastError
      }
    );

    return {
      overdue: built.overdue,
      current: built.current,
      summary: built.summary,
      additionalServices,
      servicesSummary,
      packageGroupWalks,
      packageGroupWalksSummary,
      meta,
      medications: medicationsWithPhotos,
      generatedAt: attemptedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "TL Digi Board sync failed.";
    logTlGingrSyncEvent(previous?.meta.lastSuccessfulSyncAt ? "GINGR_DATA_STALE" : "GINGR_SYNC_FAILURE", {
      error: message,
      hadPrevious: Boolean(previous),
      lastSuccessfulSyncAt: previous?.meta.lastSuccessfulSyncAt ?? null
    });

    if (previous) {
      return emptySnapshot({
        medications: previous.medications,
        additionalServices: previous.additionalServices,
        servicesSummary: previous.servicesSummary,
        packageGroupWalks: previous.packageGroupWalks,
        packageGroupWalksSummary: previous.packageGroupWalksSummary,
        lastSuccessfulSyncAt: previous.meta.lastSuccessfulSyncAt,
        lastAttemptAt: attemptedAt,
        lastError: message,
        syncSucceeded: false,
        administrationStatusAvailable: previous.meta.administrationStatusAvailable,
        servicesCompletionStatusAvailable: previous.meta.servicesCompletionStatusAvailable,
        servicesCompletionAudit: previous.meta.servicesCompletionAudit,
        medicationsHealth: previous.medications.length ? "stale" : "error",
        servicesHealth: previous.additionalServices.length ? "stale" : "error",
        packageGroupWalksHealth: previous.packageGroupWalks?.length ? "stale" : "error",
        now
      });
    }

    return emptySnapshot({
      medications: [],
      additionalServices: [],
      servicesSummary: { due: 0, completed: 0, remaining: 0, knownIncomplete: 0, completionUnknown: 0 },
      packageGroupWalks: [],
      packageGroupWalksSummary: { ...EMPTY_PACKAGE_GROUP_WALKS_SUMMARY },
      lastSuccessfulSyncAt: null,
      lastAttemptAt: attemptedAt,
      lastError: message,
      syncSucceeded: false,
      medicationsHealth: "error",
      servicesHealth: "error",
      packageGroupWalksHealth: "error",
      now
    });
  }
}

/** Test helper — reset module cooldown and in-flight lock. */
export function __resetTlDigiBoardSyncCooldownForTests() {
  lastSyncAt = 0;
  inFlightSync = null;
}
