import { NextResponse } from "next/server";
import {
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { isSuperAdminLegacyRole } from "@/lib/admin/permissions";
import { isTlGingrKeyConfigured } from "@/lib/tl-digi-board/gingr-auth";
import { loadTlBoardCheckedInReservations } from "@/lib/tl-digi-board/gingr-reservation-services";
import { inspectOwnersCsvResolution, toPublicCsvOwnerResolutionLookup } from "@/lib/package-group-walks/csv-owner-resolution";
import { GINGR_UNAVAILABLE_BODY, redactDiagnosticMessage } from "@/lib/package-group-walks/diagnostics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

/**
 * TEMPORARY Super Admin-only Outstanding Packages CSV → Gingr owner_id diagnostic.
 *
 * Uses the existing server-side Users API key. Returns schema field names and
 * aggregate counts only — never the owner directory, CSV names, or other PII.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!isSuperAdminLegacyRole(getEffectiveAdminRole(request))) {
    return NextResponse.json(
      { ok: false, error: "FORBIDDEN", message: "Super Admin access required." },
      { status: 403, headers: NO_STORE }
    );
  }

  if (!isTlGingrKeyConfigured()) {
    return NextResponse.json(
      { ...GINGR_UNAVAILABLE_BODY, gingrConnected: false },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const reservations = await loadTlBoardCheckedInReservations();
    const report = await inspectOwnersCsvResolution(reservations);
    return NextResponse.json(
      {
        ok: true,
        gingrConnected: true,
        ...toPublicCsvOwnerResolutionLookup(report)
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ...GINGR_UNAVAILABLE_BODY,
        gingrConnected: false,
        details: [redactDiagnosticMessage(error instanceof Error ? error.message : "CSV owner resolution failed.")]
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
