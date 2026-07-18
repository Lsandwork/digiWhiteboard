import { NextResponse } from "next/server";
import { canDownloadPhotoUploads } from "@/lib/photo-upload-queue/access";
import { prepareExport } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ batchId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  if (!canDownloadPhotoUploads(auth.access, auth.session?.role)) {
    return NextResponse.json(
      { error: "You can upload and view photos, but downloads are limited to Team Leads, Front Desk Coordinators, Admins, Management, and Super Admins." },
      { status: 403 }
    );
  }

  try {
    const { batchId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const itemIds = Array.isArray(body.item_ids)
      ? body.item_ids.map(String)
      : Array.isArray(body.itemIds)
        ? body.itemIds.map(String)
        : undefined;

    const result = await prepareExport(auth.supabase, {
      batchId,
      itemIds,
      actor: auth.actor
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare download.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
