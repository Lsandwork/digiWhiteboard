import { NextResponse } from "next/server";
import { reopenBatch } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess,
  requireReopenAccess
} from "@/lib/photo-upload-queue/api-guard";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  const reopenDenied = requireReopenAccess(auth.access, auth.session?.role);
  if (reopenDenied) return reopenDenied;

  try {
    const { batchId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = String(body.reason ?? body.reopen_reason ?? "").trim();
    const detail = await reopenBatch(auth.supabase, batchId, reason, auth.actor);
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reopen batch.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
