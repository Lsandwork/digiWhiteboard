import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import { isDeclinedPaymentAlert, isPaymentErrorAlert } from "@/lib/fitdog-ops/display";
import type { OperationsAlert } from "@/lib/fitdog-ops/types";
import { formatUsd } from "@/lib/fitdog-ops/money";

function priorityForAlert(alert: OperationsAlert) {
  if (isDeclinedPaymentAlert(alert) || isPaymentErrorAlert(alert) || alert.severity === "critical") {
    return "Critical" as const;
  }
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
    const declined = isDeclinedPaymentAlert(alert);
    const paymentError = isPaymentErrorAlert(alert);
    const title =
      kind === "resolved"
        ? `Payment resolved · ${alert.owner_name}`
        : declined
          ? `Declined Payment · ${alert.owner_name}`
          : paymentError
            ? `Payment Error · ${alert.owner_name}`
            : `${alert.alert_type.replaceAll("_", " ")} · ${alert.owner_name}`;
    const body = [
      alert.dog_name ? `Dog: ${alert.dog_name}` : null,
      alert.service_name ? `Service: ${alert.service_name}` : null,
      `Amount: ${formatUsd(alert.amount_due, alert.currency)}`,
      alert.failure_reason ? `Reason: ${alert.failure_reason}` : null
    ]
      .filter(Boolean)
      .join(" · ");

    // Declined / Payment Error alerts are urgent escalations for admin/management,
    // and are also fanned out personally to Front Desk Coordinators.
    const fanOutFrontDesk = kind === "created" && (declined || paymentError);
    const urgent = kind === "created" && (fanOutFrontDesk || alert.severity === "critical");
    const needsManagementReview =
      kind === "created" && (fanOutFrontDesk || alert.severity === "critical" || alert.severity === "high");

    await dispatchStaffOpsNotificationEvent(supabase, {
      eventType: kind === "resolved" ? "updated" : "created",
      sourceTable: "operations_alerts",
      sourceId: alert.id,
      sourceTab: "fitdog_alerts",
      title,
      body,
      priority: kind === "created" && fanOutFrontDesk ? "Critical" : priorityForAlert(alert),
      urgent,
      needsManagementReview,
      assignedTo: alert.assigned_user_name,
      toDepartment: fanOutFrontDesk ? "Front Desk" : null,
      notifyFrontDeskCoordinators: fanOutFrontDesk,
      actor: "Fitdog Sync"
    });
  } catch {
    // Notification store must never block payment alert persistence.
  }
}
