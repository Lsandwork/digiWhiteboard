import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { parseDisplayType } from "@/lib/display-keeper";
import { listDisplayDevices } from "@/lib/display-keeper-server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const displayType = parseDisplayType(new URL(request.url).searchParams.get("displayType")) ?? undefined;
  const devices = await listDisplayDevices(getServiceSupabase(), displayType);

  return NextResponse.json(
    {
      ok: true,
      devices,
      serverTime: new Date().toISOString()
    },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
