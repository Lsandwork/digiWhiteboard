import { NextResponse } from "next/server";
import { markUploadedToGingr } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { batchId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const confirm = body.confirm === true || body.confirmed === true;
    const itemIds = Array.isArray(body.item_ids)
      ? body.item_ids.map(String)
      : Array.isArray(body.itemIds)
        ? body.itemIds.map(String)
        : undefined;

    const detail = await markUploadedToGingr(auth.supabase, {
      batchId,
      exportId: body.export_id != null ? String(body.export_id) : body.exportId != null ? String(body.exportId) : null,
      itemIds,
      actor: auth.actor,
      confirm
    });

    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to mark as uploaded.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
