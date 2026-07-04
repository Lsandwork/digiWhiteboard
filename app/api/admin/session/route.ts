import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const username = getAdminSessionFromRequest(request);
  if (!username) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, username });
}
