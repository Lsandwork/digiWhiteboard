import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import {
  assignDogsToMediaItem,
  deleteMarketingMediaItem,
  getMarketingMediaDownloadUrl,
  listMarketingMediaItems,
  updateMarketingMediaItem
} from "@/lib/marketing/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const url = new URL(request.url);
  try {
    const result = await listMarketingMediaItems(gate.actor!.supabase, {
      dog: url.searchParams.get("dog") ?? undefined,
      approvalState: url.searchParams.get("approvalState") ?? undefined,
      fileType: url.searchParams.get("fileType") ?? undefined,
      archived: url.searchParams.get("archived") === "1" ? true : url.searchParams.get("archived") === "0" ? false : undefined,
      unmatched: url.searchParams.get("unmatched") === "1",
      used: url.searchParams.get("used") === "1" ? true : url.searchParams.get("used") === "0" ? false : undefined,
      limit: Number(url.searchParams.get("limit") ?? 24),
      offset: Number(url.searchParams.get("offset") ?? 0)
    });
    return marketingJson(result);
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to load media." }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const action = String(body.action ?? "update");
  const actor = { id: gate.actor!.session.adminUserId ?? null, email: gate.actor!.session.email };

  try {
    if (action === "download" && id) {
      const url = await getMarketingMediaDownloadUrl(gate.actor!.supabase, id);
      return marketingJson({ url });
    }
    if (action === "delete" && id) {
      await deleteMarketingMediaItem(gate.actor!.supabase, id, actor);
      return marketingJson({ ok: true });
    }
    if (action === "assign_dogs" && id) {
      await assignDogsToMediaItem(
        gate.actor!.supabase,
        id,
        Array.isArray(body.dogs) ? (body.dogs as Array<{ gingrId?: string; name: string }>) : []
      );
      return marketingJson({ ok: true });
    }
    if (id) {
      const patch: Record<string, unknown> = {};
      for (const key of ["display_title", "approval_state", "is_favorite", "is_used", "is_archived", "activity", "photographer", "photo_date"]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (patch.is_archived === true) patch.archived_at = new Date().toISOString();
      const item = await updateMarketingMediaItem(gate.actor!.supabase, id, patch, actor);
      return marketingJson({ item });
    }
    return marketingJson({ error: "id is required." }, 400);
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Storage action failed." }, 500);
  }
}
