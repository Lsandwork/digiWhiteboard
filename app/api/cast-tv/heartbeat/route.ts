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
    const screenId = String(body.screenId ?? body.screen_id ?? "default")
      .trim()
      .slice(0, 64) || "default";
    if (!/^[a-zA-Z0-9._:-]+$/.test(screenId)) {
      return NextResponse.json({ ok: false, error: "Invalid screen id." }, { status: 400 });
    }
    const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

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
