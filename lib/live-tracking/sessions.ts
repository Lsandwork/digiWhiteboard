import { getServiceSupabase } from "@/lib/supabase/server";
import {
  buildTrackingUrl,
  generateTrackingToken,
  hashTrackingToken
} from "@/lib/live-tracking/tokens";
import {
  getExpirationGraceMinutes,
  isLiveTrackingShadowMode,
  assertNeverVan4
} from "@/lib/live-tracking/flags";
import { writeTrackingAuditEvent } from "@/lib/live-tracking/audit";

export type CreateSessionsResult = {
  created: number;
  sessionIds: string[];
  tokensIssued: number;
};

/**
 * Create tracking sessions from an approved/exported route plan.
 * One session per customer stop (household), with a hashed opaque token.
 */
export async function createTrackingSessionsFromPlan(params: {
  planId: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}): Promise<CreateSessionsResult> {
  const supabase = getServiceSupabase();
  const { data: plan, error: planError } = await supabase
    .from("route_plans")
    .select("*")
    .eq("id", params.planId)
    .maybeSingle();
  if (planError || !plan) throw new Error(planError?.message || "Plan not found");

  const { data: routes } = await supabase
    .from("route_plan_routes")
    .select("*")
    .eq("plan_id", params.planId);

  const routeIds = (routes ?? []).map((r) => r.id);
  const { data: stops } = routeIds.length
    ? await supabase.from("route_plan_stops").select("*").in("route_id", routeIds)
    : { data: [] as Array<Record<string, unknown>> };

  const stopIds = (stops ?? []).map((s) => s.id as string);
  const { data: items } = stopIds.length
    ? await supabase.from("route_plan_stop_items").select("*").in("stop_id", stopIds)
    : { data: [] as Array<Record<string, unknown>> };

  const routeById = new Map((routes ?? []).map((r) => [r.id, r]));
  const itemsByStop = new Map<string, Array<Record<string, unknown>>>();
  for (const item of items ?? []) {
    const key = String(item.stop_id);
    const list = itemsByStop.get(key) ?? [];
    list.push(item as Record<string, unknown>);
    itemsByStop.set(key, list);
  }

  const sessionIds: string[] = [];
  let tokensIssued = 0;
  const shadow = isLiveTrackingShadowMode();
  const graceMs = getExpirationGraceMinutes() * 60_000;
  const dayEnd = new Date(`${plan.operating_date}T23:59:59-07:00`);
  const expiresAt = new Date(dayEnd.getTime() + graceMs).toISOString();

  for (const stop of stops ?? []) {
    if (stop.stop_kind === "depot_start" || stop.stop_kind === "depot_end") continue;
    const route = routeById.get(stop.route_id);
    if (!route) continue;
    const vanKey = String(route.van_key || "");
    assertNeverVan4(vanKey);

    const stopItems = itemsByStop.get(String(stop.id)) ?? [];
    const dogNames = stopItems
      .map((i) => String(i.dog_name || ""))
      .filter(Boolean);
    const reservationIds = stopItems
      .map((i) => String(i.reservation_id || ""))
      .filter(Boolean);
    const dogNamesFallback = dogNames.length
      ? dogNames
      : [String(stop.owner_name || "your dog")];

    const existing = await supabase
      .from("transport_tracking_sessions")
      .select("id")
      .eq("route_stop_id", stop.id)
      .maybeSingle();

    let sessionId = existing.data?.id ? String(existing.data.id) : null;
    const payload = {
      route_plan_id: params.planId,
      route_id: route.id,
      route_stop_id: stop.id,
      reservation_ids: reservationIds,
      household_key: stop.household_key ? String(stop.household_key) : null,
      dog_names: dogNamesFallback,
      dog_ids: [] as string[],
      direction: route.direction,
      status: "route_assigned",
      van_key: vanKey,
      van_display_name: String(route.display_name || vanKey.replace("van_", "Van ")),
      stop_latitude: stop.latitude == null ? null : Number(stop.latitude),
      stop_longitude: stop.longitude == null ? null : Number(stop.longitude),
      stop_address_masked: maskAddress(String(stop.address || "")),
      operating_date: plan.operating_date,
      expires_at: expiresAt,
      shadow_mode: shadow,
      created_by: params.actorAdminId ?? null,
      health_status: "healthy",
      updated_at: new Date().toISOString()
    };

    if (sessionId) {
      await supabase.from("transport_tracking_sessions").update(payload).eq("id", sessionId);
    } else {
      const inserted = await supabase
        .from("transport_tracking_sessions")
        .insert(payload)
        .select("id")
        .single();
      if (inserted.error || !inserted.data) continue;
      sessionId = String(inserted.data.id);
    }

    sessionIds.push(sessionId);

    const activeToken = await supabase
      .from("transport_tracking_tokens")
      .select("id")
      .eq("session_id", sessionId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (!activeToken.data) {
      const raw = generateTrackingToken();
      const tokenHash = hashTrackingToken(raw);
      await supabase.from("transport_tracking_tokens").insert({
        session_id: sessionId,
        token_hash: tokenHash,
        not_before_at: new Date().toISOString(),
        expires_at: expiresAt,
        is_staff_preview: false
      });
      tokensIssued += 1;
      // Store raw token only ephemerally via audit-safe event without the token itself.
      await writeTrackingAuditEvent({
        action: "live_tracking.token_issued",
        entityType: "transport_tracking_session",
        entityId: sessionId,
        actorAdminId: params.actorAdminId,
        actorEmail: params.actorEmail,
        actorRole: params.actorRole,
        newValue: { trackingPath: "/track/[token]", issued: true }
      });
      // Attach raw token on in-memory return is intentionally omitted for security.
      void buildTrackingUrl(raw);
    }
  }

  await writeTrackingAuditEvent({
    action: "live_tracking.sessions_created",
    entityType: "route_plan",
    entityId: params.planId,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    newValue: { created: sessionIds.length, tokensIssued }
  });

  return { created: sessionIds.length, sessionIds, tokensIssued };
}

function maskAddress(address: string) {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return "Your area";
}

export async function issueRawTrackingTokenForSession(sessionId: string): Promise<{
  rawToken: string;
  url: string;
}> {
  const supabase = getServiceSupabase();
  const session = await supabase
    .from("transport_tracking_sessions")
    .select("expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session.data) throw new Error("Session not found");

  // Revoke previous
  await supabase
    .from("transport_tracking_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .is("revoked_at", null);

  const rawToken = generateTrackingToken();
  const tokenHash = hashTrackingToken(rawToken);
  const expiresAt =
    session.data.expires_at ||
    new Date(Date.now() + getExpirationGraceMinutes() * 60_000).toISOString();

  await supabase.from("transport_tracking_tokens").insert({
    session_id: sessionId,
    token_hash: tokenHash,
    not_before_at: new Date().toISOString(),
    expires_at: expiresAt,
    rotation_number: 1
  });

  return { rawToken, url: buildTrackingUrl(rawToken) };
}

export async function createStaffPreviewToken(sessionId: string): Promise<{
  rawToken: string;
  url: string;
}> {
  const rawToken = generateTrackingToken();
  const tokenHash = hashTrackingToken(rawToken);
  const supabase = getServiceSupabase();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await supabase.from("transport_tracking_tokens").insert({
    session_id: sessionId,
    token_hash: tokenHash,
    not_before_at: new Date().toISOString(),
    expires_at: expiresAt,
    is_staff_preview: true
  });
  return { rawToken, url: buildTrackingUrl(rawToken) };
}
