import { fetchCurrentlyCheckedInDogsRobust, todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import { fetchGingrBackOfHouse, type GingrBackOfHouseRecord } from "@/lib/gingr-board-sync";
import { createGingrClient, normalizeGingrReservationList } from "@/lib/integrations/gingr/client";
import { buildTlBoardMedicationRows, buildTlBoardSyncMeta } from "./board-state";
import {
  DEFAULT_TL_DIGI_BOARD_CONFIG,
  type TlDigiBoardConfig,
  type TlOvernightLodgingArea
} from "./config";
import { TL_GINGR_MEDICATION_SYNC_INTERVAL_MS } from "./constants";
import { requireTlGingrApiKey, tlGingrClientConfig } from "./gingr-auth";
import {
  fetchGingrMedicationInfo,
  flattenAndResolveMedicationSchedules
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
import { buildTlGingrMedicationRecords } from "./normalize";
import type { TlDigiBoardSnapshot, TlGingrMedicationRecord } from "./types";

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

const MEDICATION_FETCH_CONCURRENCY = 3;
const MEDICATION_FETCH_DELAY_MS = 80;

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

/**
 * Load checked-in overnight dogs. Prefers reservations payload (type id + name),
 * falls back to fetchCurrentlyCheckedInDogsRobust name-only matching.
 */
async function loadOvernightCheckedInDogs(config: TlDigiBoardConfig): Promise<OvernightDog[]> {
  const apiKey = requireTlGingrApiKey();
  const { subdomain, locationId } = tlGingrClientConfig();
  const client = createGingrClient({ apiKey, subdomain, locationId });
  const overnight: OvernightDog[] = [];
  const seen = new Set<string>();

  if (client.config.apiKey) {
    try {
      const body = new URLSearchParams({
        key: client.config.apiKey,
        location_id: client.config.locationId,
        checked_in: "true"
      });
      const response = await fetch(`${client.config.baseUrl}/api/v1/reservations`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
        },
        body,
        cache: "no-store"
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Gingr reservations ${response.status}: ${text.slice(0, 180) || response.statusText}`);
      }
      const rows = normalizeGingrReservationList(await response.json());
      for (const row of rows) {
        const mapped = mapReservationWithType(row);
        if (!mapped) continue;
        const areaKey = matchOvernightLodgingArea(
          mapped.reservationTypeName,
          mapped.reservationTypeId,
          config
        );
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
      if (overnight.length) return overnight;
    } catch {
      // Fall through to robust checked-in helper.
    }
  }

  const { dogs } = await fetchCurrentlyCheckedInDogsRobust({ force: true });
  for (const dog of dogs) {
    const areaKey = matchOvernightLodgingArea(dog.reservationType ?? null, null, config);
    if (!areaKey || !isApprovedOvernightLodging(areaKey, config)) continue;
    if (seen.has(dog.animalId)) continue;
    seen.add(dog.animalId);
    overnight.push({
      animalId: dog.animalId,
      dogName: dog.dogName,
      reservationId: dog.reservationId,
      reservationTypeId: null,
      reservationTypeName: dog.reservationType ?? null,
      photoUrl: dog.photoUrl ?? null,
      overnightAreaKey: areaKey
    });
  }
  return overnight;
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
  lastSuccessfulSyncAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  syncSucceeded: boolean;
  administrationStatusAvailable?: boolean;
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
  const meta = buildTlBoardSyncMeta(
    {
      medications,
      now,
      lastSuccessfulSyncAt: partial.lastSuccessfulSyncAt ?? null,
      lastAttemptAt: partial.lastAttemptAt ?? now.toISOString(),
      lastError: partial.lastError ?? null,
      syncSucceeded: partial.syncSucceeded,
      administrationStatusAvailable: partial.administrationStatusAvailable
    },
    built.summary
  );

  return {
    overdue: built.overdue,
    current: built.current,
    summary: built.summary,
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
};

/**
 * Sync overnight medication board state from Gingr.
 * On Gingr failure: return previous last-known-good (if provided) marked stale —
 * never present an empty board as ALL CLEAR after a failed sync.
 */
export async function syncTlDigiBoardState(
  _supabase: SupabaseClient,
  options?: SyncTlDigiBoardStateOptions
): Promise<TlDigiBoardSnapshot> {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const forceRefresh = Boolean(options?.forceRefresh);
  const config = options?.config ?? DEFAULT_TL_DIGI_BOARD_CONFIG;
  const previous = options?.previousSnapshot ?? null;

  if (!forceRefresh && lastSyncAt > 0 && nowMs - lastSyncAt < TL_GINGR_MEDICATION_SYNC_INTERVAL_MS) {
    if (previous) {
      return previous;
    }
  }

  lastSyncAt = nowMs;
  const attemptedAt = now.toISOString();

  try {
    const overnightDogs = await loadOvernightCheckedInDogs(config);
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

        const resolved = flattenAndResolveMedicationSchedules(payload);
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
            now
          },
          administrationByScheduleId
        );
        if (!config.display.showOtherSpecial) {
          records = records.filter((row) => row.scheduleKind !== "other_special");
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

    const lastErrorParts = [...medErrors.slice(0, 2), ...historyWarnings.slice(0, 1)];
    const lastError = lastErrorParts.length ? lastErrorParts.join("; ") : null;

    const built = buildTlBoardMedicationRows({
      medications,
      now,
      lastSuccessfulSyncAt: attemptedAt,
      lastAttemptAt: attemptedAt,
      lastError,
      syncSucceeded: true,
      administrationStatusAvailable
    });
    const meta = buildTlBoardSyncMeta(
      {
        medications,
        now,
        lastSuccessfulSyncAt: attemptedAt,
        lastAttemptAt: attemptedAt,
        lastError,
        syncSucceeded: true,
        administrationStatusAvailable
      },
      built.summary
    );

    return {
      overdue: built.overdue,
      current: built.current,
      summary: built.summary,
      meta,
      medications,
      generatedAt: attemptedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "TL Digi Board sync failed.";

    if (previous && previous.medications.length >= 0) {
      // Keep last-known-good rows; mark stale / not all-clear.
      return emptySnapshot({
        medications: previous.medications,
        lastSuccessfulSyncAt: previous.meta.lastSuccessfulSyncAt,
        lastAttemptAt: attemptedAt,
        lastError: message,
        syncSucceeded: false,
        administrationStatusAvailable: previous.meta.administrationStatusAvailable,
        now
      });
    }

    // No prior data — return empty rows but NEVER as ALL CLEAR (syncSucceeded false).
    return emptySnapshot({
      medications: [],
      lastSuccessfulSyncAt: null,
      lastAttemptAt: attemptedAt,
      lastError: message,
      syncSucceeded: false,
      now
    });
  }
}

/** Test helper — reset module cooldown. */
export function __resetTlDigiBoardSyncCooldownForTests() {
  lastSyncAt = 0;
}
