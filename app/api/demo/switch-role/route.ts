import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  getAdminSessionFromRequest
} from "@/lib/admin/session";
import { DEMO_ROLE_OPTIONS } from "@/lib/demo/constants";
import { isDemoSession } from "@/lib/demo/session";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(DEMO_ROLE_OPTIONS.map((role) => role.value));

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!isDemoSession(session)) {
    return NextResponse.json({ error: "Role switching is only available in demo mode." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { role?: string };
    const role = String(body.role ?? "");
    if (!ALLOWED.has(role as (typeof DEMO_ROLE_OPTIONS)[number]["value"])) {
      return NextResponse.json({ error: "Invalid demo role." }, { status: 400 });
    }

    const token = createAdminSessionToken({
      email: session!.email,
      adminUserId: session!.adminUserId,
      role: session!.role,
      mustChangePassword: false,
      isDemo: true,
      demoRole: role
    });

    const response = NextResponse.json({ ok: true, demoRole: role });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to switch demo role.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
