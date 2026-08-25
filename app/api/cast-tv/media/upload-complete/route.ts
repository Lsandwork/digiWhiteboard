import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { CAST_TV_DUPLICATE_MESSAGE, isCastTvDuplicateError } from "@/lib/cast-tv/display-image";
import { createCastTvMediaRecord } from "@/lib/cast-tv/media";
import { inferCastTvMimeType } from "@/lib/cast-tv/mime";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";
import { normalizeStoredCastTvImage } from "@/lib/cast-tv/stored-image";
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
    let converted;
    try {
      converted = await normalizeStoredCastTvImage(supabase, {
        fileName,
        mimeType,
        fileSize,
        storagePath,
        bucket
      });
    } catch (error) {
      try {
        if (bucket) await supabase.storage.from(bucket).remove([storagePath]);
      } catch {
        /* ignore cleanup */
      }
      throw error;
    }

    try {
      const media = await createCastTvMediaRecord(supabase, {
        fileName: converted.fileName,
        mimeType: converted.mimeType,
        fileSize: converted.fileSize,
        storagePath: converted.storagePath,
        bucket: converted.bucket ?? bucket,
        displayName,
        imageDisplaySeconds,
        uploadedBy: auth.session?.adminUserId ?? null,
        uploadedByName: auth.session?.email ?? null,
        contentHash: converted.contentHash,
        pixelHash: converted.pixelHash,
        originalHash: converted.originalHash,
        displayReady: converted.displayReady
      });

      void writeAdminAuditLog({
        actorAdminId: auth.session?.adminUserId,
        actorEmail: auth.session?.email,
        action: "cast_tv.media.uploaded",
        targetType: "cast_tv_media",
        targetId: media.id,
        details: { file_name: media.file_name, media_type: media.media_type }
      });

      return NextResponse.json({ media });
    } catch (error) {
      if (isCastTvDuplicateError(error)) {
        try {
          if (converted.bucket) {
            await supabase.storage.from(converted.bucket).remove([converted.storagePath]);
          }
        } catch {
          /* duplicate file stays out of the playlist */
        }
        return NextResponse.json({ error: CAST_TV_DUPLICATE_MESSAGE }, { status: 409 });
      }
      throw error;
    }
  }, "Unable to save CAST-TV media.");
}
