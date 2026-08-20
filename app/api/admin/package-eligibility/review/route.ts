import { NextResponse } from "next/server";
import {
  canManagePackageEligibility,
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  loadLatestSuccessfulImport,
  loadReviewRecords,
  PackageEligibilitySchemaMissingError
} from "@/lib/package-group-walks/eligibility-store";
import { loadGingrOwnerDirectory, publicCandidatesForName } from "@/lib/package-group-walks/owner-directory";
import { normalizeOwnerName } from "@/lib/package-group-walks/csv-owner-resolution";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

/**
 * Ambiguous / unresolved package owners for Admin review.
 * Returns CSV display names + candidate Gingr ids/names only — never the directory.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!canManagePackageEligibility(getEffectiveAdminRole(request))) {
    return NextResponse.json(
      { ok: false, error: "FORBIDDEN", message: "Admin or Management access required." },
      { status: 403, headers: NO_STORE }
    );
  }

  try {
    const supabase = getServiceSupabase({ timeoutMs: 15_000 });
    const latest = await loadLatestSuccessfulImport(supabase);
    if (!latest) {
      return NextResponse.json({ ok: true, importId: null, rows: [] }, { headers: NO_STORE });
    }

    const records = await loadReviewRecords(supabase, latest.id);
    const names = [...new Set(records.map((row) => row.normalizedOwnerName))];
    const directory = names.length ? await loadGingrOwnerDirectory() : null;

    const rows = records.map((row) => ({
      id: row.id,
      ownerDisplayName: row.ownerDisplayName,
      normalizedOwnerName: row.normalizedOwnerName,
      packageType: row.packageType,
      packageKey: row.packageKey,
      numberRemaining: row.numberRemaining,
      matchStatus: row.matchStatus,
      candidates:
        directory && row.matchStatus === "ambiguous"
          ? publicCandidatesForName(directory, normalizeOwnerName(row.ownerDisplayName))
          : []
    }));

    return NextResponse.json({ ok: true, importId: latest.id, rows }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof PackageEligibilitySchemaMissingError) {
      return NextResponse.json({ ok: false, schemaMissing: true, error: error.message }, { status: 503, headers: NO_STORE });
    }
    const message = error instanceof Error ? error.message : "Unable to load package owners for review.";
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers: NO_STORE });
  }
}
