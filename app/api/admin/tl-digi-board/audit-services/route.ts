/**
 * Admin-only live audit for TL additional services Gingr completion.
 * GET /api/admin/tl-digi-board/audit-services
 */
import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { isFullAdminLegacyRole, isSuperAdminAccess } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getRequestUserAccess } from "@/lib/auth/permissions";
import { runTlAdditionalServicesCompletionAudit } from "@/lib/tl-digi-board/additional-services-audit";
import { isTlGingrKeyConfigured } from "@/lib/tl-digi-board/gingr-auth";
import { TL_BOARD_REQUIRED_ADDITIONAL_SERVICES } from "@/lib/tl-digi-board/tl-service-names";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const access = await getRequestUserAccess(request);
  if (!isFullAdminLegacyRole(session.role) && !isSuperAdminAccess(access)) {
    return NextResponse.json({ error: "Full admin access required." }, { status: 403 });
  }

  if (!isTlGingrKeyConfigured()) {
    return NextResponse.json({ error: "TL_GINGR_KEY is not configured." }, { status: 503 });
  }

  try {
    const audit = await runTlAdditionalServicesCompletionAudit();
    return NextResponse.json({
      ok: audit.allRequiredTypesPass,
      requiredTypes: TL_BOARD_REQUIRED_ADDITIONAL_SERVICES,
      audit
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TL additional services audit failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
