import { NextResponse } from "next/server";
import { recordCastTvHeartbeat } from "@/lib/cast-tv/media";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const screenId = String(body.screenId ?? body.screen_id ?? "default").trim() || "default";
    const userAgent = request.headers.get("user-agent");

    const heartbeat = await recordCastTvHeartbeat(getCastTvSupabase(), {
      screenId,
      userAgent
    });

    return NextResponse.json({ ok: true, heartbeat });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: castTvErrorMessage(error, "Unable to record CAST-TV heartbeat.") },
      { status: 500 }
    );
  }
}
