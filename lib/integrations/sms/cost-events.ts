import { getServiceSupabase } from "@/lib/supabase/server";
import { estimateSmsSegments } from "@/lib/integrations/sms/estimate-segments";

export type SmsCostCategory =
  | "CLIENT_ROUTE_TRACKING_LINK"
  | "CLIENT_ROUTE_30"
  | "CLIENT_ROUTE_15"
  | "CLIENT_ROUTE_PULLUP"
  | "CLIENT_RUFFLY_REVIEW"
  | "CLIENT_RUFFLY_REPLY"
  | "CLIENT_TRANSACTIONAL"
  | "ADMIN_CRITICAL"
  | "ADMIN_OPERATIONAL"
  | "ADMIN_ROUTINE"
  | "VIP_REBOOK"
  | "TEST"
  | "OTHER";

export type SmsCostMetadata = {
  category: SmsCostCategory;
  templateKey?: string;
  multiSegmentFlag?: boolean;
};

const DEFAULT_SEGMENT_COST_USD = 0.0083;

function segmentCostUsd(): number {
  const raw = process.env.SMS_SEGMENT_COST_USD?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SEGMENT_COST_USD;
}

export function estimateSmsCostUsd(segments: number): number {
  return Math.round(segments * segmentCostUsd() * 10000) / 10000;
}

export type RecordSmsCostEventInput = {
  body: string;
  category: SmsCostCategory;
  templateKey?: string;
  idempotencyKey?: string;
  multiSegmentFlag?: boolean;
};

export async function recordSmsCostEventBeforeSend(
  input: RecordSmsCostEventInput
): Promise<{ eventId: string | null; estimate: ReturnType<typeof estimateSmsSegments> }> {
  const estimate = estimateSmsSegments(input.body);
  const multiSegment =
    Boolean(input.multiSegmentFlag) ||
    (estimate.segments > 1 && input.category !== "ADMIN_CRITICAL");

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("sms_cost_events")
      .insert({
        category: input.category,
        template_key: input.templateKey ?? null,
        encoding: estimate.encoding,
        estimated_segments: estimate.segments,
        estimated_cost: estimateSmsCostUsd(estimate.segments),
        multi_segment: multiSegment,
        idempotency_key: input.idempotencyKey ?? null,
        status: "queued"
      })
      .select("id")
      .maybeSingle();
    if (error) return { eventId: null, estimate };
    return { eventId: data?.id ? String(data.id) : null, estimate };
  } catch {
    return { eventId: null, estimate };
  }
}

export async function updateSmsCostEventAfterSend(input: {
  eventId: string | null;
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}) {
  if (!input.eventId) return;
  try {
    const supabase = getServiceSupabase();
    await supabase
      .from("sms_cost_events")
      .update({
        status: input.ok ? "sent" : "failed",
        provider_message_sid: input.providerMessageId ?? null,
        reconcile_error: input.ok ? null : input.error?.slice(0, 240) ?? null
      })
      .eq("id", input.eventId);
  } catch {
    // Telemetry must never block SMS delivery.
  }
}

export type SmsCostDashboardDay = {
  date: string;
  sends: number;
  estimatedSegments: number;
  actualSegments: number | null;
  estimatedSpend: number;
  actualSpend: number | null;
  multiSegmentPct: number;
  byCategory: Record<string, { sends: number; estimatedSegments: number; actualSegments: number | null }>;
  segmentBuckets: { one: number; two: number; three: number; fourPlus: number };
  topTemplates: Array<{ templateKey: string; totalSegments: number; sends: number }>;
};

function pacificDateIso(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(date);
}

function bucketSegments(segments: number): "one" | "two" | "three" | "fourPlus" {
  if (segments <= 1) return "one";
  if (segments === 2) return "two";
  if (segments === 3) return "three";
  return "fourPlus";
}

function categoryGroup(category: string): string {
  if (category.startsWith("CLIENT_ROUTE")) return "Client Route";
  if (category.startsWith("CLIENT_RUFFLY") || category === "CLIENT_TRANSACTIONAL") return "Ruffly";
  if (category.startsWith("ADMIN")) return "Admin";
  return "Other";
}

export async function buildSmsCostDashboardForDate(date = pacificDateIso()): Promise<SmsCostDashboardDay> {
  const supabase = getServiceSupabase();
  const start = `${date}T00:00:00-08:00`;
  const end = `${date}T23:59:59-08:00`;

  const { data: rows } = await supabase
    .from("sms_cost_events")
    .select("category, template_key, estimated_segments, actual_segments, estimated_cost, actual_cost, multi_segment, status")
    .gte("created_at", start)
    .lte("created_at", end)
    .in("status", ["sent", "delivered", "undelivered"]);

  const events = rows ?? [];
  const segmentBuckets = { one: 0, two: 0, three: 0, fourPlus: 0 };
  const byCategory: SmsCostDashboardDay["byCategory"] = {};
  const templateMap = new Map<string, { totalSegments: number; sends: number }>();

  let estimatedSegments = 0;
  let actualSegments = 0;
  let hasActual = false;
  let estimatedSpend = 0;
  let actualSpend = 0;
  let hasActualSpend = false;
  let multiSegmentCount = 0;

  for (const row of events) {
    const est = Number(row.estimated_segments) || 0;
    const act = row.actual_segments == null ? null : Number(row.actual_segments);
    const estCost = Number(row.estimated_cost) || 0;
    const actCost = row.actual_cost == null ? null : Number(row.actual_cost);
    const cat = String(row.category || "OTHER");
    const group = categoryGroup(cat);

    estimatedSegments += est;
    estimatedSpend += estCost;
    if (row.multi_segment) multiSegmentCount += 1;

    const bucket = bucketSegments(act ?? est);
    segmentBuckets[bucket] += 1;

    if (!byCategory[group]) {
      byCategory[group] = { sends: 0, estimatedSegments: 0, actualSegments: null };
    }
    byCategory[group].sends += 1;
    byCategory[group].estimatedSegments += est;
    if (act != null) {
      byCategory[group].actualSegments = (byCategory[group].actualSegments ?? 0) + act;
    }

    const templateKey = row.template_key ? String(row.template_key) : cat;
    const prev = templateMap.get(templateKey) ?? { totalSegments: 0, sends: 0 };
    prev.totalSegments += act ?? est;
    prev.sends += 1;
    templateMap.set(templateKey, prev);

    if (act != null) {
      actualSegments += act;
      hasActual = true;
    }
    if (actCost != null) {
      actualSpend += actCost;
      hasActualSpend = true;
    }
  }

  const topTemplates = [...templateMap.entries()]
    .map(([templateKey, stats]) => ({ templateKey, ...stats }))
    .sort((a, b) => b.totalSegments - a.totalSegments)
    .slice(0, 8);

  return {
    date,
    sends: events.length,
    estimatedSegments,
    actualSegments: hasActual ? actualSegments : null,
    estimatedSpend: Math.round(estimatedSpend * 100) / 100,
    actualSpend: hasActualSpend ? Math.round(actualSpend * 100) / 100 : null,
    multiSegmentPct: events.length ? Math.round((multiSegmentCount / events.length) * 1000) / 10 : 0,
    byCategory,
    segmentBuckets,
    topTemplates
  };
}

export type SmsCostThresholds = {
  dailySegmentWarning: number;
  dailySegmentCritical: number;
  dailyDollarWarning: number;
};

const DEFAULT_THRESHOLDS: SmsCostThresholds = {
  dailySegmentWarning: 250,
  dailySegmentCritical: 400,
  dailyDollarWarning: 2.5
};

export async function loadSmsCostThresholds(): Promise<SmsCostThresholds> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("admin_settings")
      .select("settings->sms_cost_thresholds")
      .eq("id", "default")
      .maybeSingle();
    const raw = (data as { sms_cost_thresholds?: Partial<SmsCostThresholds> } | null)?.sms_cost_thresholds;
    return {
      dailySegmentWarning: Number(raw?.dailySegmentWarning) || DEFAULT_THRESHOLDS.dailySegmentWarning,
      dailySegmentCritical: Number(raw?.dailySegmentCritical) || DEFAULT_THRESHOLDS.dailySegmentCritical,
      dailyDollarWarning: Number(raw?.dailyDollarWarning) || DEFAULT_THRESHOLDS.dailyDollarWarning
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export async function saveSmsCostThresholds(thresholds: Partial<SmsCostThresholds>): Promise<SmsCostThresholds> {
  const current = await loadSmsCostThresholds();
  const next = { ...current, ...thresholds };
  const supabase = getServiceSupabase();
  await supabase.rpc("patch_admin_settings_json", {
    p_key: "sms_cost_thresholds",
    p_value: next
  });
  return next;
}
