import { NextResponse } from "next/server";
import { recordCastTvHeartbeat } from "@/lib/cast-tv/media";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const screenId = String(body.screenId ?? body.screen_id ?? "default").trim() || "default";
    const userAgent = request.headers.get("user-agent");

    const heartbeat = await recordCastTvHeartbeat(getServiceSupabase(), {
      screenId,
      userAgent
    });

    return NextResponse.json({ ok: true, heartbeat });
  } catch (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
