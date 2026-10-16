import { NextResponse } from "next/server";
import { parseDisplayType, type HeartbeatRequest } from "@/lib/display-keeper";
import { buildHeartbeatResponse } from "@/lib/display-keeper-server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<HeartbeatRequest>;
    const deviceId = body.deviceId?.trim().slice(0, 128);
    const displayType = parseDisplayType(body.displayType);
    const route = body.route?.trim().slice(0, 256);

    if (!deviceId || !displayType || !route || !/^[a-zA-Z0-9._:-]+$/.test(deviceId)) {
      return NextResponse.json({ ok: false, error: "Invalid heartbeat payload." }, { status: 400 });
    }

    const response = await buildHeartbeatResponse(getServiceSupabase(), {
      deviceId,
      displayType,
      route,
      status: body.status,
      wakeLockStatus: body.wakeLockStatus,
      lastDataAt: body.lastDataAt,
      name: body.name != null ? String(body.name).slice(0, 128) : undefined
    });

    return NextResponse.json(response, {
      headers: { "cache-control": "no-store, max-age=0" }
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Heartbeat failed." }, { status: 500 });
  }
}
