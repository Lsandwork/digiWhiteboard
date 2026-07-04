import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    username: session.email,
    adminUserId: session.adminUserId ?? null,
    role: session.role ?? null
  });
}
