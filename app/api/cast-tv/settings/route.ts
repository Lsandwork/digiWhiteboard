import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { updateCastTvSettings, isCastTvOnline, loadCastTvHeartbeat, loadCastTvSettings } from "@/lib/cast-tv/media";
import { resolveCastTvManager } from "@/lib/cast-tv/api-auth";
import { castTvErrorMessage } from "@/lib/cast-tv/errors";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";
import { getCastTvSupabase } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const supabase = getCastTvSupabase();
    const settings = await loadCastTvSettings(supabase);

    const url = new URL(request.url);
    const includeHeartbeat = url.searchParams.get("heartbeat") === "1";
    if (!includeHeartbeat) {
      return NextResponse.json({ settings });
    }

    const manager = await resolveCastTvManager(request);
    if (!manager) {
      return NextResponse.json({ settings });
    }

    const screenId = url.searchParams.get("screen")?.trim() || "default";
    const heartbeat = await loadCastTvHeartbeat(supabase, screenId);

    return NextResponse.json({
      settings,
      heartbeat: heartbeat
        ? {
            screen_id: heartbeat.screen_id,
            last_seen_at: heartbeat.last_seen_at,
            online: isCastTvOnline(heartbeat.last_seen_at)
          }
        : { screen_id: screenId, last_seen_at: null, online: false }
    });
  } catch (error) {
    const message = castTvErrorMessage(error, "Unable to load CAST-TV settings.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return handleCastTvWrite(request, async (auth) => {
    const body = await request.json();

    const settings = await updateCastTvSettings(auth.supabase, {
      default_image_seconds: body.default_image_seconds,
      transition_ms: body.transition_ms,
      transition_style: body.transition_style,
      object_fit: body.object_fit,
      show_standby_logo: body.show_standby_logo,
      is_paused: body.is_paused,
      updated_by: auth.session?.adminUserId ?? null
    });

    await writeAdminAuditLog({
      actorAdminId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: "cast_tv.settings.changed",
      targetType: "cast_tv_settings",
      targetId: settings.id,
      details: body
    });

    return NextResponse.json({ settings });
  }, "Unable to update CAST-TV settings.");
}
