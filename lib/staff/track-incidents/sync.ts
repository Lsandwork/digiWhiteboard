type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import type { GingrWebhookPayload } from "@/lib/gingr";
import { upsertIncidentFromGingrWebhook } from "./store";
import type { TrackIncidentSyncRun, TrackIncidentSyncTrigger } from "./types";

/** Manual sync cooldown — protects Gingr/webhook inbox processing from button spam. */
export const MANUAL_SYNC_COOLDOWN_MS = 45_000;
const MAX_EVENTS_PER_SYNC = 200;

function mapSyncRun(row: Record<string, unknown>): TrackIncidentSyncRun {
  return {
    id: String(row.id),
    trigger: row.trigger as TrackIncidentSyncTrigger,
    status: row.status as TrackIncidentSyncRun["status"],
    started_at: String(row.started_at),
    finished_at: row.finished_at != null ? String(row.finished_at) : null,
    imported_count: Number(row.imported_count ?? 0),
    updated_count: Number(row.updated_count ?? 0),
    skipped_count: Number(row.skipped_count ?? 0),
    error_count: Number(row.error_count ?? 0),
    message: row.message != null ? String(row.message) : null
  };
}

export function isPacificFiveAm(now = new Date()): boolean {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false
  }).format(now);
  // en-US hour12:false can return "24" for midnight in some engines; 5 means 5am.
  return hour === "5" || hour === "05";
}

export async function getLatestSyncRun(supabase: SupabaseClient): Promise<TrackIncidentSyncRun | null> {
  const { data, error } = await supabase
    .from("track_incident_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSyncRun(data as Record<string, unknown>) : null;
}

export async function listRecentSyncRuns(supabase: SupabaseClient, limit = 20): Promise<TrackIncidentSyncRun[]> {
  const { data, error } = await supabase
    .from("track_incident_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapSyncRun(row as Record<string, unknown>));
}

/**
 * Catch-up sync from locally stored Gingr incident webhooks.
 * Does not call Gingr HTTP APIs (there is no public incidents endpoint).
 * Safe for site performance: bounded batch, single DB read pass, upserts only.
 */
export async function syncIncidentsFromWebhookInbox(
  supabase: SupabaseClient,
  options: {
    trigger: TrackIncidentSyncTrigger;
    actorUserId?: string | null;
    force?: boolean;
  }
): Promise<TrackIncidentSyncRun> {
  if (options.trigger === "manual" && !options.force) {
    const { data: recent } = await supabase
      .from("track_incident_sync_runs")
      .select("started_at, status")
      .eq("trigger", "manual")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.started_at) {
      const age = Date.now() - new Date(String(recent.started_at)).getTime();
      if (age < MANUAL_SYNC_COOLDOWN_MS && recent.status !== "failed") {
        const { data: skipped } = await supabase
          .from("track_incident_sync_runs")
          .insert({
            trigger: "manual",
            status: "skipped",
            finished_at: new Date().toISOString(),
            message: `Manual sync cooling down. Try again in ${Math.ceil((MANUAL_SYNC_COOLDOWN_MS - age) / 1000)}s.`,
            actor_user_id: options.actorUserId ?? null
          })
          .select("*")
          .single();
        return mapSyncRun((skipped ?? recent) as Record<string, unknown>);
      }
    }
  }

  const { data: runRow, error: runError } = await supabase
    .from("track_incident_sync_runs")
    .insert({
      trigger: options.trigger,
      status: "running",
      actor_user_id: options.actorUserId ?? null
    })
    .select("*")
    .single();
  if (runError) throw new Error(runError.message);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const { data: events, error } = await supabase
      .from("gingr_webhook_events")
      .select("id, webhook_type, entity_id, payload, created_at")
      .in("webhook_type", ["incident_created", "incident_edited"])
      .order("created_at", { ascending: true })
      .limit(MAX_EVENTS_PER_SYNC);
    if (error) throw new Error(error.message);

    for (const event of events ?? []) {
      const entityId = String(event.entity_id ?? "");
      if (!/^\d+$/.test(entityId)) {
        skipped += 1;
        continue;
      }
      try {
        const result = await upsertIncidentFromGingrWebhook(
          supabase,
          event.payload as GingrWebhookPayload,
          String(event.id)
        );
        if (!result) {
          skipped += 1;
          continue;
        }
        if (result.created) imported += 1;
        else updated += 1;
        // Mark event processed after successful ledger upsert (even if signature was previously invalid).
        await supabase
          .from("gingr_webhook_events")
          .update({ processed: true, processing_error: null })
          .eq("id", event.id);
      } catch {
        errors += 1;
      }
    }

    const message =
      options.trigger === "cron"
        ? "Daily 5:00 AM Pacific catch-up from Gingr incident webhooks."
        : "Live sync from Gingr incident webhook inbox (no Gingr API scrape).";

    const { data: finished, error: finishError } = await supabase
      .from("track_incident_sync_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        imported_count: imported,
        updated_count: updated,
        skipped_count: skipped,
        error_count: errors,
        message,
        metadata: {
          event_count: events?.length ?? 0,
          max_batch: MAX_EVENTS_PER_SYNC,
          gingr_http_calls: 0
        }
      })
      .eq("id", runRow.id)
      .select("*")
      .single();
    if (finishError) throw new Error(finishError.message);
    return mapSyncRun(finished as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Incident sync failed.";
    const { data: failed } = await supabase
      .from("track_incident_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        imported_count: imported,
        updated_count: updated,
        skipped_count: skipped,
        error_count: errors + 1,
        message
      })
      .eq("id", runRow.id)
      .select("*")
      .single();
    if (failed) return mapSyncRun(failed as Record<string, unknown>);
    throw error;
  }
}
