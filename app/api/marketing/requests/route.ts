import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import {
  createMarketingMediaRequest,
  listMarketingMediaRequests,
  resendMarketingRequestNotice,
  transitionMarketingRequest
} from "@/lib/marketing/media-requests";
import type { MarketingDestination, MarketingRequestPriority, MarketingRequestType } from "@/lib/marketing/constants";
import { loadAdminSettings } from "@/lib/admin/settings";
import { loadActiveDogsForGroomingPush } from "@/lib/grooming-push-active-dogs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const url = new URL(request.url);
  try {
    const result = await listMarketingMediaRequests(gate.actor!.supabase, {
      status: url.searchParams.get("status") ?? undefined,
      requestType: url.searchParams.get("requestType") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      destination: url.searchParams.get("destination") ?? undefined,
      dog: url.searchParams.get("dog") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      activeOnly: url.searchParams.get("activeOnly") === "1",
      limit: Number(url.searchParams.get("limit") ?? 25),
      offset: Number(url.searchParams.get("offset") ?? 0)
    });
    return marketingJson(result);
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to load requests." }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "create");
  const { session, supabase } = gate.actor!;
  const actor = {
    id: session.adminUserId ?? null,
    email: session.email,
    name: session.email?.split("@")[0] ?? "Marketing"
  };

  try {
    if (action === "create") {
      const requestRow = await createMarketingMediaRequest(supabase, {
        dogGingrId: String(body.dogGingrId ?? "") || null,
        dogName: String(body.dogName ?? ""),
        dogBreed: String(body.dogBreed ?? "") || null,
        dogPhotoUrl: String(body.dogPhotoUrl ?? "") || null,
        dogLocation: String(body.dogLocation ?? "") || null,
        requestType: String(body.requestType ?? "photo_session") as MarketingRequestType,
        destination: String(body.destination ?? "photo_box") as MarketingDestination,
        customDestination: String(body.customDestination ?? "") || null,
        priority: String(body.priority ?? "standard") as MarketingRequestPriority,
        requestedDeadline: String(body.requestedDeadline ?? "") || null,
        instructions: String(body.instructions ?? "") || null,
        idempotencyKey: String(body.idempotencyKey ?? "") || null,
        actor
      });
      return marketingJson({ request: requestRow });
    }

    const requestId = String(body.requestId ?? "");
    if (!requestId) return marketingJson({ error: "requestId is required." }, 400);

    if (action === "cancel") {
      const updated = await transitionMarketingRequest(supabase, requestId, "canceled", {
        action: "cancel",
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        actorRole: session.role ?? "marketing"
      });
      return marketingJson({ request: updated });
    }
    if (action === "complete") {
      const updated = await transitionMarketingRequest(supabase, requestId, "completed", {
        action: "complete",
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        actorRole: session.role ?? "marketing"
      });
      return marketingJson({ request: updated });
    }
    if (action === "mark_in_session") {
      const updated = await transitionMarketingRequest(supabase, requestId, "in_session", {
        action: "mark_in_session",
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        actorRole: session.role ?? "marketing"
      });
      return marketingJson({ request: updated });
    }
    if (action === "resend") {
      const updated = await resendMarketingRequestNotice(supabase, requestId, actor);
      return marketingJson({ request: updated });
    }

    return marketingJson({ error: "Unknown action." }, 400);
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Request failed." }, 500);
  }
}

export async function PATCH(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const requestId = String(body.requestId ?? "");
  if (!requestId) return marketingJson({ error: "requestId is required." }, 400);

  try {
    const patch: Record<string, unknown> = {};
    for (const key of [
      "instructions",
      "priority",
      "destination",
      "custom_destination",
      "requested_deadline",
      "request_type"
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const { data, error } = await gate.actor!.supabase
      .from("marketing_media_requests")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return marketingJson({ request: data });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to update request." }, 500);
  }
}
