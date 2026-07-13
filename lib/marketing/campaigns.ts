import { writeMarketingActivity } from "@/lib/marketing/audit";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function listMarketingCampaigns(supabase: SupabaseClient, includeArchived = false) {
  let query = supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createMarketingCampaign(
  supabase: SupabaseClient,
  input: {
    name: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    status?: string;
    internalNotes?: string | null;
    checklist?: unknown[];
    memberIds?: string[];
    actor: { id?: string | null; email?: string | null };
  }
) {
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      name: input.name.trim(),
      description: input.description ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      status: input.status ?? "planning",
      internal_notes: input.internalNotes ?? null,
      checklist: input.checklist ?? [],
      created_by_id: input.actor.id ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (input.memberIds?.length) {
    await supabase.from("marketing_campaign_members").insert(
      input.memberIds.map((adminUserId) => ({ campaign_id: data.id, admin_user_id: adminUserId }))
    );
  }

  await writeMarketingActivity(supabase, {
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: "marketing.campaign.created",
    entityType: "marketing_campaign",
    entityId: data.id
  });

  return data;
}

export async function updateMarketingCampaign(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  actor: { id?: string | null; email?: string | null }
) {
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingActivity(supabase, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "marketing.campaign.updated",
    entityType: "marketing_campaign",
    entityId: id,
    metadata: patch
  });

  return data;
}

export async function archiveMarketingCampaign(supabase: SupabaseClient, id: string, actor: { id?: string | null; email?: string | null }) {
  return updateMarketingCampaign(supabase, id, { status: "archived", archived_at: new Date().toISOString() }, actor);
}

export async function getCampaignProgress(supabase: SupabaseClient, campaignId: string) {
  const [{ count: mediaCount }, { data: campaign }] = await Promise.all([
    supabase.from("marketing_campaign_media").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId),
    supabase.from("marketing_campaigns").select("checklist").eq("id", campaignId).maybeSingle()
  ]);
  const checklist = (campaign?.checklist as Array<{ label: string; done?: boolean }> | null) ?? [];
  const required = checklist.length;
  const done = checklist.filter((item) => item.done).length;
  return {
    mediaCount: mediaCount ?? 0,
    checklistDone: done,
    checklistTotal: required,
    progressPercent: required > 0 ? Math.round((done / required) * 100) : 0
  };
}
