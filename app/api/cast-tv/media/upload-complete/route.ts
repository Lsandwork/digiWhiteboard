import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { convertStoredCastTvHeicIfNeeded } from "@/lib/cast-tv/convert-heic";
import { createCastTvMediaRecord } from "@/lib/cast-tv/media";
import { inferCastTvMimeType } from "@/lib/cast-tv/mime";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";
import type { CastTvImageDuration } from "@/lib/cast-tv/types";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleCastTvWrite(request, async (auth) => {
    const body = await request.json();
    const fileName = String(body.fileName ?? "").trim();
    const mimeType = inferCastTvMimeType(fileName, String(body.mimeType ?? "").trim());
    const fileSize = Number(body.fileSize ?? 0);
    const storagePath = String(body.storagePath ?? "").trim();
    const displayName = body.displayName ? String(body.displayName).trim() : null;
    const imageDisplaySeconds = body.imageDisplaySeconds
      ? (Number(body.imageDisplaySeconds) as CastTvImageDuration)
      : undefined;

    if (!fileName || !mimeType || !fileSize || !storagePath) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }

    const supabase = getServiceSupabase({ timeoutMs: 60_000 });
    const converted = await convertStoredCastTvHeicIfNeeded(supabase, {
      fileName,
      mimeType,
      fileSize,
      storagePath
    });
    const media = await createCastTvMediaRecord(supabase, {
      fileName: converted.fileName,
      mimeType: converted.mimeType,
      fileSize: converted.fileSize,
      storagePath: converted.storagePath,
      displayName,
      imageDisplaySeconds,
      uploadedBy: auth.session?.adminUserId ?? null,
      uploadedByName: auth.session?.email ?? null
    });

    await writeAdminAuditLog({
      actorAdminId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: "cast_tv.media.uploaded",
      targetType: "cast_tv_media",
      targetId: media.id,
      details: { file_name: media.file_name, media_type: media.media_type }
    });

    return NextResponse.json({ media });
  }, "Unable to save CAST-TV media.");
}
