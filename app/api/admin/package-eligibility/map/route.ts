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
import { normalizeOwnerName } from "@/lib/package-group-walks/csv-owner-resolution";
import {
  applyManualMappingToImport,
  loadLatestSuccessfulImport,
  recountImportMatches,
  upsertOwnerMapping,
  PackageEligibilitySchemaMissingError
} from "@/lib/package-group-walks/eligibility-store";
import { loadGingrOwnerDirectory } from "@/lib/package-group-walks/owner-directory";
import { invalidateTtlCache } from "@/lib/server-ttl-cache";
import { PACKAGE_GROUP_WALK_ELIGIBILITY_CACHE_PREFIX } from "@/lib/package-group-walks/import-outstanding-packages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

/**
 * Persist a manual CSV name → Gingr owner id mapping and recompute eligibility.
 */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!canManagePackageEligibility(getEffectiveAdminRole(request))) {
    return NextResponse.json(
      { ok: false, error: "FORBIDDEN", message: "Admin or Management access required." },
      { status: 403, headers: NO_STORE }
    );
  }

  const demoBlocked = blockDemoWrite(request);
  if (demoBlocked) return demoBlocked;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalizedOwnerName = normalizeOwnerName(String(body.normalizedOwnerName ?? body.ownerDisplayName ?? ""));
  const gingrOwnerId = String(body.gingrOwnerId ?? "").trim();
  if (!normalizedOwnerName || !gingrOwnerId) {
    return NextResponse.json(
      { ok: false, error: "INVALID", message: "Owner name and Gingr owner id are required." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const directory = await loadGingrOwnerDirectory();
    if (!directory.byId.has(gingrOwnerId)) {
      return NextResponse.json(
        { ok: false, error: "OWNER_NOT_FOUND", message: "That Gingr owner id is not in the current owners list." },
        { status: 400, headers: NO_STORE }
      );
    }

    const supabase = getServiceSupabase({ timeoutMs: 15_000 });
    const session = getAdminSessionFromRequest(request);
    const actor = await resolvePackageGroupWalkActor(supabase, session);
    const mapping = await upsertOwnerMapping(supabase, {
      normalizedOwnerName,
      gingrOwnerId,
      createdBy: actor?.userId ?? null
    });

    const latest = await loadLatestSuccessfulImport(supabase);
    let updatedRecords = 0;
    if (latest) {
      updatedRecords = await applyManualMappingToImport(supabase, latest.id, normalizedOwnerName, gingrOwnerId);
      await recountImportMatches(supabase, latest.id);
    }

    invalidateTtlCache(PACKAGE_GROUP_WALK_ELIGIBILITY_CACHE_PREFIX);

    await writeAdminAuditLog({
      actorAdminId: actor?.userId ?? null,
      actorEmail: session?.email ?? null,
      action: "package_eligibility.owner_mapped",
      targetType: "package_owner_mapping",
      targetId: mapping.id,
      details: { updatedRecords }
    });

    return NextResponse.json(
      { ok: true, mapping: { normalizedOwnerName: mapping.normalizedOwnerName, gingrOwnerId: mapping.gingrOwnerId }, updatedRecords },
      { headers: NO_STORE }
    );
  } catch (error) {
    if (error instanceof PackageEligibilitySchemaMissingError) {
      return NextResponse.json({ ok: false, schemaMissing: true, error: error.message }, { status: 503, headers: NO_STORE });
    }
    const message = error instanceof Error ? error.message : "Unable to save owner mapping.";
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers: NO_STORE });
  }
}
