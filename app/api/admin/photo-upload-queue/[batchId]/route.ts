import { NextResponse } from "next/server";
import { canDownloadPhotoUploads } from "@/lib/photo-upload-queue/access";
import { getBatchDetail, updateBatchFields } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { batchId } = await context.params;
    const canDownload = canDownloadPhotoUploads(auth.access, auth.session?.role);
    const detail = await getBatchDetail(auth.supabase, batchId, {
      includeOriginalUrls: canDownload
    });
    return NextResponse.json({
      ...detail,
      permissions: { can_download: canDownload, can_upload: true, can_view: true }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load batch.";
    const status = message === "Batch not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { batchId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const batch = await updateBatchFields(
      auth.supabase,
      batchId,
      {
        batch_name: body.batch_name != null ? String(body.batch_name) : undefined,
        service_date: body.service_date != null ? String(body.service_date) : undefined,
        photographer_name:
          body.photographer_name != null ? String(body.photographer_name) : undefined,
        default_yard: body.default_yard != null ? String(body.default_yard) : undefined,
        default_category:
          body.default_category != null ? String(body.default_category) : undefined,
        internal_note:
          body.internal_note === null
            ? null
            : body.internal_note != null
              ? String(body.internal_note)
              : undefined
      },
      auth.actor
    );
    return NextResponse.json({ batch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update batch.";
    const status = message.includes("locked") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
