import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { listDisplayDevices } from "@/lib/display-keeper-server";
import type { DisplayType } from "@/lib/display-keeper";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseDisplayType(value: string | null): DisplayType | undefined {
  if (value === "staff_whiteboard" || value === "lobby_whiteboard") return value;
  return undefined;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const displayType = parseDisplayType(new URL(request.url).searchParams.get("displayType"));
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
