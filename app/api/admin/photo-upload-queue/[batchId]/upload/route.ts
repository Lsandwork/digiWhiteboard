import { NextResponse } from "next/server";
import { processUploadedPhoto, storeProcessedPhoto } from "@/lib/photo-upload-queue/process";
import { addPhotoItem } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import { PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo-upload-queue/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ batchId: string }> };

const MAX_FILES = 40;

export async function POST(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { batchId } = await context.params;
    const form = await request.formData();
    const files = form
      .getAll("files")
      .concat(form.getAll("file"))
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!files.length) {
      return NextResponse.json({ error: "Select at least one photo." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Limit is ${MAX_FILES} photos per upload request.` },
        { status: 400 }
      );
    }

    const yard = form.get("yard") != null ? String(form.get("yard")) : null;
    const category = form.get("category") != null ? String(form.get("category")) : null;
    const photographer =
      form.get("photographer_name") != null ? String(form.get("photographer_name")) : null;

    const results: Array<{
      fileName: string;
      ok: boolean;
      item?: unknown;
      duplicate?: unknown;
      error?: string;
    }> = [];

    for (const file of files) {
      try {
        if (file.size > PHOTO_UPLOAD_MAX_BYTES) {
          throw new Error("Each photo must be 25MB or smaller.");
        }
        const processed = await processUploadedPhoto(file);
        const stored = await storeProcessedPhoto({
          supabase: auth.supabase,
          batchId,
          fileName: file.name,
          processed
        });
        const { item, duplicate } = await addPhotoItem(
          auth.supabase,
          {
            batchId,
            original_filename: file.name,
            ...stored,
            yard,
            category,
            photographer_name: photographer
          },
          auth.actor
        );
        results.push({ fileName: file.name, ok: true, item, duplicate });
      } catch (error) {
        results.push({
          fileName: file.name,
          ok: false,
          error: error instanceof Error ? error.message : "Upload failed."
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: okCount > 0,
      results,
      uploaded: okCount,
      failed: results.length - okCount
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload photos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
