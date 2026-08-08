type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { createGingrClient } from "@/lib/integrations/gingr/client";
import { mapGingrReservationToTaxiRow } from "@/lib/route-generator/gingr-taxi";
import { listVipAutoBookClients, updateVipAutoBookClient } from "@/lib/staff/vip-auto-book/store";
import type { VipAutoBookClient } from "@/lib/staff/vip-auto-book/types";

function pacificDateOffset(daysFromToday: number): string {
  const now = new Date();
  const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  pacific.setDate(pacific.getDate() + daysFromToday);
  const y = pacific.getFullYear();
  const m = String(pacific.getMonth() + 1).padStart(2, "0");
  const d = String(pacific.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function ownerNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftParts = left.split(" ");
  const rightParts = right.split(" ");
  const leftLast = leftParts[leftParts.length - 1];
  const rightLast = rightParts[rightParts.length - 1];
  if (leftLast && rightLast && leftLast === rightLast && leftLast.length >= 3) {
    // Require a shared first-token when only last names match (Nina vs N.).
    const leftFirst = leftParts[0];
    const rightFirst = rightParts[0];
    if (leftFirst && rightFirst && (leftFirst[0] === rightFirst[0] || leftFirst === rightFirst)) return true;
  }
  return false;
}

function dogNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ReservationHit = {
  dogName: string | null;
  ownerName: string | null;
  animalId: string | null;
  ownerId: string | null;
  lastDay: string;
  reservationId: string;
};

function reservationToHit(reservation: Parameters<typeof mapGingrReservationToTaxiRow>[0]): ReservationHit | null {
  const raw = reservation as Record<string, unknown>;
  if (raw.cancelled_date) return null;
  const mapped = mapGingrReservationToTaxiRow(reservation);
  const lastDay = dateOnly(mapped.endDate) || dateOnly(mapped.startDate);
  if (!lastDay) return null;
  return {
    dogName: mapped.dogName,
    ownerName: mapped.ownerName,
    animalId: mapped.dogId,
    ownerId: mapped.ownerId,
    lastDay,
    reservationId: mapped.reservationId
  };
}

function matchClient(client: VipAutoBookClient, hit: ReservationHit) {
  if (client.gingrAnimalId && hit.animalId && String(client.gingrAnimalId) === String(hit.animalId)) {
    return true;
  }
  if (!dogNamesMatch(client.dogName, hit.dogName)) return false;
  return ownerNamesMatch(client.ownerName, hit.ownerName);
}

/**
 * Scan Gingr reservations and confirm/correct VIP Auto Book "Last Day Booked".
 * Matches active VIP clients by gingr animal id (when known) or dog + owner name.
 */
export async function syncVipGingrLastBooked(
  supabase: SupabaseClient,
  options?: { lookbackDays?: number; lookaheadDays?: number }
): Promise<{
  ok: boolean;
  datesScanned: string[];
  clientsChecked: number;
  clientsConfirmed: number;
  clientsCorrected: number;
  clientsUnmatched: number;
  message: string;
  error?: string;
  updates?: Array<{
    id: string;
    dogName: string;
    ownerName: string;
    previousLastBookedFor: string | null;
    lastBookedFor: string | null;
    status: string;
  }>;
}> {
  const client = createGingrClient();
  if (!client.config.apiKey) {
    return {
      ok: false,
      datesScanned: [],
      clientsChecked: 0,
      clientsConfirmed: 0,
      clientsCorrected: 0,
      clientsUnmatched: 0,
      message: "Gingr API is not configured.",
      error: "Missing GINGR_API_KEY."
    };
  }

  const lookback = Math.max(0, Math.min(30, options?.lookbackDays ?? 14));
  const lookahead = Math.max(7, Math.min(90, options?.lookaheadDays ?? 60));
  const dates: string[] = [];
  for (let i = -lookback; i <= lookahead; i += 1) {
    dates.push(pacificDateOffset(i));
  }

  const { data: run, error: runError } = await supabase
    .from("vip_auto_book_gingr_sync")
    .insert({
      status: "running",
      dates_scanned: dates
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);

  const warnings: string[] = [];
  const hitsByClient = new Map<string, { lastDay: string; animalId: string | null; ownerId: string | null }>();

  try {
    const listed = await listVipAutoBookClients(supabase, { status: "active", pageSize: 200 });
    const vipClients = listed.rows;

    // Scan in weekly chunks to reduce Gingr calls.
    for (let i = 0; i < dates.length; i += 7) {
      const chunk = dates.slice(i, i + 7);
      const start = chunk[0]!;
      const end = chunk[chunk.length - 1]!;
      try {
        const payload = await client.listReservationsByDateRange(start, end);
        for (const reservation of payload) {
          const hit = reservationToHit(reservation);
          if (!hit) continue;
          for (const vip of vipClients) {
            if (!matchClient(vip, hit)) continue;
            const prev = hitsByClient.get(vip.id);
            const nextLast = maxDate(prev?.lastDay ?? null, hit.lastDay) || hit.lastDay;
            hitsByClient.set(vip.id, {
              lastDay: nextLast,
              animalId: hit.animalId || prev?.animalId || null,
              ownerId: hit.ownerId || prev?.ownerId || null
            });
          }
        }
      } catch (error) {
        warnings.push(`${start}..${end}: ${error instanceof Error ? error.message : "Gingr pull failed"}`);
      }
      await sleep(150);
    }

    let confirmed = 0;
    let corrected = 0;
    let unmatched = 0;
    const updates: Array<{
      id: string;
      dogName: string;
      ownerName: string;
      previousLastBookedFor: string | null;
      lastBookedFor: string | null;
      status: string;
    }> = [];
    const nowIso = new Date().toISOString();

    for (const vip of vipClients) {
      const hit = hitsByClient.get(vip.id);
      if (!hit) {
        unmatched += 1;
        await updateVipAutoBookClient(supabase, vip.id, {
          lastVerifiedAt: nowIso,
          lastBookStatus: "gingr_no_reservations",
          lastBookError: "No matching Gingr reservation found in scan window."
        });
        updates.push({
          id: vip.id,
          dogName: vip.dogName,
          ownerName: vip.ownerName,
          previousLastBookedFor: vip.lastBookedFor,
          lastBookedFor: vip.lastBookedFor,
          status: "gingr_no_reservations"
        });
        continue;
      }

      const previous = vip.lastBookedFor;
      const next = hit.lastDay;
      const same = previous === next;
      const status = same ? "gingr_confirmed" : "gingr_corrected";
      if (same) confirmed += 1;
      else corrected += 1;

      await updateVipAutoBookClient(supabase, vip.id, {
        lastBookedFor: next,
        lastVerifiedAt: nowIso,
        lastBookStatus: status,
        lastBookError: null,
        ...(hit.animalId ? { gingrAnimalId: hit.animalId } : {}),
        ...(hit.ownerId ? { gingrOwnerId: hit.ownerId } : {})
      });
      updates.push({
        id: vip.id,
        dogName: vip.dogName,
        ownerName: vip.ownerName,
        previousLastBookedFor: previous,
        lastBookedFor: next,
        status
      });
    }

    const message = `Gingr scan ${dates[0]} → ${dates[dates.length - 1]} · ${vipClients.length} VIP · ${confirmed} confirmed · ${corrected} corrected · ${unmatched} unmatched${
      warnings.length ? ` · ${warnings.length} warning(s)` : ""
    }`;

    await supabase
      .from("vip_auto_book_gingr_sync")
      .update({
        status: "ok",
        finished_at: nowIso,
        clients_checked: vipClients.length,
        clients_confirmed: confirmed,
        clients_corrected: corrected,
        clients_unmatched: unmatched,
        message,
        error: warnings.length ? warnings.slice(0, 8).join(" | ") : null
      })
      .eq("id", run.id);

    return {
      ok: true,
      datesScanned: dates,
      clientsChecked: vipClients.length,
      clientsConfirmed: confirmed,
      clientsCorrected: corrected,
      clientsUnmatched: unmatched,
      message,
      updates
    };
  } catch (error) {
    const err = error instanceof Error ? error.message : "Gingr VIP sync failed.";
    await supabase
      .from("vip_auto_book_gingr_sync")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: err,
        message: "VIP Gingr last-booked sync failed."
      })
      .eq("id", run.id);
    return {
      ok: false,
      datesScanned: dates,
      clientsChecked: 0,
      clientsConfirmed: 0,
      clientsCorrected: 0,
      clientsUnmatched: 0,
      message: "VIP Gingr last-booked sync failed.",
      error: err
    };
  }
}

export async function getLatestVipGingrSync(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("vip_auto_book_gingr_sync")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
