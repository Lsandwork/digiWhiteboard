import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import type { OperationsAlert } from "@/lib/fitdog-ops/types";
import { formatUsd } from "@/lib/fitdog-ops/money";

function priorityForAlert(alert: OperationsAlert) {
  if (alert.severity === "critical") return "Critical" as const;
  if (alert.severity === "high") return "High" as const;
  if (alert.severity === "low") return "Low" as const;
  return "Medium" as const;
}

export async function notifyFitdogPaymentAlert(
  supabase: SupabaseClient,
  alert: OperationsAlert,
  kind: "created" | "resolved" = "created"
) {
  try {
    const title =
      kind === "resolved"
        ? `Payment resolved · ${alert.owner_name}`
        : `${alert.alert_type.replaceAll("_", " ")} · ${alert.owner_name}`;
    const body = [
      alert.dog_name ? `Dog: ${alert.dog_name}` : null,
      alert.service_name ? `Service: ${alert.service_name}` : null,
      `Amount: ${formatUsd(alert.amount_due, alert.currency)}`,
      alert.failure_reason ? `Reason: ${alert.failure_reason}` : null
    ]
      .filter(Boolean)
      .join(" · ");

    await dispatchStaffOpsNotificationEvent(supabase, {
      eventType: kind === "resolved" ? "updated" : "created",
      sourceTable: "operations_alerts",
      sourceId: alert.id,
      sourceTab: "fitdog_alerts",
      title,
      body,
      priority: priorityForAlert(alert),
      urgent: alert.severity === "critical",
      needsManagementReview: alert.severity === "critical" || alert.severity === "high",
      assignedTo: alert.assigned_user_name,
      actor: "Fitdog Sync"
    });
  } catch {
    // Notification store must never block payment alert persistence.
  }
}
