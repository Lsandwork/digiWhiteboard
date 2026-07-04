import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { ...getAdminSessionCookieOptions(0), maxAge: 0 });
  return response;
}
