import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  accessFromLegacyRole,
  canAccessGingrRouteDiagnostics
} from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { buildGingrRouteDiagnostics } from "@/lib/gingr-route-generator/diagnostics";
import { todayPacificDateKey } from "@/lib/gingr-route-generator/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireGingrDiagnosticsAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: unauthorizedAdminResponse() };

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : accessFromLegacyRole(session.adminUserId ?? null, session.email ?? null, session.role);

  if (!canAccessGingrRouteDiagnostics(access, session.role)) {
    return {
      error: NextResponse.json(
        {
          error:
            "Gingr reservation diagnostics are limited to Owner/Manager Admin accounts."
        },
        { status: 403 }
      )
    };
  }

  return { session, access };
}

/**
 * GET /api/admin/gingr-route-generator/diagnostics
 * Query: date=YYYY-MM-DD, dog=Annie, includeRaw=1
 *
 * Read-only inspection of raw Gingr reservation JSON vs RuffOps addon parsing.
 */
export async function GET(request: Request) {
  const gate = await requireGingrDiagnosticsAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date")?.trim() || todayPacificDateKey();
  const dogQuery = url.searchParams.get("dog")?.trim() || "Annie";
  const includeRaw = url.searchParams.get("includeRaw") === "1";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }

  try {
    const report = await buildGingrRouteDiagnostics({
      date: dateParam,
      dogQuery,
      includeRaw
    });
    console.info(
      JSON.stringify({
        scope: "gingr_route_diagnostics",
        event: "ok",
        date: dateParam,
        dogQuery,
        summary: report.findings.summary.slice(0, 240)
      })
    );
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diagnostics failed.";
    console.error(
      JSON.stringify({
        scope: "gingr_route_diagnostics",
        event: "error",
        message: message.slice(0, 200)
      })
    );
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to run Gingr diagnostics.",
        detail: message.slice(0, 300)
      },
      { status: 503 }
    );
  }
}