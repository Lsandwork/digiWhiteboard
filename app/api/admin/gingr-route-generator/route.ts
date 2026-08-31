import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { accessFromLegacyRole, canAccessRouteGenerator } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
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

export async function GET(request: Request) {
  const gate = await requireGingrRouteAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date")?.trim() || todayPacificDateKey();
  const refresh = url.searchParams.get("refresh") === "1";

  try {
    const payload = await loadGingrRouteSchedule({ date: dateParam, refresh });
    return NextResponse.json(payload);
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "gingr_route_generator",
        event: "api_error",
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown"
      })
    );
    return NextResponse.json(
      {
        error: "Unable to load Gingr schedule",
        detail: "We couldn't retrieve schedule data for this date."
      },
      { status: 503 }
    );
  }
}
