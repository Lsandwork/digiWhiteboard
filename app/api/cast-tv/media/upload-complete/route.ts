import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { createCastTvMediaRecord } from "@/lib/cast-tv/media";
import { requireCastTvManager } from "@/lib/cast-tv/api-auth";
import { blockDemoWrite } from "@/lib/admin/api-auth";
import type { CastTvImageDuration } from "@/lib/cast-tv/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const demoBlock = blockDemoWrite(request);
  if (demoBlock) return demoBlock;

  const auth = await requireCastTvManager(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const fileName = String(body.fileName ?? "").trim();
    const mimeType = String(body.mimeType ?? "").trim();
    const fileSize = Number(body.fileSize ?? 0);
    const storagePath = String(body.storagePath ?? "").trim();
    const displayName = body.displayName ? String(body.displayName).trim() : null;
    const imageDisplaySeconds = body.imageDisplaySeconds
      ? (Number(body.imageDisplaySeconds) as CastTvImageDuration)
      : undefined;

    if (!fileName || !mimeType || !fileSize || !storagePath) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }

    const media = await createCastTvMediaRecord(auth.supabase, {
      fileName,
      mimeType,
      fileSize,
      storagePath,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save CAST-TV media.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
