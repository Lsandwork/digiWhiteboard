import { NextResponse } from "next/server";
import {
  canManagePackageEligibility,
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse,
  blockDemoWrite
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolvePackageGroupWalkActor } from "@/lib/package-group-walks/actor";
import {
  loadLatestSuccessfulImport,
  loadReviewRecords,
  PackageEligibilitySchemaMissingError,
  probePackageEligibilityTables
} from "@/lib/package-group-walks/eligibility-store";
import { importOutstandingPackagesCsv } from "@/lib/package-group-walks/import-outstanding-packages";
import { packageImportFreshness } from "@/lib/package-group-walks/freshness";
import { isTlGingrKeyConfigured } from "@/lib/tl-digi-board/gingr-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

function forbidden() {
  return NextResponse.json(
    { ok: false, error: "FORBIDDEN", message: "Admin or Management access required." },
    { status: 403, headers: NO_STORE }
  );
}

/**
 * Package Eligibility status for Super Admin / Admin / Management.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!canManagePackageEligibility(getEffectiveAdminRole(request))) return forbidden();

  try {
    const supabase = getServiceSupabase({ timeoutMs: 10_000 });
    const schema = await probePackageEligibilityTables(supabase);
    const latest = schema.status === "applied" ? await loadLatestSuccessfulImport(supabase) : null;
    const review = latest ? await loadReviewRecords(supabase, latest.id) : [];
    return NextResponse.json(
      {
        ok: true,
        schema,
        gingrConfigured: isTlGingrKeyConfigured(),
        freshness: packageImportFreshness(latest?.importedAt ?? null),
        lastSync: latest?.importedAt ?? null,
        import: latest,
        needsReviewCount: review.length,
        summary: latest
          ? {
              totalCsvRows: latest.rowCount,
              eligiblePackageRows: latest.eligibleRowCount,
              monthlyUnlimited: latest.monthlyUnlimitedCount,
              twentyDayPlus: latest.twentyDayPlusCount,
              matchedAutomatically: latest.matchedCount,
              matchedBySavedMapping: latest.mappedCount,
              ambiguous: latest.ambiguousCount,
              unresolved: latest.unresolvedCount,
              expired: latest.expiredCount,
              zeroRemaining: latest.zeroRemainingCount,
              lastSync: latest.importedAt
            }
          : null
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    if (error instanceof PackageEligibilitySchemaMissingError) {
      return NextResponse.json({ ok: false, schemaMissing: true, error: error.message }, { status: 503, headers: NO_STORE });
    }
    const message = error instanceof Error ? error.message : "Unable to load package eligibility.";
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers: NO_STORE });
  }
}

/**
 * Upload Outstanding Packages Report CSV.
 */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!canManagePackageEligibility(getEffectiveAdminRole(request))) return forbidden();

  const demoBlocked = blockDemoWrite(request);
  if (demoBlocked) return demoBlocked;

  if (!isTlGingrKeyConfigured()) {
    return NextResponse.json(
      { ok: false, error: "GINGR_UNAVAILABLE", message: "Gingr credentials are not configured on this environment." },
      { status: 503, headers: NO_STORE }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "MISSING_FILE", message: "Upload an Outstanding Packages Report CSV." },
      { status: 400, headers: NO_STORE }
    );
  }

  const filename = file.name || "outstanding-packages.csv";
  if (!/\.csv$/i.test(filename) && file.type && !/csv|text\/plain/i.test(file.type)) {
    return NextResponse.json(
      { ok: false, error: "INVALID_TYPE", message: "File must be a CSV." },
      { status: 400, headers: NO_STORE }
    );
  }

  const csvText = await file.text();
  const session = getAdminSessionFromRequest(request);

  try {
    const supabase = getServiceSupabase({ timeoutMs: 20_000 });
    const actor = await resolvePackageGroupWalkActor(supabase, session);
    const result = await importOutstandingPackagesCsv({
      supabase,
      csvText,
      filename,
      importedBy: actor?.userId ?? null,
      importedByName: actor?.displayName ?? session?.email ?? "Admin"
    });

    await writeAdminAuditLog({
      actorAdminId: actor?.userId ?? null,
      actorEmail: session?.email ?? null,
      action: "package_eligibility.imported",
      targetType: "package_eligibility_import",
      targetId: result.import.id,
      details: {
        filename,
        totalCsvRows: result.summary.totalCsvRows,
        matchedAutomatically: result.summary.matchedAutomatically,
        ambiguous: result.summary.ambiguous,
        unresolved: result.summary.unresolved
      }
    });

    return NextResponse.json({ ...result, ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof PackageEligibilitySchemaMissingError) {
      return NextResponse.json({ ok: false, schemaMissing: true, error: error.message }, { status: 503, headers: NO_STORE });
    }
    const message = error instanceof Error ? error.message : "Unable to import Outstanding Packages CSV.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: NO_STORE });
  }
}
