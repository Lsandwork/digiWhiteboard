import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { getPublicSiteUrl } from "@/lib/site-url";
import { writeRouteAuditEvent } from "@/lib/route-generator/audit";
import {
  isWithinRouteOwnerSmsServiceHours,
  routeOwnerSmsQuietHoursMessage
} from "@/lib/route-generator/sms-policy";

export type OwnerTrackingRow = {
  id: string;
  plan_id: string;
  route_id: string;
  stop_id: string;
  token: string;
  operating_date: string;
  direction: "pickup" | "dropoff";
  van_key: string;
  samsara_vehicle_name: string | null;
  samsara_serial: string | null;
  owner_name: string | null;
  dog_names: string[];
  owner_phone_e164: string | null;
  stop_address: string | null;
  stop_latitude: number | null;
  stop_longitude: number | null;
  status: string;
  last_eta_minutes: number | null;
  last_vehicle_latitude: number | null;
  last_vehicle_longitude: number | null;
  last_vehicle_at: string | null;
  link_sent_at: string | null;
  notified_30_at: string | null;
  notified_15_at: string | null;
  notified_pullup_at: string | null;
  sms_alerts_enabled: boolean;
  planned_arrival_at: string | null;
  planned_window_start: string | null;
  planned_window_end: string | null;
  created_at: string;
  updated_at: string;
  trackUrl: string;
  recentSms: OwnerSmsEventRow[];
};

export type OwnerSmsEventRow = {
  id: string;
  tracking_id: string | null;
  plan_id: string | null;
  operating_date: string | null;
  kind: string;
  to_e164: string | null;
  body_preview: string | null;
  ok: boolean;
  error: string | null;
  provider_message_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type ListOwnerTrackingFilters = {
  date: string;
  planId?: string | null;
  van?: string | null;
  direction?: string | null;
  status?: string | null;
  sms?: "all" | "enabled" | "disabled";
  link?: "all" | "sent" | "not_sent" | "missing_phone";
  q?: string | null;
};

function siteBase() {
  return getPublicSiteUrl().replace(/\/$/, "");
}

export async function recordOwnerSmsEvent(input: {
  trackingId?: string | null;
  planId?: string | null;
  operatingDate?: string | null;
  kind: string;
  toE164?: string | null;
  bodyPreview?: string | null;
  ok: boolean;
  error?: string | null;
  providerMessageId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  meta?: Record<string, unknown>;
}) {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("route_owner_sms_events").insert({
    tracking_id: input.trackingId ?? null,
    plan_id: input.planId ?? null,
    operating_date: input.operatingDate ?? null,
    kind: input.kind,
    to_e164: input.toE164 ?? null,
    body_preview: input.bodyPreview ? String(input.bodyPreview).slice(0, 280) : null,
    ok: input.ok,
    error: input.error ?? null,
    provider_message_id: input.providerMessageId ?? null,
    actor_email: input.actorEmail ?? null,
    actor_role: input.actorRole ?? null,
    meta: input.meta ?? {}
  });
  if (error) {
    // Table may not be migrated yet — never block SMS / approve on audit logging.
    console.error("[route-generator] sms event insert failed", error.message);
  }
}

export async function listOwnerTracking(filters: ListOwnerTrackingFilters): Promise<{
  rows: OwnerTrackingRow[];
  events: OwnerSmsEventRow[];
  summary: {
    total: number;
    smsEnabled: number;
    linkSent: number;
    missingPhone: number;
    notified30: number;
    notified15: number;
    notifiedPullup: number;
    active: number;
  };
}> {
  const supabase = getServiceSupabase();
  const date = filters.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Select a valid operating date (YYYY-MM-DD).");
  }

  let query = supabase
    .from("route_owner_tracking")
    .select("*")
    .eq("operating_date", date)
    .order("van_key", { ascending: true })
    .order("direction", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (filters.planId) query = query.eq("plan_id", filters.planId);
  if (filters.van) query = query.eq("van_key", filters.van);
  if (filters.direction === "pickup" || filters.direction === "dropoff") {
    query = query.eq("direction", filters.direction);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.sms === "enabled") query = query.eq("sms_alerts_enabled", true);
  if (filters.sms === "disabled") query = query.eq("sms_alerts_enabled", false);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as Array<Record<string, unknown>>;

  if (filters.link === "sent") rows = rows.filter((r) => Boolean(r.link_sent_at));
  if (filters.link === "not_sent") rows = rows.filter((r) => !r.link_sent_at && r.owner_phone_e164);
  if (filters.link === "missing_phone") rows = rows.filter((r) => !r.owner_phone_e164);

  const q = String(filters.q || "")
    .trim()
    .toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const dogs = Array.isArray(r.dog_names) ? (r.dog_names as string[]).join(" ") : "";
      const hay = [
        r.owner_name,
        dogs,
        r.owner_phone_e164,
        r.stop_address,
        r.token,
        r.van_key,
        r.samsara_vehicle_name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const ids = rows.map((r) => String(r.id));
  let events: OwnerSmsEventRow[] = [];
  try {
    if (ids.length) {
      const { data: eventRows, error: eventError } = await supabase
        .from("route_owner_sms_events")
        .select("*")
        .in("tracking_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      if (eventError) throw new Error(eventError.message);
      events = (eventRows ?? []) as OwnerSmsEventRow[];
    } else {
      const { data: eventRows, error: eventError } = await supabase
        .from("route_owner_sms_events")
        .select("*")
        .eq("operating_date", date)
        .order("created_at", { ascending: false })
        .limit(100);
      if (eventError) throw new Error(eventError.message);
      events = (eventRows ?? []) as OwnerSmsEventRow[];
    }
  } catch (eventLoadError) {
    console.error("[route-generator] sms events load failed", eventLoadError);
    events = [];
  }

  const eventsByTracking = new Map<string, OwnerSmsEventRow[]>();
  for (const event of events) {
    if (!event.tracking_id) continue;
    const list = eventsByTracking.get(event.tracking_id) ?? [];
    if (list.length < 8) list.push(event);
    eventsByTracking.set(event.tracking_id, list);
  }

  const mapped: OwnerTrackingRow[] = rows.map((r) => {
    const id = String(r.id);
    return {
      id,
      plan_id: String(r.plan_id),
      route_id: String(r.route_id),
      stop_id: String(r.stop_id),
      token: String(r.token),
      operating_date: String(r.operating_date).slice(0, 10),
      direction: r.direction === "dropoff" ? "dropoff" : "pickup",
      van_key: String(r.van_key),
      samsara_vehicle_name: r.samsara_vehicle_name ? String(r.samsara_vehicle_name) : null,
      samsara_serial: r.samsara_serial ? String(r.samsara_serial) : null,
      owner_name: r.owner_name ? String(r.owner_name) : null,
      dog_names: Array.isArray(r.dog_names) ? (r.dog_names as string[]) : [],
      owner_phone_e164: r.owner_phone_e164 ? String(r.owner_phone_e164) : null,
      stop_address: r.stop_address ? String(r.stop_address) : null,
      stop_latitude: r.stop_latitude == null ? null : Number(r.stop_latitude),
      stop_longitude: r.stop_longitude == null ? null : Number(r.stop_longitude),
      status: String(r.status || "pending"),
      last_eta_minutes: r.last_eta_minutes == null ? null : Number(r.last_eta_minutes),
      last_vehicle_latitude: r.last_vehicle_latitude == null ? null : Number(r.last_vehicle_latitude),
      last_vehicle_longitude: r.last_vehicle_longitude == null ? null : Number(r.last_vehicle_longitude),
      last_vehicle_at: r.last_vehicle_at ? String(r.last_vehicle_at) : null,
      link_sent_at: r.link_sent_at ? String(r.link_sent_at) : null,
      notified_30_at: r.notified_30_at ? String(r.notified_30_at) : null,
      notified_15_at: r.notified_15_at ? String(r.notified_15_at) : null,
      notified_pullup_at: r.notified_pullup_at ? String(r.notified_pullup_at) : null,
      sms_alerts_enabled: Boolean(r.sms_alerts_enabled),
      planned_arrival_at: r.planned_arrival_at ? String(r.planned_arrival_at) : null,
      planned_window_start: r.planned_window_start ? String(r.planned_window_start) : null,
      planned_window_end: r.planned_window_end ? String(r.planned_window_end) : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      trackUrl: `${siteBase()}/track/${String(r.token)}`,
      recentSms: eventsByTracking.get(id) ?? []
    };
  });

  const summary = {
    total: mapped.length,
    smsEnabled: mapped.filter((r) => r.sms_alerts_enabled).length,
    linkSent: mapped.filter((r) => Boolean(r.link_sent_at)).length,
    missingPhone: mapped.filter((r) => !r.owner_phone_e164).length,
    notified30: mapped.filter((r) => Boolean(r.notified_30_at)).length,
    notified15: mapped.filter((r) => Boolean(r.notified_15_at)).length,
    notifiedPullup: mapped.filter((r) => Boolean(r.notified_pullup_at)).length,
    active: mapped.filter((r) => !["arrived", "completed", "cancelled"].includes(r.status)).length
  };

  return { rows: mapped, events, summary };
}

type Actor = {
  adminId?: string | null;
  email?: string | null;
  role?: string | null;
};

export async function setOwnerTrackingSmsAlerts(input: {
  trackingId: string;
  enabled: boolean;
  actor: Actor;
}) {
  const supabase = getServiceSupabase();
  const { data: row, error } = await supabase
    .from("route_owner_tracking")
    .select("*")
    .eq("id", input.trackingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Tracking row not found.");

  const { error: updateError } = await supabase
    .from("route_owner_tracking")
    .update({ sms_alerts_enabled: input.enabled })
    .eq("id", input.trackingId);
  if (updateError) throw new Error(updateError.message);

  await recordOwnerSmsEvent({
    trackingId: input.trackingId,
    planId: String(row.plan_id),
    operatingDate: String(row.operating_date).slice(0, 10),
    kind: input.enabled ? "enable_alerts" : "disable_alerts",
    toE164: row.owner_phone_e164 ? String(row.owner_phone_e164) : null,
    ok: true,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    meta: { previous: Boolean(row.sms_alerts_enabled) }
  });

  await writeRouteAuditEvent({
    action: input.enabled
      ? "route_generator.owner_sms_alerts_enabled"
      : "route_generator.owner_sms_alerts_disabled",
    entityType: "route_owner_tracking",
    entityId: input.trackingId,
    actorAdminId: input.actor.adminId,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    newValue: { sms_alerts_enabled: input.enabled }
  });

  return { ok: true, sms_alerts_enabled: input.enabled };
}

export async function resendOwnerTrackingLinkSms(input: {
  trackingId: string;
  actor: Actor;
  /** Bypass quiet hours — staff must confirm in UI. */
  forceQuietHours?: boolean;
}) {
  const supabase = getServiceSupabase();
  const { data: row, error } = await supabase
    .from("route_owner_tracking")
    .select("*")
    .eq("id", input.trackingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Tracking row not found.");

  const phone = row.owner_phone_e164 ? String(row.owner_phone_e164) : null;
  if (!phone) throw new Error("This stop has no owner phone on file.");

  const now = new Date();
  const quiet = routeOwnerSmsQuietHoursMessage(now);
  if (quiet && !input.forceQuietHours) {
    throw new Error(quiet);
  }

  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    throw new Error(
      "Twilio is not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)."
    );
  }

  const token = String(row.token);
  const url = `${siteBase()}/track/${token}`;
  const dogs = (Array.isArray(row.dog_names) ? (row.dog_names as string[]) : []).slice(0, 3).join(" + ") || "your dog";
  const direction = row.direction === "pickup" ? "pickup" : "drop-off";
  const body = `Fitdog: track ${dogs}'s ${direction} live — ${url}`;
  const sent = await sms.send({
    to: phone,
    body,
    purpose: "transactional",
    idempotencyKey: `route-track-link-resend:${row.id}:${Date.now()}`.slice(0, 64)
  });

  await recordOwnerSmsEvent({
    trackingId: String(row.id),
    planId: String(row.plan_id),
    operatingDate: String(row.operating_date).slice(0, 10),
    kind: "resend_link",
    toE164: phone,
    bodyPreview: body,
    ok: sent.ok,
    error: sent.ok ? null : sent.error || "Twilio send failed",
    providerMessageId: sent.ok ? sent.providerMessageId || null : null,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    meta: {
      forceQuietHours: Boolean(input.forceQuietHours),
      withinServiceHours: isWithinRouteOwnerSmsServiceHours(now)
    }
  });

  if (!sent.ok) {
    throw new Error(sent.error || "Twilio send failed");
  }

  await supabase
    .from("route_owner_tracking")
    .update({
      link_sent_at: now.toISOString(),
      sms_alerts_enabled: true
    })
    .eq("id", row.id);

  await writeRouteAuditEvent({
    action: "route_generator.owner_tracking_link_resent",
    entityType: "route_owner_tracking",
    entityId: String(row.id),
    actorAdminId: input.actor.adminId,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    newValue: { to: phone, forceQuietHours: Boolean(input.forceQuietHours) }
  });

  return { ok: true, trackUrl: url, to: phone };
}

export async function clearOwnerTrackingNotified(input: {
  trackingId: string;
  stage: "30" | "15" | "pullup" | "link" | "all";
  actor: Actor;
}) {
  const supabase = getServiceSupabase();
  const { data: row, error } = await supabase
    .from("route_owner_tracking")
    .select("*")
    .eq("id", input.trackingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Tracking row not found.");

  const patch: Record<string, unknown> = {};
  if (input.stage === "30" || input.stage === "all") patch.notified_30_at = null;
  if (input.stage === "15" || input.stage === "all") patch.notified_15_at = null;
  if (input.stage === "pullup" || input.stage === "all") patch.notified_pullup_at = null;
  if (input.stage === "link" || input.stage === "all") patch.link_sent_at = null;

  const { error: updateError } = await supabase
    .from("route_owner_tracking")
    .update(patch)
    .eq("id", input.trackingId);
  if (updateError) throw new Error(updateError.message);

  await recordOwnerSmsEvent({
    trackingId: input.trackingId,
    planId: String(row.plan_id),
    operatingDate: String(row.operating_date).slice(0, 10),
    kind: "clear_notified",
    toE164: row.owner_phone_e164 ? String(row.owner_phone_e164) : null,
    ok: true,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    meta: { stage: input.stage, cleared: Object.keys(patch) }
  });

  await writeRouteAuditEvent({
    action: "route_generator.owner_tracking_notified_cleared",
    entityType: "route_owner_tracking",
    entityId: input.trackingId,
    actorAdminId: input.actor.adminId,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    newValue: { stage: input.stage }
  });

  return { ok: true, cleared: Object.keys(patch) };
}

export async function cancelOwnerTracking(input: { trackingId: string; actor: Actor }) {
  const supabase = getServiceSupabase();
  const { data: row, error } = await supabase
    .from("route_owner_tracking")
    .select("*")
    .eq("id", input.trackingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Tracking row not found.");

  const { error: updateError } = await supabase
    .from("route_owner_tracking")
    .update({ status: "cancelled", sms_alerts_enabled: false })
    .eq("id", input.trackingId);
  if (updateError) throw new Error(updateError.message);

  await recordOwnerSmsEvent({
    trackingId: input.trackingId,
    planId: String(row.plan_id),
    operatingDate: String(row.operating_date).slice(0, 10),
    kind: "cancel",
    toE164: row.owner_phone_e164 ? String(row.owner_phone_e164) : null,
    ok: true,
    actorEmail: input.actor.email,
    actorRole: input.actor.role
  });

  await writeRouteAuditEvent({
    action: "route_generator.owner_tracking_cancelled",
    entityType: "route_owner_tracking",
    entityId: input.trackingId,
    actorAdminId: input.actor.adminId,
    actorEmail: input.actor.email,
    actorRole: input.actor.role
  });

  return { ok: true };
}
