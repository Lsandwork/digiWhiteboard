import { createOpsNotification } from "@/lib/ops-command-center/notifications";
import {
  buildSmsCostDashboardForDate,
  loadSmsCostThresholds,
  type SmsCostThresholds
} from "@/lib/integrations/sms/cost-events";

function pacificDateIso(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(date);
}

/** One in-app Super Admin alert per threshold per Pacific day — never SMS about SMS cost. */
export async function checkSmsCostThresholds(date = pacificDateIso()): Promise<{ alertsCreated: number }> {
  const [dashboard, thresholds] = await Promise.all([buildSmsCostDashboardForDate(date), loadSmsCostThresholds()]);
  let alertsCreated = 0;

  const checks: Array<{
    key: string;
    crossed: boolean;
    title: string;
    body: string;
    priority: "attention" | "critical";
  }> = [
    {
      key: `sms-cost:segments:warning:${date}`,
      crossed: dashboard.estimatedSegments >= thresholds.dailySegmentWarning,
      title: "SMS segment usage warning",
      body: `Estimated ${dashboard.estimatedSegments} SMS segments today (warning threshold ${thresholds.dailySegmentWarning}). Review Ops Command Center SMS cost card.`,
      priority: "attention"
    },
    {
      key: `sms-cost:segments:critical:${date}`,
      crossed: dashboard.estimatedSegments >= thresholds.dailySegmentCritical,
      title: "SMS segment usage critical",
      body: `Estimated ${dashboard.estimatedSegments} SMS segments today (critical threshold ${thresholds.dailySegmentCritical}). Review templates and duplicate sends.`,
      priority: "critical"
    },
    {
      key: `sms-cost:dollars:warning:${date}`,
      crossed: dashboard.estimatedSpend >= thresholds.dailyDollarWarning,
      title: "SMS spend warning",
      body: `Estimated $${dashboard.estimatedSpend.toFixed(2)} SMS spend today (warning threshold $${thresholds.dailyDollarWarning.toFixed(2)}).`,
      priority: "attention"
    }
  ];

  for (const check of checks) {
    if (!check.crossed) continue;
    const created = await createOpsNotification({
      roleKey: "admin",
      alertKey: check.key,
      dedupeKey: check.key,
      title: check.title,
      body: check.body,
      priority: check.priority,
      hrefTab: "ops_command_center",
      hrefPath: "/admin?board=staff&tab=ops_command_center",
      payload: { kind: "sms_cost_threshold", date, thresholds: thresholds as SmsCostThresholds }
    });
    if (created) alertsCreated += 1;
  }

  return { alertsCreated };
}
