import { NextResponse } from "next/server";
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
    const message = error instanceof Error ? error.message : "Unable to prepare export.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
