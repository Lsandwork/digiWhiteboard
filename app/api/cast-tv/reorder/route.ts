import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { moveCastTvMedia, reorderCastTvMedia } from "@/lib/cast-tv/media";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCastTvWrite(request, async (auth) => {
    const body = await request.json();
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.map((id: unknown) => String(id))
      : null;
    const moveId = body.id ? String(body.id) : null;
    const direction = body.direction === "up" || body.direction === "down" ? body.direction : null;

    let media;
    if (orderedIds?.length) {
      media = await reorderCastTvMedia(auth.supabase, orderedIds);
    } else if (moveId && direction) {
      media = await moveCastTvMedia(auth.supabase, moveId, direction);
    } else {
      return NextResponse.json({ error: "orderedIds or id+direction is required." }, { status: 400 });
    }

    await writeAdminAuditLog({
      actorAdminId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: "cast_tv.playlist.reordered",
      targetType: "cast_tv_media",
      details: { count: media.length }
    });

    return NextResponse.json({ media });
  }, "Unable to reorder CAST-TV media.");
}
