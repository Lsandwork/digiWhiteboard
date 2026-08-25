import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { asCastTvFormFile } from "@/lib/cast-tv/form-file";
import { createCastTvMediaRecord, replaceCastTvMediaFile, uploadCastTvObject } from "@/lib/cast-tv/media";
import { CAST_TV_SERVER_UPLOAD_MAX_BYTES } from "@/lib/cast-tv/mime";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";
import { getCastTvSupabase, CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleCastTvWrite(request, async (auth) => {
    const form = await request.formData();
    const file = asCastTvFormFile(form.get("file"));
    if (!file) {
      return NextResponse.json({ error: "Choose a photo or video to upload." }, { status: 400 });
    }
    if (file.size > CAST_TV_SERVER_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: "This file is too large for direct upload. Try a smaller photo, or a JPG under 3.5MB." },
        { status: 413 }
      );
    }

    const displayName = form.get("displayName") ? String(form.get("displayName")).trim() : null;
    const replaceId = form.get("replaceId") ? String(form.get("replaceId")).trim() : "";
    const { normalizeCastTvUploadBytes } = await import("@/lib/cast-tv/normalize-upload");
    const normalized = await normalizeCastTvUploadBytes(file);
    const supabase = getCastTvSupabase(CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS);

    await uploadCastTvObject(supabase, normalized.storagePath, normalized.buffer, normalized.mimeType);

    const hashes = {
      contentHash: normalized.contentHash,
      pixelHash: normalized.pixelHash,
      originalHash: normalized.originalHash,
      displayReady: normalized.displayReady
    };

    const media = replaceId
      ? await replaceCastTvMediaFile(supabase, replaceId, {
          fileName: normalized.fileName,
          mimeType: normalized.mimeType,
          fileSize: normalized.fileSize,
          storagePath: normalized.storagePath,
          ...hashes
        })
      : await createCastTvMediaRecord(supabase, {
          fileName: normalized.fileName,
          mimeType: normalized.mimeType,
          fileSize: normalized.fileSize,
          storagePath: normalized.storagePath,
          displayName,
          uploadedBy: auth.session?.adminUserId ?? null,
          uploadedByName: auth.session?.email ?? null,
          ...hashes
        });

    void writeAdminAuditLog({
      actorAdminId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: replaceId ? "cast_tv.media.replaced" : "cast_tv.media.uploaded",
      targetType: "cast_tv_media",
      targetId: media.id,
      details: { file_name: media.file_name, media_type: media.media_type }
    });

    return NextResponse.json({ media });
  }, "Unable to save CAST-TV media.");
}
