import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  deleteCastTvMediaRecord,
  replaceCastTvMediaFile,
  updateCastTvMediaRecord
} from "@/lib/cast-tv/media";
import { inferCastTvMimeType } from "@/lib/cast-tv/mime";
import { handleCastTvWrite } from "@/lib/cast-tv/route-handler";
import { normalizeStoredCastTvImage } from "@/lib/cast-tv/stored-image";
import type { CastTvImageDuration } from "@/lib/cast-tv/types";
import { getCastTvSupabase, CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS } from "@/lib/cast-tv/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return handleCastTvWrite(request, async (auth) => {
    const { id } = await context.params;
    const body = await request.json();

    if (body.action === "replace") {
      const fileName = String(body.fileName ?? "").trim();
      const mimeType = inferCastTvMimeType(fileName, String(body.mimeType ?? "").trim());
      const fileSize = Number(body.fileSize ?? 0);
      const storagePath = String(body.storagePath ?? "").trim();

      if (!fileName || !mimeType || !fileSize || !storagePath) {
        return NextResponse.json({ error: "Replace metadata is incomplete." }, { status: 400 });
      }

      const supabase = getCastTvSupabase(CAST_TV_SUPABASE_UPLOAD_TIMEOUT_MS);
      const converted = await normalizeStoredCastTvImage(supabase, {
        fileName,
        mimeType,
        fileSize,
        storagePath
      });
      const media = await replaceCastTvMediaFile(supabase, id, converted);

      void writeAdminAuditLog({
        actorAdminId: auth.session?.adminUserId,
        actorEmail: auth.session?.email,
        action: "cast_tv.media.replaced",
        targetType: "cast_tv_media",
        targetId: media.id,
        details: { file_name: media.file_name }
      });

      return NextResponse.json({ media });
    }

    const patch: Partial<{
      display_name: string | null;
      is_enabled: boolean;
      image_display_seconds: CastTvImageDuration;
    }> = {};

    if (body.display_name !== undefined) {
      patch.display_name = body.display_name ? String(body.display_name).trim() : null;
    }
    if (body.is_enabled !== undefined) {
      patch.is_enabled = Boolean(body.is_enabled);
    }
    if (body.image_display_seconds !== undefined) {
      patch.image_display_seconds = Number(body.image_display_seconds) as CastTvImageDuration;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    const media = await updateCastTvMediaRecord(auth.supabase, id, patch);

    if (patch.is_enabled !== undefined) {
      void writeAdminAuditLog({
        actorAdminId: auth.session?.adminUserId,
        actorEmail: auth.session?.email,
        action: patch.is_enabled ? "cast_tv.media.enabled" : "cast_tv.media.disabled",
        targetType: "cast_tv_media",
        targetId: media.id,
        details: { display_name: media.display_name }
      });
    } else if (patch.image_display_seconds !== undefined) {
      void writeAdminAuditLog({
        actorAdminId: auth.session?.adminUserId,
        actorEmail: auth.session?.email,
        action: "cast_tv.media.duration_changed",
        targetType: "cast_tv_media",
        targetId: media.id,
        details: { image_display_seconds: media.image_display_seconds }
      });
    } else {
      void writeAdminAuditLog({
        actorAdminId: auth.session?.adminUserId,
        actorEmail: auth.session?.email,
        action: "cast_tv.media.updated",
        targetType: "cast_tv_media",
        targetId: media.id,
        details: patch
      });
    }

    return NextResponse.json({ media });
  }, "Unable to update CAST-TV media.");
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleCastTvWrite(request, async (auth) => {
    const { id } = await context.params;
    const media = await deleteCastTvMediaRecord(auth.supabase, id);

    void writeAdminAuditLog({
      actorAdminId: auth.session?.adminUserId,
      actorEmail: auth.session?.email,
      action: "cast_tv.media.deleted",
      targetType: "cast_tv_media",
      targetId: media.id,
      details: { file_name: media.file_name }
    });

    return NextResponse.json({ ok: true });
  }, "Unable to delete CAST-TV media.");
}
