import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { canAccessLiveFleet } from "@/lib/live-fleet/access";
import { getLiveFleetSnapshot } from "@/lib/live-fleet/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireLiveFleetAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: unauthorizedAdminResponse() };

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : accessFromLegacyRole(session.adminUserId ?? null, session.email ?? null, session.role);

  if (!canAccessLiveFleet(access, session.role)) {
    return {
      error: NextResponse.json({ error: "You do not have access to Live Fleet." }, { status: 403 })
    };
  }

  return { session, access };
}

/** Strip any accidental secret-shaped fields before responding to the browser. */
function assertSafeClientPayload(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/SAMSARA_API_TOKEN|SAMSARA_API_KEY|SAMSARA_BEARER_TOKEN|Bearer\s+[A-Za-z0-9._-]{20,}/i.test(text)) {
    throw new Error("Refusing to return a Live Fleet payload that appears to contain Samsara credentials.");
  }
}

export async function GET(request: Request) {
  const gate = await requireLiveFleetAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  const url = new URL(request.url);
  const forceSync = url.searchParams.get("refresh") === "1";

  try {
    const snapshot = await getLiveFleetSnapshot({ forceSync });
    assertSafeClientPayload(snapshot);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "live_fleet",
        event: "api_error",
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown"
      })
    );
    return NextResponse.json(
      {
        error: "Unable to load Live Fleet right now.",
        detail: "Fleet data is temporarily unavailable. Route Generator and owner tracking are unaffected."
      },
      { status: 503 }
    );
  }
}
