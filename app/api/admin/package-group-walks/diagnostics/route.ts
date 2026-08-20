import { NextResponse } from "next/server";
import {
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { isFullAdminRole } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { loadTlBoardCheckedInReservations } from "@/lib/tl-digi-board/gingr-reservation-services";
import {
  PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES,
  eligiblePackageIdMap,
  matchEligiblePackage,
  normalizePackageName
} from "@/lib/package-group-walks/eligible-packages";
import {
  loadGingrSubscriptionIndex,
  ownerIdFromReservation
} from "@/lib/package-group-walks/gingr-packages";
import { loadPackageGroupWalkState } from "@/lib/package-group-walks/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Package Group Walk health + Gingr package discovery. Admin only.
 *
 * Lists the distinct package/subscription labels Gingr actually returns so the
 * canonical names (and, once known, the stable Gingr package ids) can be
 * confirmed against production data instead of guessed. Never returns secrets.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!isFullAdminRole(getEffectiveAdminRole(request))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const supabase = getServiceSupabase({ timeoutMs: 10_000 });
  const configured = PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES.map((definition) => ({
    key: definition.key,
    displayName: definition.displayName,
    canonicalNames: definition.canonicalNames,
    normalizedNames: definition.canonicalNames.map(normalizePackageName),
    confirmedGingrIds: [...eligiblePackageIdMap()]
      .filter(([, entry]) => entry.key === definition.key)
      .map(([id]) => id)
  }));

  const observed = new Map<string, { label: string; id: string | null; count: number; matched: string | null }>();
  const record = (label: string | null, id: string | null) => {
    const name = String(label ?? "").trim();
    if (!name && !id) return;
    const key = `${id ?? ""}|${normalizePackageName(name)}`;
    const existing = observed.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    observed.set(key, {
      label: name,
      id,
      count: 1,
      matched: matchEligiblePackage({ id, name })?.key ?? null
    });
  };

  const errors: string[] = [];
  let subscriptionRowCount = 0;
  let reservationCount = 0;
  let ownersWithReservations = 0;

  try {
    const reservations = await loadTlBoardCheckedInReservations();
    reservationCount = reservations.length;
    ownersWithReservations = new Set(
      reservations.map((reservation) => ownerIdFromReservation(reservation)).filter(Boolean)
    ).size;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Reservation lookup failed.");
  }

  try {
    const { byOwnerId, rowCount } = await loadGingrSubscriptionIndex();
    subscriptionRowCount = rowCount;
    for (const packages of byOwnerId.values()) {
      for (const entry of packages) record(entry.rawName, entry.gingrPackageId);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Subscription lookup failed.");
  }

  let state: Awaited<ReturnType<typeof loadPackageGroupWalkState>> | null = null;
  try {
    state = await loadPackageGroupWalkState(supabase);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "State load failed.");
  }

  return NextResponse.json(
    {
      configuredPackages: configured,
      gingr: {
        checkedInReservations: reservationCount,
        distinctOwners: ownersWithReservations,
        subscriptionRows: subscriptionRowCount,
        observedEligiblePackages: [...observed.values()].sort((a, b) => b.count - a.count)
      },
      state: state
        ? {
            businessDate: state.meta.businessDate,
            syncState: state.meta.syncState,
            lastSuccessfulSyncAt: state.meta.lastSuccessfulSyncAt,
            lastError: state.meta.lastError,
            packageSources: state.meta.packageSources,
            packageSourceAvailable: state.meta.packageSourceAvailable,
            eligibleToday: state.summary.eligibleToday,
            remaining: state.summary.remaining,
            completed: state.summary.completed
          }
        : null,
      errors
    },
    { headers: { "cache-control": "private, no-store, max-age=0" } }
  );
}
