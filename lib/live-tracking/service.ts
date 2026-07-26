import { getServiceSupabase } from "@/lib/supabase/server";
import { samsaraLiveTrackingProvider } from "@/lib/live-tracking/samsara-provider";
import {
  getEtaStaleSeconds,
  getGpsStaleSeconds,
  getLiveThresholdMinutes,
  isLiveTrackingShadowMode,
  isSamsaraTrackingSyncEnabled,
  isTracking5MinuteAlertEnabled,
  TRACKING_VANS
} from "@/lib/live-tracking/flags";
import { evaluateThresholds, type TrackingStatus } from "@/lib/live-tracking/status";
import { queueThresholdNotification } from "@/lib/live-tracking/notifications";
import { buildOwnerSafeSnapshot, type SessionRow } from "@/lib/live-tracking/privacy";
import { hashTrackingToken, isTokenActive, buildTrackingUrl } from "@/lib/live-tracking/tokens";
import { writeTrackingAuditEvent } from "@/lib/live-tracking/audit";
import { createTrackingSessionsFromPlan, createStaffPreviewToken, issueRawTrackingTokenForSession } from "@/lib/live-tracking/sessions";

export { createTrackingSessionsFromPlan, createStaffPreviewToken, issueRawTrackingTokenForSession };

function minutesAwayFromEta(etaAt: string | null, now = new Date()): number | null {
  if (!etaAt) return null;
  return Math.round((new Date(etaAt).getTime() - now.getTime()) / 60000);
}

async function getContactPhone(): Promise<string | null> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("transport_tracking_settings")
      .select("value")
      .eq("key", "contact")
      .maybeSingle();
    const phone = (data?.value as { business_phone?: string } | null)?.business_phone;
    return phone?.trim() || process.env.FITDOG_BUSINESS_PHONE?.trim() || null;
  } catch {
    return process.env.FITDOG_BUSINESS_PHONE?.trim() || null;
  }
}

export async function getOwnerSnapshotByToken(rawToken: string) {
  const supabase = getServiceSupabase();
  const tokenHash = hashTrackingToken(rawToken);
  const { data: token, error } = await supabase
    .from("transport_tracking_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !token) {
    return { ok: false as const, status: 404, error: "Tracking link not found." };
  }
  if (
    !isTokenActive({
      notBeforeAt: token.not_before_at,
      expiresAt: token.expires_at,
      revokedAt: token.revoked_at
    })
  ) {
    return { ok: false as const, status: 410, error: "This tracking link is no longer active." };
  }

  await supabase
    .from("transport_tracking_tokens")
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: Number(token.access_count || 0) + 1
    })
    .eq("id", token.id);

  const { data: session } = await supabase
    .from("transport_tracking_sessions")
    .select("*")
    .eq("id", token.session_id)
    .maybeSingle();
  if (!session) {
    return { ok: false as const, status: 404, error: "Tracking session not found." };
  }

  const { data: routeLineRow } = await supabase
    .from("transport_tracking_route_lines")
    .select("geometry")
    .eq("session_id", session.id)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const contactPhone = await getContactPhone();
  const snapshot = buildOwnerSafeSnapshot({
    session: session as SessionRow,
    routeLine: (routeLineRow?.geometry as Array<{ lat: number; lng: number }>) || [],
    contactPhone,
    isNextStopOrWithinThreshold: true
  });

  return {
    ok: true as const,
    snapshot,
    isStaffPreview: Boolean(token.is_staff_preview),
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  };
}

export async function applyEtaUpdate(params: {
  sessionId: string;
  etaAt: string | null;
  etaSource: string;
  samsaraEventId?: string | null;
}) {
  const supabase = getServiceSupabase();
  const { data: session } = await supabase
    .from("transport_tracking_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .maybeSingle();
  if (!session) return { ok: false, reason: "missing_session" };

  const previousEta = session.current_eta_at as string | null;
  const previousMinutes = minutesAwayFromEta(previousEta);
  const minutes = minutesAwayFromEta(params.etaAt);

  const decision = evaluateThresholds(
    {
      status: session.status as TrackingStatus,
      threshold30Sent: Boolean(session.threshold_30_sent_at),
      threshold15Sent: Boolean(session.threshold_15_sent_at),
      threshold5Sent: Boolean(session.threshold_5_sent_at),
      arrivedNotified: Boolean(session.arrived_notified_at),
      completedNotified: Boolean(session.completed_notified_at),
      delayNotified: Boolean(session.delay_notified_at),
      liveTrackingEnabled: Boolean(session.live_tracking_enabled_at),
      minutesAway: minutes,
      direction: session.direction as "pickup" | "dropoff"
    },
    {
      finalAlertEnabled: isTracking5MinuteAlertEnabled(),
      previousMinutesAway: previousMinutes
    }
  );

  const updates: Record<string, unknown> = {
    previous_eta_at: previousEta,
    current_eta_at: params.etaAt,
    eta_source: params.etaSource,
    status: decision.nextStatus,
    updated_at: new Date().toISOString()
  };

  if (decision.enableLiveTracking && !session.live_tracking_enabled_at) {
    updates.live_tracking_enabled_at = new Date().toISOString();
  }

  const nowIso = new Date().toISOString();
  for (const event of decision.events) {
    if (event === "notice_30") updates.threshold_30_sent_at = nowIso;
    if (event === "live_15") updates.threshold_15_sent_at = nowIso;
    if (event === "final_5") updates.threshold_5_sent_at = nowIso;
    if (event === "delay") {
      updates.delay_notified_at = nowIso;
      updates.delay_incident_active = true;
    }
  }

  await supabase.from("transport_tracking_sessions").update(updates).eq("id", params.sessionId);
  await supabase.from("transport_tracking_eta_history").insert({
    session_id: params.sessionId,
    eta_at: params.etaAt,
    eta_source: params.etaSource,
    minutes_away: minutes
  });

  // Resolve tracking URL only when needed (15-min / delay). Staff regenerate when missing.
  let trackingUrl = "";
  if (decision.events.includes("live_15") || decision.events.includes("delay")) {
    trackingUrl = `${process.env.FITDOG_TRACKING_PUBLIC_DOMAIN || "https://staff.ruffops.com"}/track/session`;
    // Prefer regenerating a fresh link for outbound message (raw token not stored).
    try {
      const issued = await issueRawTrackingTokenForSession(params.sessionId);
      trackingUrl = issued.url;
    } catch {
      trackingUrl = buildTrackingUrl("unavailable");
    }
  }

  for (const event of decision.events) {
    await queueThresholdNotification({
      sessionId: params.sessionId,
      eventType: event,
      direction: session.direction as "pickup" | "dropoff",
      dogNames: (session.dog_names as string[]) || ["your dog"],
      trackingUrl,
      arrivalTime: params.etaAt
        ? new Date(params.etaAt).toLocaleTimeString("en-US", {
            timeZone: "America/Los_Angeles",
            hour: "numeric",
            minute: "2-digit"
          })
        : null,
      phone: session.owner_phone_e164,
      email: session.owner_email
    });
    await writeTrackingAuditEvent({
      action: `live_tracking.threshold_${event}`,
      entityType: "transport_tracking_session",
      entityId: params.sessionId,
      newValue: { minutes, etaSource: params.etaSource, shadow: isLiveTrackingShadowMode() }
    });
  }

  if (params.samsaraEventId) {
    await supabase.from("transport_tracking_events").upsert(
      {
        session_id: params.sessionId,
        event_type: "eta_update",
        samsara_event_id: params.samsaraEventId,
        payload: { etaSource: params.etaSource }
      },
      { onConflict: "samsara_event_id", ignoreDuplicates: true }
    );
  }

  return { ok: true, decision, minutes };
}

export async function applyVehicleGps(params: {
  samsaraVehicleId: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracyMeters?: number | null;
  recordedAt: string;
  vanKey?: string | null;
}) {
  if (params.vanKey) {
    if (!(TRACKING_VANS as readonly string[]).includes(params.vanKey)) {
      throw new Error("Unsupported van");
    }
  }
  const supabase = getServiceSupabase();
  await supabase.from("transport_tracking_vehicle_locations").insert({
    samsara_vehicle_id: params.samsaraVehicleId,
    van_key: params.vanKey ?? null,
    latitude: params.latitude,
    longitude: params.longitude,
    heading: params.heading ?? null,
    accuracy_meters: params.accuracyMeters ?? null,
    recorded_at: params.recordedAt,
    source: "samsara_stats_feed"
  });

  const { data: sessions } = await supabase
    .from("transport_tracking_sessions")
    .select("id, stop_latitude, stop_longitude, live_tracking_enabled_at, status")
    .eq("samsara_vehicle_id", params.samsaraVehicleId)
    .not("status", "in", "(completed,cancelled,failed,picked_up,dropped_off)");

  for (const session of sessions ?? []) {
    await supabase
      .from("transport_tracking_sessions")
      .update({
        vehicle_latitude: params.latitude,
        vehicle_longitude: params.longitude,
        vehicle_heading: params.heading ?? null,
        vehicle_accuracy_meters: params.accuracyMeters ?? null,
        last_gps_at: params.recordedAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", session.id);

    await supabase.from("transport_tracking_snapshots").insert({
      session_id: session.id,
      vehicle_latitude: params.latitude,
      vehicle_longitude: params.longitude,
      vehicle_heading: params.heading ?? null,
      status: session.status
    });

    // Lightweight straight-line route fallback when maps provider unavailable.
    if (session.live_tracking_enabled_at && session.stop_latitude != null && session.stop_longitude != null) {
      await supabase.from("transport_tracking_route_lines").insert({
        session_id: session.id,
        geometry: [
          { lat: params.latitude, lng: params.longitude },
          { lat: Number(session.stop_latitude), lng: Number(session.stop_longitude) }
        ],
        provider: "straight_line_fallback",
        stale: false
      });
    }
  }

  return { updatedSessions: sessions?.length ?? 0 };
}

export async function markSessionArrived(sessionId: string, actor?: {
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  reason?: string;
}) {
  const supabase = getServiceSupabase();
  const { data: session } = await supabase
    .from("transport_tracking_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) throw new Error("Session not found");

  await supabase
    .from("transport_tracking_sessions")
    .update({
      status: "arrived",
      arrived_at: new Date().toISOString(),
      arrived_notified_at: session.arrived_notified_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", sessionId);

  if (!session.arrived_notified_at) {
    await queueThresholdNotification({
      sessionId,
      eventType: "arrived",
      direction: session.direction as "pickup" | "dropoff",
      dogNames: (session.dog_names as string[]) || ["your dog"],
      trackingUrl: "",
      phone: session.owner_phone_e164,
      email: session.owner_email
    });
  }

  await writeTrackingAuditEvent({
    action: "live_tracking.arrived",
    entityType: "transport_tracking_session",
    entityId: sessionId,
    actorAdminId: actor?.actorAdminId,
    actorEmail: actor?.actorEmail,
    actorRole: actor?.actorRole,
    reason: actor?.reason
  });
}

export async function markSessionCompleted(sessionId: string, actor?: {
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  reason?: string;
}) {
  const supabase = getServiceSupabase();
  const { data: session } = await supabase
    .from("transport_tracking_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) throw new Error("Session not found");

  const nextStatus = session.direction === "pickup" ? "picked_up" : "dropped_off";
  const graceMs = 15 * 60_000;
  await supabase
    .from("transport_tracking_sessions")
    .update({
      status: nextStatus,
      completed_at: new Date().toISOString(),
      completed_notified_at: session.completed_notified_at || new Date().toISOString(),
      expires_at: new Date(Date.now() + graceMs).toISOString(),
      vehicle_latitude: null,
      vehicle_longitude: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", sessionId);

  await supabase
    .from("transport_tracking_tokens")
    .update({ expires_at: new Date(Date.now() + graceMs).toISOString() })
    .eq("session_id", sessionId)
    .is("revoked_at", null);

  if (!session.completed_notified_at) {
    await queueThresholdNotification({
      sessionId,
      eventType: "completed",
      direction: session.direction as "pickup" | "dropoff",
      dogNames: (session.dog_names as string[]) || ["your dog"],
      trackingUrl: "",
      phone: session.owner_phone_e164,
      email: session.owner_email
    });
  }

  await writeTrackingAuditEvent({
    action: "live_tracking.completed",
    entityType: "transport_tracking_session",
    entityId: sessionId,
    actorAdminId: actor?.actorAdminId,
    actorEmail: actor?.actorEmail,
    actorRole: actor?.actorRole,
    reason: actor?.reason
  });
}

export async function cancelTrackingSession(sessionId: string, reason: string, actor?: {
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  const supabase = getServiceSupabase();
  const { data: session } = await supabase
    .from("transport_tracking_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) throw new Error("Session not found");

  await supabase
    .from("transport_tracking_sessions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      vehicle_latitude: null,
      vehicle_longitude: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", sessionId);

  await supabase
    .from("transport_tracking_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .is("revoked_at", null);

  await supabase
    .from("transport_tracking_notifications")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("status", "queued");

  await queueThresholdNotification({
    sessionId,
    eventType: "cancelled",
    direction: session.direction as "pickup" | "dropoff",
    dogNames: (session.dog_names as string[]) || ["your dog"],
    trackingUrl: "",
    phone: session.owner_phone_e164,
    email: session.owner_email
  });

  await writeTrackingAuditEvent({
    action: "live_tracking.cancelled",
    entityType: "transport_tracking_session",
    entityId: sessionId,
    actorAdminId: actor?.actorAdminId,
    actorEmail: actor?.actorEmail,
    actorRole: actor?.actorRole,
    reason
  });
}

export async function syncSamsaraVehicleFeed() {
  if (!isSamsaraTrackingSyncEnabled()) {
    return { ok: true, skipped: true, reason: "SAMSARA_TRACKING_SYNC_ENABLED=false" };
  }
  if (!samsaraLiveTrackingProvider.isConfigured()) {
    return { ok: false, reason: "Samsara API token not configured" };
  }

  const supabase = getServiceSupabase();
  const { data: active } = await supabase
    .from("transport_tracking_sessions")
    .select("samsara_vehicle_id")
    .not("status", "in", "(completed,cancelled,failed,picked_up,dropped_off)")
    .not("samsara_vehicle_id", "is", null);

  const vehicleIds = Array.from(
    new Set((active ?? []).map((r) => String(r.samsara_vehicle_id)).filter(Boolean))
  );
  if (!vehicleIds.length) {
    return { ok: true, updated: 0, note: "no_active_sessions" };
  }

  const { data: cursorRow } = await supabase
    .from("transport_tracking_provider_cursors")
    .select("cursor_value")
    .eq("provider", "samsara")
    .eq("cursor_key", "vehicle_stats_feed")
    .maybeSingle();

  const feed = await samsaraLiveTrackingProvider.fetchVehicleStatsFeed({
    cursor: cursorRow?.cursor_value ?? null,
    vehicleIds
  });

  let updated = 0;
  for (const loc of feed.locations) {
    const result = await applyVehicleGps({
      samsaraVehicleId: loc.vehicleId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      heading: loc.heading,
      accuracyMeters: loc.accuracyMeters,
      recordedAt: loc.recordedAt
    });
    updated += result.updatedSessions;
  }

  if (feed.nextCursor) {
    await supabase.from("transport_tracking_provider_cursors").upsert(
      {
        provider: "samsara",
        cursor_key: "vehicle_stats_feed",
        cursor_value: feed.nextCursor,
        updated_at: new Date().toISOString()
      },
      { onConflict: "provider,cursor_key" }
    );
  }

  return { ok: true, updated, hasNextPage: feed.hasNextPage };
}

export async function evaluateStaleSessions() {
  const supabase = getServiceSupabase();
  const gpsStaleMs = getGpsStaleSeconds() * 1000;
  const etaStaleMs = getEtaStaleSeconds() * 1000;
  const now = Date.now();
  const { data: sessions } = await supabase
    .from("transport_tracking_sessions")
    .select("id, last_gps_at, current_eta_at, live_tracking_enabled_at, health_status")
    .not("status", "in", "(completed,cancelled,failed,picked_up,dropped_off)")
    .not("live_tracking_enabled_at", "is", null);

  let flagged = 0;
  for (const session of sessions ?? []) {
    let health = "healthy";
    if (session.last_gps_at && now - new Date(session.last_gps_at).getTime() > gpsStaleMs) {
      health = "gps_delayed";
    } else if (session.current_eta_at && now - new Date(session.current_eta_at).getTime() > etaStaleMs) {
      health = "eta_stale";
    }
    if (health !== session.health_status) {
      await supabase
        .from("transport_tracking_sessions")
        .update({ health_status: health, updated_at: new Date().toISOString() })
        .eq("id", session.id);
      flagged += 1;
      if (health === "gps_delayed" || health === "eta_stale") {
        const { alertTrackingIssue } = await import("@/lib/live-tracking/staff-alerts");
        await alertTrackingIssue({
          sessionId: String(session.id),
          kind: health,
          title: health === "gps_delayed" ? "Live tracking GPS delayed" : "Live tracking ETA stale",
          body: "An active owner tracking session needs attention. Precise address details are withheld from this alert."
        });
      }
    }
  }
  return { flagged };
}

export async function listManagementSessions(date?: string) {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("transport_tracking_sessions")
    .select(
      "id, operating_date, direction, status, van_key, van_display_name, dog_names, customer_id, current_eta_at, last_gps_at, threshold_30_sent_at, threshold_15_sent_at, threshold_5_sent_at, live_tracking_enabled_at, health_status, shadow_mode, owner_phone_e164, arrived_at, completed_at"
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  if (date) query = query.eq("operating_date", date);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    owner_phone_e164: row.owner_phone_e164
      ? `***-***-${String(row.owner_phone_e164).replace(/\D/g, "").slice(-4)}`
      : null
  }));
}

export async function getLiveTrackingBootstrap() {
  return {
    enabled: process.env.FITDOG_LIVE_TRACKING_ENABLED === "true",
    shadowMode: isLiveTrackingShadowMode(),
    syncEnabled: isSamsaraTrackingSyncEnabled(),
    liveThresholdMinutes: getLiveThresholdMinutes(),
    vans: TRACKING_VANS
  };
}
