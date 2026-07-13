import { createMarketingSignedDownload, deleteMarketingStorageObject } from "@/lib/marketing/storage-provider";
import { writeMarketingActivity } from "@/lib/marketing/audit";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function listMarketingMediaItems(
  supabase: SupabaseClient,
  filters: {
    dog?: string;
    campaignId?: string;
    approvalState?: string;
    fileType?: string;
    tag?: string;
    archived?: boolean;
    unmatched?: boolean;
    used?: boolean;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  let query = supabase
    .from("marketing_media_items")
    .select("*, marketing_media_item_dogs(dog_gingr_id, dog_name), marketing_media_item_tags(marketing_tags(name))", {
      count: "exact"
    })
    .order("created_at", { ascending: false });

  if (filters.archived === true) query = query.eq("is_archived", true);
  else if (filters.archived === false) query = query.eq("is_archived", false);
  if (filters.approvalState) query = query.eq("approval_state", filters.approvalState);
  if (filters.used === true) query = query.eq("is_used", true);
  if (filters.used === false) query = query.eq("is_used", false);
  if (filters.fileType === "image") query = query.like("mime_type", "image/%");
  if (filters.fileType === "video") query = query.like("mime_type", "video/%");
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

  const limit = filters.limit ?? 24;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let items = data ?? [];
  if (filters.dog) {
    const needle = filters.dog.toLowerCase();
    items = items.filter((item) =>
      (item.marketing_media_item_dogs as Array<{ dog_name?: string }> | null)?.some((d) =>
        d.dog_name?.toLowerCase().includes(needle)
      )
    );
  }
  if (filters.unmatched) {
    items = items.filter((item) => !(item.marketing_media_item_dogs as unknown[] | null)?.length);
  }

  return { items, total: count ?? items.length };
}

export async function updateMarketingMediaItem(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  actor: { id?: string | null; email?: string | null }
) {
  const { data, error } = await supabase
    .from("marketing_media_items")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingActivity(supabase, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "marketing.media.updated",
    entityType: "marketing_media_item",
    entityId: id,
    metadata: patch
  });

  return data;
}

export async function deleteMarketingMediaItem(
  supabase: SupabaseClient,
  id: string,
  actor: { id?: string | null; email?: string | null }
) {
  const { data: item } = await supabase.from("marketing_media_items").select("*").eq("id", id).maybeSingle();
  if (!item) throw new Error("Media item not found.");
  if (item.storage_path) await deleteMarketingStorageObject(supabase, item.storage_path).catch(() => undefined);
  if (item.thumbnail_path) await deleteMarketingStorageObject(supabase, item.thumbnail_path).catch(() => undefined);
  const { error } = await supabase.from("marketing_media_items").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeMarketingActivity(supabase, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "marketing.media.deleted",
    entityType: "marketing_media_item",
    entityId: id
  });
}

export async function getMarketingMediaDownloadUrl(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("marketing_media_items").select("storage_path").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.storage_path) throw new Error("Media item not found.");
  return createMarketingSignedDownload(supabase, data.storage_path);
}

export async function assignDogsToMediaItem(
  supabase: SupabaseClient,
  mediaItemId: string,
  dogs: Array<{ gingrId?: string | null; name: string }>
) {
  await supabase.from("marketing_media_item_dogs").delete().eq("media_item_id", mediaItemId);
  if (!dogs.length) return;
  const { error } = await supabase.from("marketing_media_item_dogs").insert(
    dogs.map((dog) => ({
      media_item_id: mediaItemId,
      dog_gingr_id: dog.gingrId ?? null,
      dog_name: dog.name
    }))
  );
  if (error) throw new Error(error.message);
}
