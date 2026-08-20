import { NextResponse } from "next/server";
import {
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { isFullAdminRole } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isTlGingrKeyConfigured } from "@/lib/tl-digi-board/gingr-auth";
import { loadTlBoardCheckedInReservations } from "@/lib/tl-digi-board/gingr-reservation-services";
import {
  PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES,
  eligiblePackageIdMap,
  normalizePackageName
} from "@/lib/package-group-walks/eligible-packages";
import {
  buildOwnerPackageIndex,
  discoverGingrPackageSources
} from "@/lib/package-group-walks/gingr-packages";
import { buildPackageGroupWalkEligibility } from "@/lib/package-group-walks/service";
import {
  GINGR_UNAVAILABLE_BODY,
  aggregateSanitizedPackages,
  redactDiagnosticMessage,
  sanitizePackageRecord
} from "@/lib/package-group-walks/diagnostics";
import {
  packageGroupWalkBusinessDate,
  probePackageGroupWalksTable
} from "@/lib/package-group-walks/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

function gingrUnavailable(details?: string[]) {
  return NextResponse.json(
    {
      ...GINGR_UNAVAILABLE_BODY,
      gingrConnected: false,
      ...(details?.length ? { details } : {})
    },
    { status: 503, headers: NO_STORE }
  );
}

async function probeDatabase() {
  try {
    const supabase = getServiceSupabase({ timeoutMs: 8_000 });
    return await probePackageGroupWalksTable(supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not configured/i.test(message)) {
      return {
        status: "unable_to_verify" as const,
        message: "Supabase environment variables are missing."
      };
    }
    return {
      status: "unable_to_verify" as const,
      message: "Supabase probe failed."
    };
  }
}

/**
 * Package Group Walk Gingr package discovery. Full Admin only.
 * Never returns secrets, tokens, or owner PII.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!isFullAdminRole(getEffectiveAdminRole(request))) {
    return NextResponse.json(
      { ok: false, error: "FORBIDDEN", message: "Admin access required." },
      { status: 403, headers: NO_STORE }
    );
  }

  if (!isTlGingrKeyConfigured()) {
    return gingrUnavailable();
  }

  let reservations: Awaited<ReturnType<typeof loadTlBoardCheckedInReservations>> = [];
  try {
    reservations = await loadTlBoardCheckedInReservations();
  } catch (error) {
    return gingrUnavailable([
      redactDiagnosticMessage(error instanceof Error ? error.message : "Reservation lookup failed.")
    ]);
  }

  const discovery = await discoverGingrPackageSources(reservations);
  const packageIndex = await buildOwnerPackageIndex(reservations);
  const businessDate = packageGroupWalkBusinessDate();
  const { eligibility } = buildPackageGroupWalkEligibility({
    reservations,
    packageIndex,
    businessDate
  });

  const packages = aggregateSanitizedPackages(
    discovery.inspection.map((entry) =>
      sanitizePackageRecord(entry.record, entry.source, entry.ownerId)
    )
  );

  const database = await probeDatabase();
  const configuredPackages = PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES.map((definition) => ({
    key: definition.key,
    displayName: definition.displayName,
    canonicalNames: definition.canonicalNames,
    normalizedNames: definition.canonicalNames.map(normalizePackageName),
    confirmedGingrIds: [...eligiblePackageIdMap()]
      .filter(([, entry]) => entry.key === definition.key)
      .map(([id]) => id)
  }));

  const capturedIds = {
    monthly_unlimited:
      discovery.capturedIds.monthly_unlimited ??
      packages.find((entry) => entry.matchedKey === "monthly_unlimited" && entry.id)?.id ??
      null,
    twenty_day_plus:
      discovery.capturedIds.twenty_day_plus ??
      packages.find((entry) => entry.matchedKey === "twenty_day_plus" && entry.id)?.id ??
      null
  };

  return NextResponse.json(
    {
      ok: true,
      gingrConnected: true,
      checkedInDogsEvaluated: reservations.length,
      uniqueCheckedInOwners: discovery.uniqueCheckedInOwners,
      packageRowsInspected:
        discovery.inspection.length || packageIndex.packageRowsInspected,
      subscriptionRowsInspected: discovery.packageSources.subscriptions?.rows ?? 0,
      packageSources: discovery.packageSources,
      reservationShape: discovery.reservationShape,
      packages,
      capturedIds,
      configuredPackages,
      eligibleDogs: eligibility.map((row) => ({
        dogName: row.dogName,
        gingrAnimalId: row.gingrAnimalId,
        packageName: row.packageName,
        packageId: row.gingrPackageId,
        checkedIn: true,
        source: row.packageSource
      })),
      qualifyingCheckedInDogs: eligibility.length,
      packageSourceAvailable: packageIndex.available,
      packageIndexSources: packageIndex.sources,
      database: {
        packageGroupWalks: database.status,
        message: database.message
      },
      ...(packageIndex.errors.length
        ? { warnings: packageIndex.errors.map((entry) => redactDiagnosticMessage(entry)) }
        : {})
    },
    { headers: NO_STORE }
  );
}
