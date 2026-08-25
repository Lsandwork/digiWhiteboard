import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { deleteCastTvMediaRecords } from "@/lib/cast-tv/media";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleCastTvWrite(request, async (auth) => {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray((body as { ids?: unknown }).ids)
      ? [...new Set((body as { ids: unknown[] }).ids.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (ids.length > 100) {
      return NextResponse.json({ error: "Select up to 100 CAST-TV items to delete at once." }, { status: 400 });
    }
    const removed = await deleteCastTvMediaRecords(auth.supabase, ids);

    void writeAdminAuditLog({
      actorAdminId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: "cast_tv.media.bulk_deleted",
      targetType: "cast_tv_media",
      details: { count: removed.length, ids: removed.map((item) => item.id) }
    });

    return NextResponse.json({ ok: true, deleted: removed.length });
  }, "Unable to delete CAST-TV media.");
}
