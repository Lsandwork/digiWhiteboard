import { NextResponse } from "next/server";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import { getOrCreateTodayLibraryBatch } from "@/lib/photo-upload-queue/service";
import { createMediaVideoSignedUpload } from "@/lib/media-library/video-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const body = (await request.json()) as {
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      batchId?: string;
      kind?: "video" | "poster";
    };

    const fileName = body.fileName?.trim();
    const mimeType = body.mimeType?.trim();
    const fileSize = Number(body.fileSize ?? 0);
    const kind = body.kind === "poster" ? "poster" : "video";

    if (!fileName || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Valid file metadata is required." }, { status: 400 });
    }

    let batchId = body.batchId?.trim();
    if (!batchId) {
      const batch = await getOrCreateTodayLibraryBatch(auth.supabase, auth.actor);
      batchId = batch.id;
    }

    const upload = await createMediaVideoSignedUpload({
      batchId,
      fileName,
      mimeType,
      fileSize,
      kind
    });

    return NextResponse.json({ ...upload, batch_id: batchId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare media upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
