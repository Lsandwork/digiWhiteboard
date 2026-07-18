import { NextResponse } from "next/server";
import { bulkUpdateItems, setPhotoDogs, updatePhotoItem } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const itemIds = Array.isArray(body.item_ids)
      ? body.item_ids.map(String)
      : Array.isArray(body.itemIds)
        ? body.itemIds.map(String)
        : [];

    if (!itemIds.length) {
      return NextResponse.json({ error: "item_ids is required." }, { status: 400 });
    }

    const action = String(body.action ?? "update");

    if (action === "set_dogs" || body.dogs) {
      const dogs = Array.isArray(body.dogs) ? body.dogs : [];
      const results = [];
      for (const id of itemIds) {
        try {
          const result = await setPhotoDogs(
            auth.supabase,
            id,
            dogs as Array<{
              gingr_pet_id?: string | null;
              dog_name: string;
              owner_name?: string | null;
              dog_photo_url?: string | null;
              reservation_type?: string | null;
              assignment_source?: "checked_in" | "manual" | "bulk";
            }>,
            auth.actor
          );
          results.push({ id, ok: true, ...result });
        } catch (error) {
          results.push({
            id,
            ok: false,
            error: error instanceof Error ? error.message : "Unable to set dogs."
          });
        }
      }
      return NextResponse.json({ results });
    }

    if (action === "exclude" || body.exclude === true) {
      const results = await bulkUpdateItems(
        auth.supabase,
        itemIds,
        {
          exclude: true,
          excluded_reason:
            body.excluded_reason != null ? String(body.excluded_reason) : "Excluded by staff"
        },
        auth.actor
      );
      return NextResponse.json(results);
    }

    const patch = {
      yard: body.yard !== undefined ? (body.yard as string | null) : undefined,
      category: body.category !== undefined ? (body.category as string | null) : undefined,
      photographer_name:
        body.photographer_name !== undefined ? (body.photographer_name as string | null) : undefined,
      duplicate_override:
        body.duplicate_override !== undefined ? Boolean(body.duplicate_override) : undefined,
      exclude: body.exclude === false ? false : undefined
    };

    // Prefer bulk helper; for single-item field updates still fine.
    if (itemIds.length === 1 && action === "update") {
      const item = await updatePhotoItem(auth.supabase, itemIds[0]!, patch, auth.actor);
      return NextResponse.json({ item, results: [{ id: item.id, ok: true }] });
    }

    const results = await bulkUpdateItems(auth.supabase, itemIds, patch, auth.actor);
    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update items.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
