type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import {
  canUseFitdogEmployeeApi,
  pullFitdogRouteReportFromApi
} from "@/lib/route-generator/fitdog-api";
import {
  dateOnly,
  fitdogServiceMatches,
  isFitdogVipPlatform,
  matchVipToFitdogHit,
  maxDate,
  pacificDateOffset,
  shouldClearNeedToRebook
} from "@/lib/staff/vip-auto-book/match-utils";
import { listVipAutoBookClients, updateVipAutoBookClient } from "@/lib/staff/vip-auto-book/store";
import type { VipAutoBookClient } from "@/lib/staff/vip-auto-book/types";

function phoneFromMasked(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text || /[•*]/.test(text)) return null;
  return text;
}

type FitdogBookingHit = {
  date: string;
  dogId: string | null;
  ownerId: string | null;
  dogName: string | null;
  ownerName: string | null;
  serviceRaw: string | null;
  serviceMatch: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull app.fitdog.com class occurrences into the Fitdog directory AND confirm
 * VIP Auto Book "Last Day Booked" / clear Re-book Needed when future bookings exist.
 */
export async function syncVipFitdogDirectory(
  supabase: SupabaseClient,
  options?: { lookbackDays?: number; lookaheadDays?: number }
): Promise<{
  ok: boolean;
  ownersUpserted: number;
  dogsUpserted: number;
  datesScanned: string[];
  clientsChecked: number;
  clientsConfirmed: number;
  clientsCorrected: number;
  clientsUnmatched: number;
  clientsRebookCleared: number;
  message: string;
  error?: string;
  updates?: Array<{
    id: string;
    dogName: string;
    ownerName: string;
    previousLastBookedFor: string | null;
    lastBookedFor: string | null;
    status: string;
    rebookCleared: boolean;
  }>;
}> {
  if (!canUseFitdogEmployeeApi()) {
    return {
      ok: false,
      ownersUpserted: 0,
      dogsUpserted: 0,
      datesScanned: [],
      clientsChecked: 0,
      clientsConfirmed: 0,
      clientsCorrected: 0,
      clientsUnmatched: 0,
      clientsRebookCleared: 0,
      message: "Fitdog employee API credentials are not configured.",
      error: "Missing FITDOG_EMPLOYEE_EMAIL / FITDOG_EMPLOYEE_PASSWORD."
    };
  }

  // Lookahead must cover monthly VIP bookings (e.g. Percy 09/07 from early August).
  const lookback = Math.max(0, Math.min(30, options?.lookbackDays ?? 14));
  const lookahead = Math.max(14, Math.min(90, options?.lookaheadDays ?? 60));
  const dates: string[] = [];
  for (let i = -lookback; i <= lookahead; i += 1) {
    dates.push(pacificDateOffset(i));
  }

  const { data: run, error: runError } = await supabase
    .from("vip_auto_book_directory_sync")
    .insert({
      status: "running",
      dates_scanned: dates
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);

  const owners = new Map<
    string,
    { owner_name: string; email: string | null; phone: string | null; raw: Record<string, unknown> }
  >();
  const dogs = new Map<
    string,
    {
      fitdog_owner_id: string | null;
      dog_name: string;
      breed: string | null;
      raw: Record<string, unknown>;
    }
  >();

  const warnings: string[] = [];
  const hitsByClient = new Map<string, FitdogBookingHit[]>();

  try {
    const listed = await listVipAutoBookClients(supabase, { status: "active", pageSize: 200 });
    const vipClients = listed.rows;
    const fitdogVipClients = vipClients.filter(
      (vip) => isFitdogVipPlatform(vip.platform) || Boolean(vip.fitdogDogId) || Boolean(vip.fitdogOwnerId)
    );

    for (let i = 0; i < dates.length; i += 1) {
      const date = dates[i]!;
      try {
        const bundle = await pullFitdogRouteReportFromApi(date);
        for (const item of [...bundle.pickupItems, ...bundle.dropoffItems]) {
          const ownerId = item.customerId?.trim() || null;
          const dogId = item.dogId?.trim() || null;
          const ownerName = item.ownerFullName?.trim() || "";
          const dogName = item.dogName?.trim() || "";
          const serviceRaw = item.serviceRaw?.trim() || null;

          if (ownerId && ownerName) {
            owners.set(ownerId, {
              owner_name: ownerName,
              email: null,
              phone: phoneFromMasked(item.ownerPhoneMasked),
              raw: {
                source: "class_occurrence",
                date,
                service: serviceRaw
              }
            });
          }
          if (dogId && dogName) {
            dogs.set(dogId, {
              fitdog_owner_id: ownerId,
              dog_name: dogName,
              breed: null,
              raw: {
                source: "class_occurrence",
                date,
                service: serviceRaw,
                dog_size: item.dogSize
              }
            });
          }

          const hit: FitdogBookingHit = {
            date,
            dogId,
            ownerId,
            dogName: dogName || null,
            ownerName: ownerName || null,
            serviceRaw,
            serviceMatch: false
          };

          for (const vip of vipClients) {
            if (!matchVipToFitdogHit(vip, hit)) continue;
            const rows = hitsByClient.get(vip.id) ?? [];
            rows.push({
              ...hit,
              serviceMatch: fitdogServiceMatches(vip.serviceKind, serviceRaw)
            });
            hitsByClient.set(vip.id, rows);
          }
        }
        if (bundle.warnings.length) warnings.push(...bundle.warnings.slice(0, 5));
      } catch (error) {
        warnings.push(`${date}: ${error instanceof Error ? error.message : "Fitdog pull failed"}`);
      }
      // Light pacing so we do not hammer app.fitdog.com.
      if (i < dates.length - 1) await sleep(40);
    }

    let ownersUpserted = 0;
    let dogsUpserted = 0;

    for (const [fitdogOwnerId, row] of owners) {
      const { error } = await supabase.from("fitdog_customers").upsert(
        {
          fitdog_owner_id: fitdogOwnerId,
          owner_name: row.owner_name,
          email: row.email,
          phone: row.phone,
          source_url: "https://app.fitdog.com/",
          raw: row.raw
        },
        { onConflict: "fitdog_owner_id" }
      );
      if (!error) ownersUpserted += 1;
    }

    for (const [fitdogDogId, row] of dogs) {
      const { error } = await supabase.from("fitdog_dogs").upsert(
        {
          fitdog_dog_id: fitdogDogId,
          fitdog_owner_id: row.fitdog_owner_id,
          dog_name: row.dog_name,
          breed: row.breed,
          source_url: "https://app.fitdog.com/",
          raw: row.raw
        },
        { onConflict: "fitdog_dog_id" }
      );
      if (!error) dogsUpserted += 1;
    }

    let confirmed = 0;
    let corrected = 0;
    let unmatched = 0;
    let rebookCleared = 0;
    const updates: Array<{
      id: string;
      dogName: string;
      ownerName: string;
      previousLastBookedFor: string | null;
      lastBookedFor: string | null;
      status: string;
      rebookCleared: boolean;
    }> = [];
    const nowIso = new Date().toISOString();

    for (const vip of vipClients) {
      const rows = hitsByClient.get(vip.id) ?? [];
      const tracksFitdog = fitdogVipClients.some((row) => row.id === vip.id);
      const next = resolveFitdogLastBookedForClient(vip, rows);

      if (!next) {
        if (!tracksFitdog) continue;
        unmatched += 1;
        await updateVipAutoBookClient(supabase, vip.id, {
          lastVerifiedAt: nowIso,
          lastBookStatus: "fitdog_no_bookings",
          lastBookError: "No matching app.fitdog.com class booking found in scan window."
        });
        updates.push({
          id: vip.id,
          dogName: vip.dogName,
          ownerName: vip.ownerName,
          previousLastBookedFor: vip.lastBookedFor,
          lastBookedFor: vip.lastBookedFor,
          status: "fitdog_no_bookings",
          rebookCleared: false
        });
        continue;
      }

      const previous = vip.lastBookedFor;
      const same = previous === next;
      const status = same ? "fitdog_confirmed" : "fitdog_corrected";
      if (same) confirmed += 1;
      else corrected += 1;

      const clearRebook = shouldClearNeedToRebook(next) && vip.needToRebook;
      if (clearRebook) rebookCleared += 1;

      const idHit = rows.find((row) => row.dogId || row.ownerId) ?? rows[0];
      await updateVipAutoBookClient(supabase, vip.id, {
        lastBookedFor: next,
        lastVerifiedAt: nowIso,
        lastBookStatus: status,
        lastBookError: null,
        ...(idHit?.dogId ? { fitdogDogId: idHit.dogId } : {}),
        ...(idHit?.ownerId ? { fitdogOwnerId: idHit.ownerId } : {}),
        ...(clearRebook ? { needToRebook: false } : {})
      });
      updates.push({
        id: vip.id,
        dogName: vip.dogName,
        ownerName: vip.ownerName,
        previousLastBookedFor: previous,
        lastBookedFor: next,
        status,
        rebookCleared: clearRebook
      });
    }

    const message = `Fitdog ${dates[0]} → ${dates[dates.length - 1]} · ${ownersUpserted} owners · ${dogsUpserted} dogs · ${confirmed} VIP confirmed · ${corrected} corrected · ${rebookCleared} rebook cleared · ${unmatched} unmatched${
      warnings.length ? ` · ${warnings.length} warning(s)` : ""
    }`;

    await supabase
      .from("vip_auto_book_directory_sync")
      .update({
        status: "ok",
        finished_at: nowIso,
        owners_upserted: ownersUpserted,
        dogs_upserted: dogsUpserted,
        message,
        error: warnings.length ? warnings.slice(0, 8).join(" | ") : null
      })
      .eq("id", run.id);

    return {
      ok: true,
      ownersUpserted,
      dogsUpserted,
      datesScanned: dates,
      clientsChecked: fitdogVipClients.length,
      clientsConfirmed: confirmed,
      clientsCorrected: corrected,
      clientsUnmatched: unmatched,
      clientsRebookCleared: rebookCleared,
      message,
      updates
    };
  } catch (error) {
    const err = error instanceof Error ? error.message : "Directory sync failed.";
    await supabase
      .from("vip_auto_book_directory_sync")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: err,
        message: "VIP Fitdog directory sync failed."
      })
      .eq("id", run.id);
    return {
      ok: false,
      ownersUpserted: 0,
      dogsUpserted: 0,
      datesScanned: dates,
      clientsChecked: 0,
      clientsConfirmed: 0,
      clientsCorrected: 0,
      clientsUnmatched: 0,
      clientsRebookCleared: 0,
      message: "VIP Fitdog directory sync failed.",
      error: err
    };
  }
}

export async function getLatestVipDirectorySync(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("vip_auto_book_directory_sync")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Exported for unit tests — pick best last-day from Fitdog hits for one VIP. */
export function resolveFitdogLastBookedForClient(
  client: Pick<VipAutoBookClient, "serviceKind">,
  hits: Array<{ date: string; serviceRaw?: string | null; serviceMatch?: boolean }>
): string | null {
  let bestService: string | null = null;
  let bestAny: string | null = null;
  for (const hit of hits) {
    const day = dateOnly(hit.date);
    if (!day) continue;
    bestAny = maxDate(bestAny, day);
    const matched =
      hit.serviceMatch === true ||
      (hit.serviceMatch !== false && fitdogServiceMatches(client.serviceKind, hit.serviceRaw));
    if (matched) bestService = maxDate(bestService, day);
  }
  return bestService ?? bestAny;
}
