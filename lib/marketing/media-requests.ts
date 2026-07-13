import {
  MARKETING_DESTINATION_LABELS,
  MARKETING_PRIORITY_LABELS,
  MARKETING_REQUEST_TYPE_LABELS,
  type MarketingDestination,
  type MarketingRequestPriority,
  type MarketingRequestStatus,
  type MarketingRequestType
} from "@/lib/marketing/constants";
import { canTransition, STAFF_ACTION_TO_STATUS } from "@/lib/marketing/status";
import { writeMarketingActivity } from "@/lib/marketing/audit";
import { createMarketingNotification } from "@/lib/marketing/notifications";
import { loadActiveDogsForGroomingPush } from "@/lib/grooming-push-active-dogs";
import { loadAdminSettings } from "@/lib/admin/settings";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type MarketingMediaRequest = {
  id: string;
  idempotency_key: string | null;
  dog_gingr_id: string | null;
  dog_name: string;
  dog_breed: string | null;
  dog_photo_url: string | null;
  dog_location: string | null;
  request_type: MarketingRequestType;
  destination: MarketingDestination;
  custom_destination: string | null;
  priority: MarketingRequestPriority;
  requested_deadline: string | null;
  instructions: string | null;
  status: MarketingRequestStatus;
  delay_until: string | null;
  staff_notice_id: string | null;
  requested_by_id: string | null;
  requested_by_email: string | null;
  requested_by_name: string | null;
  last_handler_action: string | null;
  last_handler_actor: string | null;
  last_handler_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

function sanitize(value: unknown, max = 500) {
  return String(value ?? "")
    .replace(/[<>&"'`/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function rowToRequest(row: Record<string, unknown>): MarketingMediaRequest {
  return row as unknown as MarketingMediaRequest;
}

export function destinationLabel(destination: MarketingDestination, custom?: string | null) {
  if (destination === "custom" && custom) return custom;
  return MARKETING_DESTINATION_LABELS[destination] ?? destination;
}

export function buildStaffNoticeMessage(request: Pick<MarketingMediaRequest, "destination" | "custom_destination" | "instructions" | "request_type">) {
  const dest = destinationLabel(request.destination, request.custom_destination);
  const typeLabel = MARKETING_REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type;
  const lines = [
    `Request type: ${typeLabel}`,
    `Destination: ${dest}`,
    request.instructions ? `Instructions: ${request.instructions}` : null,
    "Marketing needs this dog for photos or video.",
    request.destination === "photo_box"
      ? "Please place the dog in the Photo Box using a slip lead."
      : `Please bring the dog to ${dest}.`
  ].filter(Boolean);
  return lines.join("\n");
}

export async function assertDogStillCheckedIn(
  supabase: SupabaseClient,
  dogGingrId: string | null,
  dogName: string
) {
  const settings = await loadAdminSettings(supabase);
  const { dogs } = await loadActiveDogsForGroomingPush(supabase, { timeZone: settings.timezone });
  const match = dogs.find(
    (dog) =>
      (dogGingrId && (dog.gingrAnimalId === dogGingrId || dog.dogId === dogGingrId)) ||
      dog.dogName.toLowerCase() === dogName.toLowerCase()
  );
  if (!match) throw new Error("That dog is no longer checked in. Refresh the dog list and try again.");
  return match;
}

async function appendRequestEvent(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorId?: string | null;
    actorEmail?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("marketing_media_request_events").insert({
    request_id: input.requestId,
    action: input.action,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    actor_name: input.actorName ?? null,
    actor_role: input.actorRole ?? null,
    metadata: input.metadata ?? {}
  });
  if (error) throw new Error(error.message);
}

export async function createMarketingMediaRequest(
  supabase: SupabaseClient,
  input: {
    dogGingrId?: string | null;
    dogName: string;
    dogBreed?: string | null;
    dogPhotoUrl?: string | null;
    dogLocation?: string | null;
    requestType: MarketingRequestType;
    destination: MarketingDestination;
    customDestination?: string | null;
    priority?: MarketingRequestPriority;
    requestedDeadline?: string | null;
    instructions?: string | null;
    idempotencyKey?: string | null;
    actor: { id?: string | null; email?: string | null; name?: string | null };
  }
) {
  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from("marketing_media_requests")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return rowToRequest(existing as Record<string, unknown>);
  }

  await assertDogStillCheckedIn(supabase, input.dogGingrId ?? null, input.dogName);

  const noticeId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("marketing_media_requests")
    .insert({
      idempotency_key: input.idempotencyKey ?? null,
      dog_gingr_id: input.dogGingrId ?? null,
      dog_name: sanitize(input.dogName, 120),
      dog_breed: sanitize(input.dogBreed, 120) || null,
      dog_photo_url: sanitize(input.dogPhotoUrl, 800) || null,
      dog_location: sanitize(input.dogLocation, 120) || null,
      request_type: input.requestType,
      destination: input.destination,
      custom_destination: input.destination === "custom" ? sanitize(input.customDestination, 120) || null : null,
      priority: input.priority ?? "standard",
      requested_deadline: input.requestedDeadline ?? null,
      instructions: sanitize(input.instructions, 1000) || null,
      status: "awaiting_handler",
      staff_notice_id: noticeId,
      requested_by_id: input.actor.id ?? null,
      requested_by_email: input.actor.email ?? null,
      requested_by_name: input.actor.name ?? null
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const request = rowToRequest(data as Record<string, unknown>);

  await appendRequestEvent(supabase, {
    requestId: request.id,
    action: "created",
    toStatus: "awaiting_handler",
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorName: input.actor.name,
    actorRole: "marketing"
  });

  await writeMarketingActivity(supabase, {
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: "marketing.request.created",
    entityType: "marketing_media_request",
    entityId: request.id,
    metadata: { dog_name: request.dog_name, request_type: request.request_type }
  });

  return request;
}

export async function transitionMarketingRequest(
  supabase: SupabaseClient,
  requestId: string,
  toStatus: MarketingRequestStatus,
  input: {
    action: string;
    actorId?: string | null;
    actorEmail?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
    allowAdminReopen?: boolean;
    delayUntil?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { data: existing, error: loadError } = await supabase
    .from("marketing_media_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("Media request not found.");

  const fromStatus = existing.status as MarketingRequestStatus;
  if (!canTransition(fromStatus, toStatus, input.allowAdminReopen)) {
    throw new Error(`Cannot transition from ${fromStatus} to ${toStatus}.`);
  }

  const patch: Record<string, unknown> = {
    status: toStatus,
    last_handler_action: input.action,
    last_handler_actor: input.actorName ?? input.actorEmail ?? null,
    last_handler_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (toStatus === "delayed" && input.delayUntil) patch.delay_until = input.delayUntil;
  if (toStatus === "completed") patch.completed_at = new Date().toISOString();
  if (toStatus === "canceled") patch.canceled_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("marketing_media_requests")
    .update(patch)
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await appendRequestEvent(supabase, {
    requestId,
    action: input.action,
    fromStatus,
    toStatus,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorName: input.actorName,
    actorRole: input.actorRole,
    metadata: input.metadata
  });

  const request = rowToRequest(data as Record<string, unknown>);
  const notifyTitle = `Media request update: ${request.dog_name}`;
  const notifyBody = `${MARKETING_PRIORITY_LABELS[request.priority]} — now ${toStatus.replace(/_/g, " ")}`;

  if (request.requested_by_id) {
    await createMarketingNotification(supabase, {
      recipientUserId: request.requested_by_id,
      type: `request_${toStatus}`,
      title: notifyTitle,
      body: notifyBody,
      entityType: "marketing_media_request",
      entityId: request.id,
      linkPath: `/marketing/requests?highlight=${request.id}`
    });
  } else {
    await createMarketingNotification(supabase, {
      recipientRole: "marketing",
      type: `request_${toStatus}`,
      title: notifyTitle,
      body: notifyBody,
      entityType: "marketing_media_request",
      entityId: request.id,
      linkPath: `/marketing/requests?highlight=${request.id}`
    });
  }

  await writeMarketingActivity(supabase, {
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: `marketing.request.${input.action}`,
    entityType: "marketing_media_request",
    entityId: requestId,
    metadata: { from_status: fromStatus, to_status: toStatus }
  });

  return request;
}

export async function applyStaffMediaRequestAction(
  supabase: SupabaseClient,
  requestId: string,
  staffAction: string,
  actor: { id?: string | null; email?: string | null; name?: string | null; role?: string | null }
) {
  const toStatus = STAFF_ACTION_TO_STATUS[staffAction];
  if (!toStatus) throw new Error("Unknown staff action.");

  const delayUntil =
    staffAction === "delay_5_minutes" ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;

  return transitionMarketingRequest(supabase, requestId, toStatus, {
    action: staffAction,
    actorId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name,
    actorRole: actor.role,
    delayUntil
  });
}

export async function resendMarketingRequestNotice(supabase: SupabaseClient, requestId: string, actor: { id?: string | null; email?: string | null }) {
  const { data, error } = await supabase
    .from("marketing_media_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Media request not found.");
  const request = rowToRequest(data as Record<string, unknown>);
  if (request.status === "completed" || request.status === "canceled" || request.status === "unavailable") {
    throw new Error("Cannot resend a terminal request.");
  }

  const noticeId = crypto.randomUUID();
  const { data: updated, error: updateError } = await supabase
    .from("marketing_media_requests")
    .update({ staff_notice_id: noticeId, status: "awaiting_handler", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  await appendRequestEvent(supabase, {
    requestId,
    action: "resend_notice",
    fromStatus: request.status,
    toStatus: "awaiting_handler",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: "marketing"
  });

  await writeMarketingActivity(supabase, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "marketing.request.resend",
    entityType: "marketing_media_request",
    entityId: requestId
  });

  return rowToRequest(updated as Record<string, unknown>);
}

export async function listMarketingMediaRequests(
  supabase: SupabaseClient,
  filters: {
    status?: string;
    requestType?: string;
    priority?: string;
    requesterId?: string;
    destination?: string;
    dog?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
    activeOnly?: boolean;
  } = {}
) {
  let query = supabase
    .from("marketing_media_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.activeOnly) {
    query = query.not("status", "in", "(completed,unavailable,canceled)");
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.requestType) query = query.eq("request_type", filters.requestType);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.requesterId) query = query.eq("requested_by_id", filters.requesterId);
  if (filters.destination) query = query.eq("destination", filters.destination);
  if (filters.dog) query = query.ilike("dog_name", `%${filters.dog}%`);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);

  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return {
    requests: (data ?? []).map((row) => rowToRequest(row as Record<string, unknown>)),
    total: count ?? 0
  };
}

export async function loadMarketingMediaRequestBoardState(supabase: SupabaseClient) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("marketing_media_requests")
    .select("*")
    .not("status", "in", "(completed,unavailable,canceled)")
    .or(`delay_until.is.null,delay_until.lte.${now}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) throw new Error(error.message);
  const requests = (data ?? []).map((row) => rowToRequest(row as Record<string, unknown>));
  return {
    activeRequest: requests[0] ?? null,
    queue: requests.slice(1, 4)
  };
}

export async function getMarketingMediaRequestById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("marketing_media_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRequest(data as Record<string, unknown>) : null;
}

export async function listMarketingRequestEvents(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase
    .from("marketing_media_request_events")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function staffNoticeTitle(request: Pick<MarketingMediaRequest, "dog_name">) {
  return `MEDIA REQUEST — ${request.dog_name.toUpperCase()}`;
}
