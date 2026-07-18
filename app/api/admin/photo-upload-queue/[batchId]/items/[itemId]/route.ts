import { NextResponse } from "next/server";
import { setPhotoDogs, updatePhotoItem } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import type { PhotoItemStatus } from "@/lib/photo-upload-queue/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string; itemId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { itemId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    if (Array.isArray(body.dogs) || body.action === "set_dogs") {
      const result = await setPhotoDogs(
        auth.supabase,
        itemId,
        (Array.isArray(body.dogs) ? body.dogs : []) as Array<{
          gingr_pet_id?: string | null;
          dog_name: string;
          owner_name?: string | null;
          dog_photo_url?: string | null;
          reservation_type?: string | null;
          assignment_source?: "checked_in" | "manual" | "bulk";
        }>,
        auth.actor
      );
      return NextResponse.json(result);
    }

    const item = await updatePhotoItem(
      auth.supabase,
      itemId,
      {
        yard: body.yard !== undefined ? (body.yard as string | null) : undefined,
        category: body.category !== undefined ? (body.category as string | null) : undefined,
        internal_note:
          body.internal_note !== undefined ? (body.internal_note as string | null) : undefined,
        photographer_name:
          body.photographer_name !== undefined
            ? (body.photographer_name as string | null)
            : undefined,
        status: body.status != null ? (String(body.status) as PhotoItemStatus) : undefined,
        exclude: body.exclude === true ? true : body.exclude === false ? false : undefined,
        excluded_reason:
          body.excluded_reason !== undefined ? (body.excluded_reason as string | null) : undefined,
        duplicate_override:
          body.duplicate_override !== undefined ? Boolean(body.duplicate_override) : undefined
      },
      auth.actor
    );
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update photo item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { itemId } = await context.params;
    let reason = "Excluded by staff";
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (body.excluded_reason != null) reason = String(body.excluded_reason);
      else if (body.reason != null) reason = String(body.reason);
    } catch {
      // no body
    }

    const item = await updatePhotoItem(
      auth.supabase,
      itemId,
      { exclude: true, excluded_reason: reason },
      auth.actor
    );
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to exclude photo item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
