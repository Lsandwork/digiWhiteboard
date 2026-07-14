import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { moveCastTvMedia, reorderCastTvMedia } from "@/lib/cast-tv/media";
import { requireCastTvManager } from "@/lib/cast-tv/api-auth";
import { blockDemoWrite } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;

  const auth = await requireCastTvManager(request);
  if ("error" in auth) return auth.error;

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reorder CAST-TV media.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
