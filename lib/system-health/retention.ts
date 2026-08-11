/** Retention cleanup for System Health tables (safe deletes by age). */

import { getServiceSupabase } from "@/lib/supabase/server";
import { loadSystemHealthSettings } from "@/lib/system-health/settings";

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function runSystemHealthRetentionCleanup() {
  const settings = await loadSystemHealthSettings();
  const supabase = getServiceSupabase();
  const results: Record<string, string> = {};

  const jobs: Array<{ table: string; column: string; days: number }> = [
    { table: "system_health_events", column: "occurred_at", days: settings.retentionEventsDays },
    { table: "system_health_api_logs", column: "occurred_at", days: settings.retentionApiLogsDays },
    { table: "system_health_route_audits", column: "started_at", days: settings.retentionRouteAuditsDays },
    { table: "system_health_errors", column: "last_occurrence_at", days: settings.retentionErrorsDays },
    { table: "system_health_integration_calls", column: "occurred_at", days: settings.retentionApiLogsDays },
    { table: "system_health_service_checks", column: "checked_at", days: Math.min(30, settings.retentionEventsDays) },
    { table: "system_health_debug_access_logs", column: "occurred_at", days: settings.retentionEventsDays }
  ];

  for (const job of jobs) {
    try {
      const { error } = await supabase.from(job.table).delete().lt(job.column, daysAgoIso(job.days));
      results[job.table] = error ? error.message : "ok";
    } catch (error) {
      results[job.table] = error instanceof Error ? error.message : "failed";
    }
  }
  return results;
}
