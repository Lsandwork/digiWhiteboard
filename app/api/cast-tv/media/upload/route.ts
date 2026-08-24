import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { blockDemoWrite } from "@/lib/admin/api-auth";
import { requireCastTvManager } from "@/lib/cast-tv/api-auth";
import { createCastTvMediaRecord, replaceCastTvMediaFile, uploadCastTvObject } from "@/lib/cast-tv/media";
import { CAST_TV_SERVER_UPLOAD_MAX_BYTES } from "@/lib/cast-tv/mime";
import { normalizeCastTvUploadBytes } from "@/lib/cast-tv/normalize-upload";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;

  const auth = await requireCastTvManager(request);
  if ("error" in auth) return auth.error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
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
    const normalized = await normalizeCastTvUploadBytes(file);
    const supabase = getServiceSupabase({ timeoutMs: 60_000 });

    await uploadCastTvObject(supabase, normalized.storagePath, normalized.buffer, normalized.mimeType);

    const media = replaceId
      ? await replaceCastTvMediaFile(supabase, replaceId, {
          fileName: normalized.fileName,
          mimeType: normalized.mimeType,
          fileSize: normalized.fileSize,
          storagePath: normalized.storagePath
        })
      : await createCastTvMediaRecord(supabase, {
          fileName: normalized.fileName,
          mimeType: normalized.mimeType,
          fileSize: normalized.fileSize,
          storagePath: normalized.storagePath,
          displayName,
          uploadedBy: auth.session?.adminUserId ?? null,
          uploadedByName: auth.session?.email ?? null
        });

    await writeAdminAuditLog({
      actorAdminId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: replaceId ? "cast_tv.media.replaced" : "cast_tv.media.uploaded",
      targetType: "cast_tv_media",
      targetId: media.id,
      details: { file_name: media.file_name, media_type: media.media_type }
    });

    return NextResponse.json({ media });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save CAST-TV media.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
