import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { accessFromLegacyRole, canAccessRouteGenerator } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { buildGingrSamsaraExport } from "@/lib/gingr-route-generator/samsara-export";
import { loadGingrRouteSchedule, todayPacificDateKey } from "@/lib/gingr-route-generator/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireGingrRouteAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: unauthorizedAdminResponse() };

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : accessFromLegacyRole(session.adminUserId ?? null, session.email ?? null, session.role);

  if (!canAccessRouteGenerator(access, session.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have access to Gingr Route Generator." },
        { status: 403 }
      )
    };
  }

  return { session, access };
}

/**
 * GET /api/admin/gingr-route-generator/samsara-export?date=YYYY-MM-DD
 * Optional: &download=1 to return CSV attachment (default JSON summary + csv text).
 *
 * Uses Digi's exact Samsara bulk-upload headers from lib/route-generator/samsara-csv.ts.
 */
export async function GET(request: Request) {
  const gate = await requireGingrRouteAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date")?.trim() || todayPacificDateKey();
  const download = url.searchParams.get("download") === "1";
  const refresh = url.searchParams.get("refresh") === "1";

  try {
    const payload = await loadGingrRouteSchedule({ date: dateParam, refresh });
    const result = await buildGingrSamsaraExport({
      date: payload.date,
      dogs: payload.dogs
    });

    if (!result.ok) {
      const status =
        result.code === "geocode_unavailable" || result.code === "geocode_failed"
          ? 503
          : result.code === "csv_validation_failed"
            ? 422
            : 400;
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
          summary: result.summary ?? null,
          missingAddressStops: result.summary?.missingAddressStops ?? [],
          validationErrors: result.validationErrors ?? []
        },
        { status }
      );
    }

    if (download) {
      return new NextResponse(result.csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${result.summary.fileName}"`,
          "Cache-Control": "no-store"
        }
      });
    }

    return NextResponse.json({
      ok: true,
      summary: result.summary,
      csv: result.csv,
      missingAddressStops: result.summary.missingAddressStops
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "gingr_route_generator",
        event: "samsara_export_error",
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown"
      })
    );
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to export Samsara CSV",
        detail: "We couldn't generate the Samsara export for this date."
      },
      { status: 503 }
    );
  }
}
