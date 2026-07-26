import { getServiceSupabase } from "@/lib/supabase/server";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";

/**
 * Grouped management alerts for tracking health. Uses a stable sourceId to limit duplicates.
 */
export async function alertTrackingIssue(params: {
  sessionId: string;
  title: string;
  body: string;
  kind: string;
}) {
  try {
    const supabase = getServiceSupabase();
    await dispatchStaffOpsNotificationEvent(supabase, {
      eventType: "created",
      sourceTable: "transport_tracking_sessions",
      sourceId: `${params.sessionId}:${params.kind}`,
      sourceTab: "route_generator",
      title: params.title,
      body: params.body,
      priority: "High",
      urgent: true,
      needsManagementReview: true,
      actor: "Live Tracking"
    });
  } catch {
    // Non-fatal when notification store is unavailable.
  }
}
