import { NextResponse } from "next/server";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import { addPhotoItem } from "@/lib/photo-upload-queue/service";
import {
  assertStorageObjectExists,
  buildVideoStoredFilename,
  resolveMediaSha256
} from "@/lib/media-library/video-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const body = (await request.json()) as {
      batchId?: string;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      storagePath?: string;
      posterStoragePath?: string | null;
      durationSeconds?: number | null;
      clientSha256?: string | null;
    };

    const batchId = body.batchId?.trim();
    const fileName = body.fileName?.trim();
    const mimeType = body.mimeType?.trim();
    const storagePath = body.storagePath?.trim();
    const posterStoragePath = body.posterStoragePath?.trim() || null;
    const durationSeconds =
      body.durationSeconds == null ? null : Number(body.durationSeconds);

    if (!batchId || !fileName || !mimeType || !storagePath) {
      return NextResponse.json({ error: "Upload metadata is incomplete." }, { status: 400 });
    }

    const storedSize = await assertStorageObjectExists(auth.supabase, storagePath);
    const fileSize =
      Number.isFinite(body.fileSize) && Number(body.fileSize) > 0 ? Number(body.fileSize) : storedSize;
    const sha256 = resolveMediaSha256({
      clientSha256: body.clientSha256,
      storagePath,
      fileSize,
      fileName
    });

    const { item, duplicate } = await addPhotoItem(
      auth.supabase,
      {
        batchId,
        original_filename: fileName,
        stored_filename: buildVideoStoredFilename(fileName),
        original_storage_path: storagePath,
        thumbnail_storage_path: posterStoragePath,
        gingr_ready_storage_path: null,
        mime_type: mimeType,
        file_size: fileSize,
        width: null,
        height: null,
        sha256_hash: sha256,
        media_kind: "video",
        duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null
      },
      auth.actor
    );

    return NextResponse.json({
      ok: true,
      item,
      duplicate: duplicate ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finalize media upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
