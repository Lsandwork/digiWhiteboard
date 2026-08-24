import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { convertStoredCastTvHeicIfNeeded } from "@/lib/cast-tv/convert-heic";
import { createCastTvMediaRecord, publicUrlForCastTvPath } from "@/lib/cast-tv/media";
import { inferCastTvMimeType } from "@/lib/cast-tv/mime";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";
import type { CastTvImageDuration } from "@/lib/cast-tv/types";
import { getCastTvSupabase, CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS } from "@/lib/cast-tv/supabase";

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
    const bucket = body.bucket ? String(body.bucket).trim() : null;
    const displayName = body.displayName ? String(body.displayName).trim() : null;
    const imageDisplaySeconds = body.imageDisplaySeconds
      ? (Number(body.imageDisplaySeconds) as CastTvImageDuration)
      : undefined;

    if (!fileName || !mimeType || !fileSize || !storagePath) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }

    const supabase = getCastTvSupabase(CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS);
    const converted = await convertStoredCastTvHeicIfNeeded(supabase, {
      fileName,
      mimeType,
      fileSize,
      storagePath
    });
    let media;
    try {
      media = await createCastTvMediaRecord(supabase, {
        fileName: converted.fileName,
        mimeType: converted.mimeType,
        fileSize: converted.fileSize,
        storagePath: converted.storagePath,
        bucket,
        displayName,
        imageDisplaySeconds,
        uploadedBy: auth.session?.adminUserId ?? null,
        uploadedByName: auth.session?.email ?? null
      });
    } catch (error) {
      console.error("[cast-tv] library save after upload failed", error);
      const now = new Date().toISOString();
      media = {
        id: converted.storagePath,
        display_name: displayName,
        file_name: converted.fileName,
        storage_path: converted.storagePath,
        bucket,
        public_url: publicUrlForCastTvPath(supabase, converted.storagePath, now, bucket || undefined),
        media_type: converted.mimeType.startsWith("video/") ? "video" : "image",
        mime_type: converted.mimeType,
        file_size_bytes: converted.fileSize,
        duration_seconds: null,
        image_display_seconds: imageDisplaySeconds ?? 10,
        display_order: 0,
        is_enabled: true,
        uploaded_by: auth.session?.adminUserId ?? null,
        uploaded_by_name: auth.session?.email ?? null,
        created_at: now,
        updated_at: now
      };
    }

    void writeAdminAuditLog({
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
