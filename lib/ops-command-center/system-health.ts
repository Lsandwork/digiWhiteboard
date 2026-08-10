import { getServiceSupabase } from "@/lib/supabase/server";
import { isSamsaraLiveConfigured } from "@/lib/route-generator/samsara-live";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { loadSystemHealthAudit, toOverviewSystemHealth } from "@/lib/admin/system-health-audit";
import { evaluateGingrHealth } from "@/lib/ops-command-center/gingr-health";

export type IntegrationHealthRow = {
  id: string;
  label: string;
  status: "operational" | "degraded" | "down" | "unknown";
  detail: string;
  lastSuccessAt: string | null;
};

function mapGingrStatus(status: ReturnType<typeof evaluateGingrHealth>["status"]) {
  if (status === "healthy") return "operational" as const;
  if (status === "degraded") return "degraded" as const;
  if (status === "offline") return "down" as const;
  return "unknown" as const;
}

export async function buildOpsSystemHealth() {
  const supabase = getServiceSupabase();
  const [webhook, lastDogSeen, audit, boardCount] = await Promise.all([
    supabase
      .from("gingr_webhook_events")
      .select("created_at, processing_error")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("live_transition_dogs")
      .select("last_seen_from_gingr_at")
      .not("last_seen_from_gingr_at", "is", null)
      .order("last_seen_from_gingr_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadSystemHealthAudit(supabase).catch(() => null),
    supabase
      .from("live_transition_dogs")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
  ]);

  const gingr = evaluateGingrHealth({
    lastWebhookAt: webhook.data?.created_at ? String(webhook.data.created_at) : null,
    lastDogSeenAt: lastDogSeen.data?.last_seen_from_gingr_at
      ? String(lastDogSeen.data.last_seen_from_gingr_at)
      : null
  });

  const sms = getSmsProvider();
  const integrations: IntegrationHealthRow[] = [
    {
      id: "gingr",
      label: "Gingr",
      status: mapGingrStatus(gingr.status),
      detail: gingr.detail,
      lastSuccessAt: gingr.freshestAt
    },
    {
      id: "samsara",
      label: "Samsara",
      status: isSamsaraLiveConfigured() ? "operational" : "unknown",
      detail: isSamsaraLiveConfigured()
        ? "Live GPS configured (secrets not exposed)."
        : "Samsara live GPS not configured in this environment.",
      lastSuccessAt: null
    },
    {
      id: "twilio",
      label: "Twilio",
      status: sms.isConfigured() ? "operational" : "unknown",
      detail: sms.isConfigured()
        ? "SMS provider configured (credentials never shown)."
        : "Twilio is not configured.",
      lastSuccessAt: null
    },
    {
      id: "storage",
      label: "RuffOps Cloud Storage",
      status: process.env.MEDIA_LIBRARY_BUCKET || process.env.SUPABASE_URL ? "operational" : "unknown",
      detail: "Media metadata in DB; binaries should remain in object storage/CDN.",
      lastSuccessAt: null
    },
    {
      id: "database",
      label: "Database",
      status: "operational",
      detail: `Board has ${boardCount.count ?? 0} visible transition dog row(s).`,
      lastSuccessAt: new Date().toISOString()
    },
    {
      id: "webhooks",
      label: "Webhooks",
      status: mapGingrStatus(
        evaluateGingrHealth({
          lastWebhookAt: webhook.data?.created_at ? String(webhook.data.created_at) : null
        }).status
      ),
      detail: webhook.data?.processing_error
        ? "Last stored webhook reported a processing error (details withheld if sensitive)."
        : gingr.webhookAt
          ? `Last webhook audit row ${gingr.webhookAt}.`
          : "No webhook audit rows yet.",
      lastSuccessAt: gingr.webhookAt
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    integrations,
    boardHealth: audit ? toOverviewSystemHealth(audit) : null,
    notes: [
      "Secrets and API keys are never returned by this endpoint.",
      "Gingr remains authoritative for reservations, packages, and payments.",
      "Connected status uses webhook audit OR live dog sync timestamps — not audit alone.",
      "Webhook URL must be https://fitdog.ruffops.com/api/gingr/webhook (or your staff host)."
    ]
  };
}
