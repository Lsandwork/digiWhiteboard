import { getServiceSupabase } from "@/lib/supabase/server";
import { isSamsaraLiveConfigured } from "@/lib/route-generator/samsara-live";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { loadSystemHealthAudit, toOverviewSystemHealth } from "@/lib/admin/system-health-audit";
import { evaluateGingrHealth } from "@/lib/ops-command-center/gingr-health";
import { probeCloudStorage } from "@/lib/system-health/probes/storage";
import {
  getHungTableSupabase,
  HUNG_TABLES,
  isHungQueryError,
  isHungTableInCooldown,
  markHungTableTimeout
} from "@/lib/hung-table-guard";

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

function mapProbeStatus(status: string): IntegrationHealthRow["status"] {
  if (status === "HEALTHY") return "operational";
  if (status === "WARNING" || status === "DEGRADED") return "degraded";
  if (status === "FAILED") return "down";
  return "unknown";
}

export async function buildOpsSystemHealth() {
  const supabase = getServiceSupabase({ timeoutMs: 3_000 });
  const hung = getHungTableSupabase();

  const queryHung = async <T,>(
    table: string,
    work: () => PromiseLike<{ data?: T | null; error?: { message?: string } | null; count?: number | null }>
  ) => {
    if (isHungTableInCooldown(table)) {
      return { data: null as T | null, count: 0, timedOut: true };
    }
    try {
      const row = await work();
      if (row.error && isHungQueryError(row.error)) {
        markHungTableTimeout(table);
        return { data: null as T | null, count: 0, timedOut: true };
      }
      return { data: row.data ?? null, count: row.count ?? 0, timedOut: false };
    } catch (error) {
      if (isHungQueryError(error)) markHungTableTimeout(table);
      return { data: null as T | null, count: 0, timedOut: true };
    }
  };

  const [webhook, lastDogSeen, audit, boardCount, storage] = await Promise.all([
    queryHung<{ created_at: string | null; processing_error: string | null }>(HUNG_TABLES.gingrWebhookEvents, () =>
      hung
        .from("gingr_webhook_events")
        .select("created_at, processing_error")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    queryHung<{ last_seen_from_gingr_at: string | null }>(HUNG_TABLES.liveTransitionDogs, () =>
      hung
        .from("live_transition_dogs")
        .select("last_seen_from_gingr_at")
        .not("last_seen_from_gingr_at", "is", null)
        .order("last_seen_from_gingr_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    loadSystemHealthAudit(supabase).catch(() => null),
    queryHung(HUNG_TABLES.liveTransitionDogs, () =>
      hung.from("live_transition_dogs").select("id", { count: "exact", head: true }).eq("hidden", false) as PromiseLike<{
        data?: null;
        error?: { message?: string } | null;
        count?: number | null;
      }>
    ),
    probeCloudStorage(supabase).catch(() => null)
  ]);

  const gingr = evaluateGingrHealth({
    lastWebhookAt: webhook.data?.created_at ? String(webhook.data.created_at) : null,
    lastDogSeenAt: lastDogSeen.data?.last_seen_from_gingr_at
      ? String(lastDogSeen.data.last_seen_from_gingr_at)
      : null,
    probeTimedOut: webhook.timedOut || lastDogSeen.timedOut
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
      status: storage ? mapProbeStatus(storage.status) : "unknown",
      detail: storage ? storage.detail : "Cloud storage probe unavailable.",
      lastSuccessAt: storage?.lastSuccessAt || storage?.recentMediaAt || null
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
      "Webhook URL must be https://fitdog.ruffops.com/api/gingr/webhook (or your staff host).",
      "Cloud storage probes Supabase buckets: photo-uploads, cast-videos, cast-tv-media, lobby-slideshow."
    ]
  };
}
