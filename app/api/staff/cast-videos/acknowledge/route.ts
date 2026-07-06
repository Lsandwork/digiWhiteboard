import { NextResponse } from "next/server";
import { getCastVideoNotice, recordCastVideoViewClose, recordCastVideoViewOpen } from "@/lib/staff/cast-video-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "open");
    const notice_id = String(body.notice_id ?? "");
    const viewer_key = String(body.viewer_key ?? "").trim();

    if (!notice_id || !viewer_key) {
      return NextResponse.json({ error: "notice_id and viewer_key are required." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const notice = await getCastVideoNotice(supabase, notice_id);
    if (!notice || notice.status !== "active") {
      return NextResponse.json({ error: "Cast video is no longer available." }, { status: 404 });
    }

    if (action === "open") {
      const view = await recordCastVideoViewOpen(supabase, {
        notice_id,
        viewer_key,
        viewer_role: body.viewer_role != null ? String(body.viewer_role) : null,
        viewer_location: body.viewer_location != null ? String(body.viewer_location) : null
      });
      return NextResponse.json({ ok: true, view });
    }

    const view = await recordCastVideoViewClose(supabase, {
      notice_id,
      viewer_key,
      watch_duration_ms: Number(body.watch_duration_ms ?? 0),
      acknowledged: Boolean(body.acknowledged),
      skipped: Boolean(body.skipped)
    });
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record cast video view.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
