import { NextResponse } from "next/server";
import { buildHeartbeatResponse } from "@/lib/display-keeper-server";
import type { DisplayType, HeartbeatRequest } from "@/lib/display-keeper";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseDisplayType(value: unknown): DisplayType | null {
  if (value === "staff_whiteboard" || value === "lobby_whiteboard") return value;
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<HeartbeatRequest>;
    const deviceId = body.deviceId?.trim();
    const displayType = parseDisplayType(body.displayType);
    const route = body.route?.trim();

    if (!deviceId || !displayType || !route) {
      return NextResponse.json({ ok: false, error: "Invalid heartbeat payload." }, { status: 400 });
    }

    const response = await buildHeartbeatResponse(getServiceSupabase(), {
      deviceId,
      displayType,
      route,
      status: body.status,
      wakeLockStatus: body.wakeLockStatus,
      lastDataAt: body.lastDataAt,
      name: body.name
    });

    return NextResponse.json(response, {
      headers: { "cache-control": "no-store, max-age=0" }
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Heartbeat failed." }, { status: 500 });
  }
}
