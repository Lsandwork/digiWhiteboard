import { NextResponse } from "next/server";
import { clearAdminSessionCookies } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookies(response, request.headers.get("host"));
  return response;
}
