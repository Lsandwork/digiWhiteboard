"use client";

import { useState } from "react";
import { CheckCircle2, Database, RefreshCw, Shield, XCircle } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";

type IntegrationsPanelProps = {
  dataSource: string;
  lastSyncedAt: string | null;
  webhookUrl: string;
  syncStatus: string;
  failedEventsCount: number;
};

export function IntegrationsPanel({
  dataSource,
  lastSyncedAt,
  webhookUrl,
  syncStatus,
  failedEventsCount
}: IntegrationsPanelProps) {
  const { showToast } = useToast();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "error">("idle");

  async function testConnection() {
    setTesting(true);
    setTestResult("idle");
    try {
      const response = await fetch("/api/admin/refresh", { method: "POST" });
      if (!response.ok) throw new Error("Connection test failed.");
      setTestResult("ok");
      showToast("Supabase connection is healthy.", "success");
    } catch {
      setTestResult("error");
      showToast("Connection test failed.", "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Integrations</h2>
          <p className="admin-page-subtitle">Monitor how your whiteboards connect to cached data. This dashboard never calls Gingr directly.</p>
        </div>
      </header>

      <section className="admin-card p-5">
        <div className="flex items-start gap-3">
          <Database className="mt-1 h-5 w-5 text-fitdog-orange" />
          <div className="flex-1">
            <h3 className="admin-section-title">Supabase (Primary Data Source)</h3>
            <p className="admin-section-helper">All board data is read from Supabase cached tables in read-only mode.</p>
            <dl className="admin-kv-grid mt-4">
              <div><dt>Status</dt><dd><span className={`admin-badge ${syncStatus === "healthy" ? "admin-badge--green" : "admin-badge--amber"}`}>{syncStatus}</span></dd></div>
              <div><dt>Mode</dt><dd>{dataSource}</dd></div>
              <div><dt>Last sync</dt><dd>{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Unknown"}</dd></div>
            </dl>
            <button type="button" className="admin-btn-secondary mt-4 inline-flex items-center gap-2" onClick={() => void testConnection()} disabled={testing}>
              <RefreshCw className={`h-4 w-4 ${testing ? "animate-spin" : ""}`} />
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult === "ok" ? <p className="mt-2 text-sm text-emerald-300">Connection test passed.</p> : null}
            {testResult === "error" ? <p className="mt-2 text-sm text-red-300">Connection test failed. Check Supabase credentials.</p> : null}
          </div>
        </div>
      </section>

      <section className="admin-card p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-1 h-5 w-5 text-sky-400" />
          <div className="flex-1">
            <h3 className="admin-section-title">Gingr Sync (Cached / Read-only)</h3>
            <p className="admin-section-helper">
              Gingr data flows into Supabase via webhooks and scheduled sync. Display boards and this admin panel only read cached data — they never hit www.fitdog.gingrapp.com directly.
            </p>
            <dl className="admin-kv-grid mt-4">
              <div><dt>Webhook URL</dt><dd className="break-all font-mono text-xs">{webhookUrl}</dd></div>
              <div><dt>Failed webhook events</dt><dd>{failedEventsCount}</dd></div>
              <div><dt>Direct Gingr calls from admin</dt><dd>Disabled (by design)</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="admin-card p-5">
        <h3 className="admin-section-title">Integration Health</h3>
        <ul className="mt-4 space-y-3">
          <HealthRow ok label="Supabase read access" detail="Service role can read cached board data." />
          <HealthRow ok={failedEventsCount === 0} label="Webhook processing" detail={failedEventsCount === 0 ? "All recent events processed." : `${failedEventsCount} events need attention.`} />
          <HealthRow ok label="Read-only sync mode" detail="No write operations to Gingr from display UI." />
        </ul>
      </section>
    </div>
  );
}

function HealthRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-admin-border px-4 py-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /> : <XCircle className="mt-0.5 h-5 w-5 text-amber-400" />}
      <div>
        <p className="font-semibold text-white">{label}</p>
        <p className="text-sm text-admin-muted">{detail}</p>
      </div>
    </li>
  );
}
