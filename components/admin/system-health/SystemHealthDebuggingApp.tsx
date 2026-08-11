"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SectionId =
  | "overview"
  | "live"
  | "errors"
  | "route_audits"
  | "integrations"
  | "api_logs"
  | "jobs"
  | "user_activity"
  | "system_events"
  | "debug_search"
  | "cursor_bridge"
  | "settings";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live Activity" },
  { id: "errors", label: "Errors" },
  { id: "route_audits", label: "Route Audits" },
  { id: "integrations", label: "Integrations" },
  { id: "api_logs", label: "API Logs" },
  { id: "jobs", label: "Background Jobs" },
  { id: "user_activity", label: "User Activity" },
  { id: "system_events", label: "System Events" },
  { id: "debug_search", label: "Debug Search" },
  { id: "cursor_bridge", label: "Cursor Debug Bridge" },
  { id: "settings", label: "Settings" }
];

function statusClass(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "HEALTHY" || s === "PASS" || s === "PASSED" || s === "OPERATIONAL") {
    return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
  }
  if (s === "WARNING" || s === "PASS_WITH_WARNINGS") {
    return "bg-amber-500/20 text-amber-100 border-amber-400/30";
  }
  if (s === "DEGRADED") return "bg-orange-500/20 text-orange-100 border-orange-400/30";
  if (s === "FAILED" || s === "FAIL" || s === "ERROR" || s === "CRITICAL") {
    return "bg-rose-500/20 text-rose-100 border-rose-400/30";
  }
  return "bg-white/10 text-admin-muted border-white/10";
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass(value)}`}>
      {value || "UNKNOWN"}
    </span>
  );
}

function Card({
  title,
  value,
  hint,
  onClick
}: {
  title: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
    >
      <p className="text-xs uppercase tracking-wide text-admin-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-admin-muted">{hint}</p> : null}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-admin-muted">{text}</p>;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SystemHealthDebuggingApp() {
  const [section, setSection] = useState<SectionId>("overview");
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [selectedAudit, setSelectedAudit] = useState<string | null>(null);
  const [auditDetail, setAuditDetail] = useState<Record<string, unknown> | null>(null);
  const [sectionData, setSectionData] = useState<unknown>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system-health?view=dashboard", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load System Health");
      setBundle(body);
      setSettingsDraft((body.settings as Record<string, unknown>) || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (section === "overview" || section === "live" || section === "errors" || section === "route_audits" || section === "integrations" || section === "settings" || section === "cursor_bridge") {
      return;
    }
    void (async () => {
      const view =
        section === "api_logs"
          ? "api_logs"
          : section === "jobs"
            ? "jobs"
            : section === "user_activity"
              ? "user_activity"
              : section === "system_events"
                ? "events"
                : null;
      if (!view) return;
      const res = await fetch(`/api/admin/system-health?view=${view}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setSectionData(body.data ?? body);
    })();
  }, [section]);

  useEffect(() => {
    if (!selectedAudit) {
      setAuditDetail(null);
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/admin/system-health?view=route_audit&correlationId=${encodeURIComponent(selectedAudit)}`,
        { cache: "no-store" }
      );
      const body = await res.json();
      if (res.ok) setAuditDetail(body.data ?? body);
    })();
  }, [selectedAudit]);

  const overview = (bundle?.overview as Record<string, unknown>) || null;
  const summary = (overview?.summary as Record<string, unknown>) || {};
  const services = (overview?.services as Array<Record<string, unknown>>) || [];
  const activity = (bundle?.activity as Array<Record<string, unknown>>) || [];
  const errors = (bundle?.errors as Array<Record<string, unknown>>) || [];
  const audits = (bundle?.audits as Array<Record<string, unknown>>) || [];
  const integrations = (bundle?.integrations as Array<Record<string, unknown>>) || [];
  const liveDebug = (bundle?.liveDebug as Array<Record<string, unknown>>) || [];

  const go = (id: SectionId) => setSection(id);

  const runSearch = async () => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", query: search })
    });
    const body = await res.json();
    if (res.ok) setSearchResult(body.data ?? body);
    else setError(body.error || "Search failed");
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_settings", settings: settingsDraft })
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Unable to save settings");
      return;
    }
    setCopyNote("Settings saved");
    void refresh();
  };

  const startLiveDebug = async () => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start_live_debug",
        feature: "route_generator",
        durationMinutes: 30,
        reason: "Temporary elevated diagnostics"
      })
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Unable to start live debug");
      return;
    }
    setCopyNote("Live debug enabled for 30 minutes");
    void refresh();
  };

  const copyDebugContext = async (correlationId: string) => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bug_context", correlationId })
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Unable to build debug context");
      return;
    }
    const text = String(body.text || JSON.stringify(body.data, null, 2));
    const ok = await copyText(text);
    setCopyNote(ok ? "Debug context copied" : "Could not copy — see developer details");
  };

  const headerSubtitle = useMemo(
    () =>
      "Operational observability for RuffOps — real audits, errors, integrations, and Cursor evidence bundles.",
    []
  );

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">System Health &amp; Debugging</h2>
            <p className="mt-1 max-w-3xl text-sm text-admin-muted">{headerSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
            >
              Refresh
            </button>
            {copyNote ? <span className="self-center text-xs text-emerald-300">{copyNote}</span> : null}
          </div>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                section === s.id
                  ? "border-fitdog-orange/50 bg-fitdog-orange/20 text-white"
                  : "border-white/10 bg-white/[0.03] text-admin-muted hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}
      {loading && !bundle ? <Empty text="Loading system health…" /> : null}

      {section === "overview" && overview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="System Health" value={String(summary.systemHealth || "UNKNOWN")} onClick={() => go("integrations")} />
            <Card title="Errors Today" value={Number(summary.errorsToday || 0)} onClick={() => go("errors")} />
            <Card title="Warnings Today" value={Number(summary.warningsToday || 0)} onClick={() => go("live")} />
            <Card title="Failed Jobs" value={Number(summary.failedJobs || 0)} onClick={() => go("jobs")} />
            <Card
              title="Integration Failures"
              value={Number(summary.integrationFailures || 0)}
              onClick={() => go("integrations")}
            />
            <Card
              title="Route Audit Failures"
              value={Number(summary.routeAuditFailures || 0)}
              onClick={() => go("route_audits")}
            />
            <Card title="Users Active" value={Number(summary.usersActive || 0)} onClick={() => go("user_activity")} />
            <Card
              title="Deploy Version"
              value={String(summary.releaseVersion || "—")}
              hint="Recent deploy / commit"
            />
            <Card
              title="Last Route Generation"
              value={summary.lastRouteGeneration ? new Date(String(summary.lastRouteGeneration)).toLocaleString() : "—"}
              onClick={() => go("route_audits")}
            />
            <Card
              title="Last Gingr Sync"
              value={summary.lastGingrSync ? new Date(String(summary.lastGingrSync)).toLocaleString() : "—"}
            />
            <Card
              title="Last Samsara Export"
              value={summary.lastSamsaraExport ? new Date(String(summary.lastSamsaraExport)).toLocaleString() : "—"}
            />
          </div>

          {liveDebug.length ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-100">LIVE DEBUGGING ACTIVE</p>
              <ul className="mt-2 space-y-1 text-sm text-amber-50/90">
                {liveDebug.map((row) => (
                  <li key={String(row.id)}>
                    {String(row.feature)} · expires {row.expires_at ? new Date(String(row.expires_at)).toLocaleString() : "—"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services.map((svc) => (
              <div key={String(svc.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white">{String(svc.label)}</p>
                  <StatusBadge value={String(svc.status || "UNKNOWN")} />
                </div>
                <p className="mt-2 text-sm text-admin-muted">{String(svc.detail || "")}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-admin-muted">
                  <div>
                    <dt>Response</dt>
                    <dd className="text-white">{svc.responseTimeMs != null ? `${svc.responseTimeMs} ms` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Errors 24h</dt>
                    <dd className="text-white">{Number(svc.errorsLast24h || 0)}</dd>
                  </div>
                  <div>
                    <dt>Last success</dt>
                    <dd className="text-white">
                      {svc.lastSuccessAt ? new Date(String(svc.lastSuccessAt)).toLocaleString() : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Success rate</dt>
                    <dd className="text-white">{svc.successRate24h != null ? `${svc.successRate24h}%` : "—"}</dd>
                  </div>
                </dl>
                {svc.lastError ? <p className="mt-2 text-xs text-rose-200">Last error: {String(svc.lastError)}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {section === "live" || section === "user_activity" || section === "system_events" ? (
        <div className="space-y-3">
          {(section === "system_events" && Array.isArray(sectionData)
            ? (sectionData as Array<Record<string, unknown>>)
            : activity
          ).length === 0 ? (
            <Empty text="No diagnostic history available yet." />
          ) : (
            <ul className="space-y-2">
              {(section === "system_events" && Array.isArray(sectionData)
                ? (sectionData as Array<Record<string, unknown>>)
                : activity
              ).map((ev) => (
                <li key={String(ev.id)} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-white">
                      <span className="text-admin-muted">
                        {ev.occurred_at ? new Date(String(ev.occurred_at)).toLocaleTimeString() : "—"}
                      </span>{" "}
                      <span className="font-medium">{String(ev.message || ev.event_type)}</span>
                    </div>
                    <StatusBadge value={String(ev.severity || "info")} />
                  </div>
                  <p className="mt-1 text-xs text-admin-muted">
                    {[ev.user_email, ev.module, ev.correlation_id, ev.integration].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {section === "errors" ? (
        <div className="space-y-3">
          {errors.length === 0 ? (
            <Empty text="No captured errors yet." />
          ) : (
            errors.map((err) => (
              <div key={String(err.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{String(err.error_message)}</p>
                    <p className="mt-1 text-xs text-admin-muted">
                      {String(err.application_module || "app")} · {Number(err.occurrence_count || 1)}× · last{" "}
                      {err.last_occurrence_at ? new Date(String(err.last_occurrence_at)).toLocaleString() : "—"}
                    </p>
                  </div>
                  <StatusBadge value={String(err.status || "unresolved")} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {err.correlation_id ? (
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white"
                      onClick={() => {
                        setSelectedAudit(String(err.correlation_id));
                        go("route_audits");
                      }}
                    >
                      Open related audit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white"
                    onClick={() =>
                      void copyText(
                        `Error ${err.id}\n${err.error_message}\nmodule=${err.application_module}\ncorrelation=${err.correlation_id || ""}`
                      ).then((ok) => setCopyNote(ok ? "Diagnostic summary copied" : "Copy failed"))
                    }
                  >
                    Copy diagnostic summary
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {section === "route_audits" ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-2">
            {audits.length === 0 ? (
              <Empty text="No route audits yet. Generate routes to create the first audit." />
            ) : (
              audits.map((a) => (
                <button
                  key={String(a.id)}
                  type="button"
                  onClick={() => setSelectedAudit(String(a.correlation_id))}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    selectedAudit === a.correlation_id
                      ? "border-fitdog-orange/40 bg-fitdog-orange/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm text-white">{String(a.correlation_id)}</p>
                    <StatusBadge value={String(a.quality_gate || a.status || "UNKNOWN")} />
                  </div>
                  <p className="mt-1 text-xs text-admin-muted">
                    {String(a.operating_date || "")} · expected {Number(a.expected_dogs || 0)} · generated{" "}
                    {Number(a.generated_dogs || 0)} · {String(a.actor_email || "system")}
                  </p>
                </button>
              ))
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            {!selectedAudit ? (
              <Empty text="Select a route audit to inspect pipeline and dog traces." />
            ) : !auditDetail ? (
              <Empty text="Loading audit…" />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-white">{selectedAudit}</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white"
                      onClick={() => void copyDebugContext(selectedAudit)}
                    >
                      Copy Debug Context
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white"
                      onClick={() =>
                        void copyText(`npm run ruffops:debug -- bug ${selectedAudit}`).then((ok) =>
                          setCopyNote(ok ? "Cursor command copied" : "Copy failed")
                        )
                      }
                    >
                      Copy Cursor Command
                    </button>
                  </div>
                </div>
                {(() => {
                  const audit = (auditDetail.audit as Record<string, unknown>) || {};
                  const traces = (auditDetail.traces as Array<Record<string, unknown>>) || [];
                  const pipeline = (audit.pipeline_stages as Array<Record<string, unknown>>) || [];
                  const missing = (audit.missing_dogs as Array<Record<string, unknown>>) || [];
                  return (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge value={String(audit.quality_gate || "UNKNOWN")} />
                        <span className="text-xs text-admin-muted">
                          {Number(audit.expected_dogs || 0)} expected · {Number(audit.generated_dogs || 0)} generated ·{" "}
                          {audit.duration_ms != null ? `${audit.duration_ms} ms` : ""}
                        </span>
                      </div>
                      {missing.length ? (
                        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-50">
                          <p className="font-semibold">ROUTE AUDIT FAILED — Missing dogs</p>
                          <ul className="mt-1 list-disc pl-5">
                            {missing.map((m, i) => (
                              <li key={`${m.dog}-${i}`}>
                                {String(m.dog)} · {String(m.stage)} · {String(m.reason)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-admin-muted">Pipeline</p>
                        <ul className="space-y-1">
                          {pipeline.map((stage) => (
                            <li
                              key={String(stage.key)}
                              className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5 text-sm"
                            >
                              <span className="text-white">
                                {String(stage.stage).padStart(2, "0")} {String(stage.label)}
                              </span>
                              <StatusBadge value={String(stage.status)} />
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-admin-muted">Dog traces</p>
                        <ul className="max-h-80 space-y-2 overflow-auto">
                          {traces.map((t) => (
                            <li key={String(t.id)} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-white">{String(t.dog_name || "unknown")}</span>
                                <StatusBadge value={String(t.validation_status || t.eligibility || "—")} />
                              </div>
                              <p className="mt-1 text-xs text-admin-muted">
                                {String(t.service_canonical || t.service_raw || "")} · {String(t.direction || "")} · expected{" "}
                                {String(t.expected_destination || "—")} · generated {String(t.generated_destination || "—")}
                                {t.error_code ? ` · ${String(t.error_code)}` : ""}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <details className="rounded-xl border border-white/10 p-3">
                        <summary className="cursor-pointer text-sm text-admin-muted">Developer Details</summary>
                        <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-admin-muted">
                          {JSON.stringify(auditDetail, null, 2)}
                        </pre>
                      </details>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {section === "integrations" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services
              .filter((s) =>
                ["gingr", "samsara", "twilio", "maps", "email", "database", "storage"].includes(String(s.id))
              )
              .map((svc) => (
                <div key={String(svc.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white">{String(svc.label)}</p>
                    <StatusBadge value={String(svc.status)} />
                  </div>
                  <p className="mt-2 text-sm text-admin-muted">{String(svc.detail)}</p>
                </div>
              ))}
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-admin-muted">Recent integration calls</p>
            {integrations.length === 0 ? (
              <Empty text="No integration diagnostic calls recorded yet." />
            ) : (
              <ul className="space-y-2">
                {integrations.map((row) => (
                  <li key={String(row.id)} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-white">
                        {String(row.integration)} · {String(row.action)}
                      </span>
                      <StatusBadge value={row.success ? "HEALTHY" : "FAILED"} />
                    </div>
                    <p className="text-xs text-admin-muted">
                      {row.occurred_at ? new Date(String(row.occurred_at)).toLocaleString() : ""} ·{" "}
                      {row.latency_ms != null ? `${row.latency_ms} ms` : ""} · {String(row.error_message || "")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {section === "api_logs" || section === "jobs" ? (
        <div>
          {!sectionData ? (
            <Empty text="Loading…" />
          ) : (
            <pre className="max-h-[32rem] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[11px] text-admin-muted">
              {JSON.stringify(sectionData, null, 2)}
            </pre>
          )}
        </div>
      ) : null}

      {section === "debug_search" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Dog, correlation ID, employee, error…"
              className="min-w-[16rem] flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              className="rounded-xl border border-fitdog-orange/40 bg-fitdog-orange/20 px-4 py-2 text-sm text-white"
            >
              Search
            </button>
          </div>
          {searchResult ? (
            <pre className="max-h-[28rem] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[11px] text-admin-muted">
              {JSON.stringify(searchResult, null, 2)}
            </pre>
          ) : (
            <Empty text="Search across route audits, dog traces, errors, and events." />
          )}
        </div>
      ) : null}

      {section === "cursor_bridge" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="font-semibold text-white">Cursor Debug Bridge</h3>
            <p className="mt-1 text-sm text-admin-muted">
              Read-only developer diagnostics. Never exposes secrets. Production access requires explicit settings.
            </p>
            <ul className="mt-3 space-y-1 font-mono text-xs text-admin-muted">
              <li>npm run ruffops:debug -- health</li>
              <li>npm run ruffops:debug -- route-run RG-YYYYMMDD-#####</li>
              <li>npm run ruffops:debug -- dog Baxter --date 2026-08-12</li>
              <li>npm run ruffops:debug -- errors --last 1h</li>
              <li>npm run ruffops:debug -- integration samsara --last 24h</li>
              <li>npm run ruffops:debug -- search &quot;Captain&quot;</li>
              <li>npm run ruffops:debug -- context --feature route-generator --last 24h</li>
              <li>npm run ruffops:debug -- bug RG-YYYYMMDD-#####</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => void startLiveDebug()}
            className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-50"
          >
            Enable Live Debug (Route Generator, 30 min)
          </button>
        </div>
      ) : null}

      {section === "settings" && settingsDraft ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {(
            [
              ["debugLoggingEnabled", "Debug logging enabled"],
              ["verboseLogging", "Verbose logging"],
              ["routeDecisionTracing", "Route decision tracing"],
              ["apiDiagnostics", "API diagnostics"],
              ["integrationDiagnostics", "Integration diagnostics"],
              ["liveActivityEnabled", "Live activity"],
              ["developerBridgeEnabled", "Developer bridge access"],
              ["cursorBridgeEnabled", "Cursor bridge enabled"],
              ["productionDiagnosticAccess", "Production diagnostic access (read-only)"],
              ["piiMasking", "PII masking"]
            ] as Array<[string, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm text-white">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(settingsDraft[key])}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, [key]: e.target.checked })}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => void saveSettings()}
            className="rounded-xl border border-fitdog-orange/40 bg-fitdog-orange/20 px-4 py-2 text-sm text-white"
          >
            Save settings
          </button>
        </div>
      ) : null}
    </section>
  );
}
