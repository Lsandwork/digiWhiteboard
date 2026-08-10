import { getServiceSupabase } from "@/lib/supabase/server";
import { isSamsaraLiveConfigured } from "@/lib/route-generator/samsara-live";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { loadSystemHealthAudit, toOverviewSystemHealth } from "@/lib/admin/system-health-audit";

export type IntegrationHealthRow = {
  id: string;
  label: string;
  status: "operational" | "degraded" | "down" | "unknown";
  detail: string;
  lastSuccessAt: string | null;
};

export async function buildOpsSystemHealth() {
  const supabase = getServiceSupabase();
  const [webhook, audit, boardCount] = await Promise.all([
    supabase
      .from("gingr_webhook_events")
      .select("created_at, processing_error")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadSystemHealthAudit(supabase).catch(() => null),
    supabase
      .from("live_transition_dogs")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
  ]);

  const lastWebhookAt = webhook.data?.created_at ? String(webhook.data.created_at) : null;
  const webhookAge = lastWebhookAt ? Date.now() - new Date(lastWebhookAt).getTime() : null;
  const gingrStatus =
    webhookAge == null ? "unknown" : webhookAge <= 15 * 60_000 ? "operational" : webhookAge <= 60 * 60_000 ? "degraded" : "down";

  const sms = getSmsProvider();
  const integrations: IntegrationHealthRow[] = [
    {
      id: "gingr",
      label: "Gingr",
      status: gingrStatus,
      detail:
        webhookAge == null
          ? "No webhook events yet"
          : webhookAge > 15 * 60_000
            ? `Gingr synchronization delayed — last successful webhook ${Math.round(webhookAge / 60000)} minutes ago.`
            : `Last webhook ${Math.round((webhookAge || 0) / 60000)} minute(s) ago.`,
      lastSuccessAt: lastWebhookAt
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
      status: gingrStatus,
      detail: webhook.data?.processing_error
        ? `Last event had processing_error (details withheld if sensitive).`
        : "Recent webhook intake healthy or idle.",
      lastSuccessAt: lastWebhookAt
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    integrations,
    boardHealth: audit ? toOverviewSystemHealth(audit) : null,
    notes: [
      "Secrets and API keys are never returned by this endpoint.",
      "Gingr remains authoritative for reservations, packages, and payments.",
      "If Gingr sync is delayed, treat Gingr-dependent fields as potentially stale."
    ]
  };
}
