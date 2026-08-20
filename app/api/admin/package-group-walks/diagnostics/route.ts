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
  collectPackageRecordsForInspection,
  collectReservationPackageRecordsForInspection,
  loadAllGingrSubscriptionRows
} from "@/lib/package-group-walks/gingr-packages";
import {
  GINGR_UNAVAILABLE_BODY,
  aggregateSanitizedPackages,
  redactDiagnosticMessage,
  sanitizePackageRecord,
  type SanitizedGingrPackage
} from "@/lib/package-group-walks/diagnostics";
import { probePackageGroupWalksTable } from "@/lib/package-group-walks/store";

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
  } catch {
    return {
      status: "unable_to_verify" as const,
      message: "Supabase is not configured in this environment."
    };
  }
}

/**
 * Package Group Walk Gingr package discovery. Full Admin only.
 *
 * Returns sanitized package/subscription identifiers Gingr actually sends so
 * Monthly Unlimited and 20-Day PLUS Package can be pinned by stable id.
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

  const errors: string[] = [];
  let reservations: Awaited<ReturnType<typeof loadTlBoardCheckedInReservations>> = [];
  let reservationFailed = false;
  try {
    reservations = await loadTlBoardCheckedInReservations();
  } catch (error) {
    reservationFailed = true;
    errors.push(
      redactDiagnosticMessage(error instanceof Error ? error.message : "Reservation lookup failed.")
    );
  }

  let subscriptionRows: Array<Record<string, unknown>> = [];
  let subscriptionFailed = false;
  try {
    const loaded = await loadAllGingrSubscriptionRows();
    subscriptionRows = loaded.rows;
  } catch (error) {
    subscriptionFailed = true;
    errors.push(
      redactDiagnosticMessage(error instanceof Error ? error.message : "Subscription lookup failed.")
    );
  }

  const inspectionRecords = [
    ...subscriptionRows.flatMap((row) => collectPackageRecordsForInspection(row, "subscriptions")),
    ...reservations.flatMap((reservation) => collectReservationPackageRecordsForInspection(reservation))
  ];
  const packages: SanitizedGingrPackage[] = aggregateSanitizedPackages(
    inspectionRecords.map((entry) => sanitizePackageRecord(entry.record, entry.source, entry.ownerId))
  );

  if ((reservationFailed && subscriptionFailed) || (subscriptionFailed && packages.length === 0)) {
    return gingrUnavailable(errors);
  }

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

  return NextResponse.json(
    {
      ok: true,
      gingrConnected: !subscriptionFailed || !reservationFailed,
      checkedInDogsEvaluated: reservations.length,
      subscriptionRowsInspected: subscriptionRows.length,
      packages,
      configuredPackages,
      database: {
        packageGroupWalks: database.status,
        message: database.message
      },
      ...(errors.length ? { warnings: errors } : {})
    },
    { headers: NO_STORE }
  );
}
