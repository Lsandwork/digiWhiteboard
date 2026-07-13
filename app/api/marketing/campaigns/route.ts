import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import {
  archiveMarketingCampaign,
  createMarketingCampaign,
  getCampaignProgress,
  listMarketingCampaigns,
  updateMarketingCampaign
} from "@/lib/marketing/campaigns";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const { data, error } = await gate.actor!.supabase.from("marketing_campaigns").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      const progress = await getCampaignProgress(gate.actor!.supabase, id);
      return marketingJson({ campaign: data, progress });
    }
    const campaigns = await listMarketingCampaigns(gate.actor!.supabase);
    return marketingJson({ campaigns });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to load campaigns." }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const actor = { id: gate.actor!.session.adminUserId ?? null, email: gate.actor!.session.email };
  try {
    const campaign = await createMarketingCampaign(gate.actor!.supabase, {
      name: String(body.name ?? ""),
      description: String(body.description ?? "") || null,
      startDate: String(body.startDate ?? "") || null,
      endDate: String(body.endDate ?? "") || null,
      status: String(body.status ?? "planning"),
      internalNotes: String(body.internalNotes ?? "") || null,
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
      actor
    });
    return marketingJson({ campaign });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to create campaign." }, 500);
  }
}

export async function PATCH(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const id = String(body.id ?? "");
  if (!id) return marketingJson({ error: "id is required." }, 400);
  const actor = { id: gate.actor!.session.adminUserId ?? null, email: gate.actor!.session.email };
  try {
    if (body.action === "archive") {
      const campaign = await archiveMarketingCampaign(gate.actor!.supabase, id, actor);
      return marketingJson({ campaign });
    }
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "description", "start_date", "end_date", "status", "internal_notes", "checklist"]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const campaign = await updateMarketingCampaign(gate.actor!.supabase, id, patch, actor);
    return marketingJson({ campaign });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to update campaign." }, 500);
  }
}
