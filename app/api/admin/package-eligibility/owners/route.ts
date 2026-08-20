import { NextResponse } from "next/server";
import {
  canManagePackageEligibility,
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { loadGingrOwnerDirectory, searchOwnerDirectory } from "@/lib/package-group-walks/owner-directory";
import { isTlGingrKeyConfigured } from "@/lib/tl-digi-board/gingr-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

/**
 * Search Gingr owners by name for unresolved CSV rows.
 * Returns a capped candidate list — never the full directory, emails, or phones.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  if (!canManagePackageEligibility(getEffectiveAdminRole(request))) {
    return NextResponse.json(
      { ok: false, error: "FORBIDDEN", message: "Admin or Management access required." },
      { status: 403, headers: NO_STORE }
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  if (query.trim().length < 2) {
    return NextResponse.json({ ok: true, candidates: [] }, { headers: NO_STORE });
  }

  if (!isTlGingrKeyConfigured()) {
    return NextResponse.json(
      { ok: false, error: "GINGR_UNAVAILABLE", message: "Gingr credentials are not configured." },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const directory = await loadGingrOwnerDirectory();
    const candidates = searchOwnerDirectory(directory, query, 25);
    return NextResponse.json({ ok: true, candidates }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search Gingr owners.";
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers: NO_STORE });
  }
}
