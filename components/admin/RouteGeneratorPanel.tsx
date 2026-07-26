"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  MapPin,
  RefreshCw,
  Route,
  ShieldAlert
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";

type TabId = "overview" | "pickup" | "dropoff" | "needs_review" | "raw" | "exports" | "audit" | "settings";

type Bootstrap = {
  featureEnabled: boolean;
  depot: {
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    timezone: string;
    verified: boolean;
  };
  vehicles: Array<{
    vanKey: string;
    active: boolean;
    vehiclePool: string;
    maxDogs: number | null;
    capacityConfigured: boolean;
    eligibleServices: string[];
  }>;
  connection: {
    status?: string;
    last_successful_pull_at?: string | null;
    source_mode?: string;
  } | null;
  checklist: Record<string, unknown>;
  mapColors: Record<string, string>;
};

type PlanBundle = {
  plan: {
    id: string;
    operating_date: string;
    status: string;
    current_version: number;
    summary: Record<string, number | string>;
    shadow_mode: boolean;
  };
  routes: Array<Record<string, unknown>>;
  stops: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
};

function todayLA() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function RouteGeneratorPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabId>("overview");
  const [date, setDate] = useState(todayLA);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  const [pullMeta, setPullMeta] = useState<{ pickup: number; dropoff: number; warnings: string[] } | null>(null);
  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [visibleVans, setVisibleVans] = useState<Record<string, boolean>>({});
  const [csvPreview, setCsvPreview] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/route-generator?view=bootstrap", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load Route Generator.");
      setBootstrap(body as Bootstrap);
      const vans: Record<string, boolean> = {};
      for (const v of body.vehicles ?? []) vans[v.vanKey] = true;
      setVisibleVans(vans);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load Route Generator.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function postAction(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/route-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed.");
      return body;
    } finally {
      setBusy(false);
    }
  }

  async function pullReport() {
    try {
      const body = await postAction("pull_report", { date });
      setReportRunId(body.run.id);
      setPullMeta({
        pickup: body.pull.pickupItems.length,
        dropoff: body.pull.dropoffItems.length,
        warnings: body.pull.warnings ?? []
      });
      showToast("Report pulled and normalized.", "success");
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pull failed.", "error");
    }
  }

  async function generateRoutes() {
    if (!reportRunId) {
      showToast("Pull a report first.", "error");
      return;
    }
    try {
      const body = (await postAction("generate_plan", { reportRunId })) as PlanBundle;
      setBundle(body);
      setTab("overview");
      showToast("Routes generated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Generate failed.", "error");
    }
  }

  async function approve() {
    if (!bundle?.plan.id) return;
    try {
      await postAction("approve_plan", { planId: bundle.plan.id });
      const response = await fetch(`/api/admin/route-generator?view=plan&planId=${bundle.plan.id}`, {
        cache: "no-store"
      });
      const next = await response.json();
      setBundle(next);
      showToast("Plan approved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Approve failed.", "error");
    }
  }

  async function exportCsv() {
    if (!bundle?.plan.id) return;
    try {
      const body = await postAction("export_csv", { planId: bundle.plan.id });
      setCsvPreview(body.csv);
      const blob = new Blob([body.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = body.fileName;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Samsara CSV exported.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Export failed.", "error");
    }
  }

  const pickupRoutes = useMemo(
    () => (bundle?.routes ?? []).filter((r) => r.direction === "pickup"),
    [bundle]
  );
  const dropoffRoutes = useMemo(
    () => (bundle?.routes ?? []).filter((r) => r.direction === "dropoff"),
    [bundle]
  );
  const needsReview = useMemo(
    () => (bundle?.items ?? []).filter((i) => i.validation_status !== "ok"),
    [bundle]
  );

  const mapStops = useMemo(() => {
    if (!bundle) return [];
    return bundle.stops.filter((stop) => {
      const route = bundle.routes.find((r) => r.id === stop.route_id);
      if (!route) return false;
      if (visibleVans[String(route.van_key)] === false) return false;
      return stop.stop_kind === "customer" || stop.stop_kind === "depot_start";
    });
  }, [bundle, visibleVans]);

  if (loading && !bootstrap) {
    return <p className="admin-empty-state-text">Loading Route Generator…</p>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-fitdog-orange" />
            <h2 className="admin-page-title">Route Generator</h2>
          </div>
          <p className="admin-page-subtitle mt-1 max-w-3xl">
            Pull Fitdog pickup/drop-off reports, optimize Van 1/2/3/5/6 routes, and export validated Samsara CSVs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-admin-muted">
          <span>
            Connection:{" "}
            <strong className="text-white">{bootstrap?.connection?.status ?? "disconnected"}</strong>
          </span>
          <span>
            Last pull:{" "}
            {bootstrap?.connection?.last_successful_pull_at
              ? new Date(bootstrap.connection.last_successful_pull_at).toLocaleString()
              : "—"}
          </span>
          {bundle ? (
            <span>
              Plan v{bundle.plan.current_version} · <strong className="text-white">{bundle.plan.status}</strong>
            </span>
          ) : null}
          {!bootstrap?.featureEnabled ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              <ShieldAlert className="h-3.5 w-3.5" /> Feature flag off (shadow/setup)
            </span>
          ) : null}
        </div>
      </header>

      <section className="admin-card flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
        <label className="block text-sm">
          <span className="admin-label">Operating date</span>
          <input
            type="date"
            className="admin-input mt-1"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void pullReport()}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Pull Report
          </button>
          <button type="button" className="admin-btn-secondary" disabled={busy || !reportRunId} onClick={() => void generateRoutes()}>
            Generate Routes
          </button>
          <button type="button" className="admin-btn-secondary" disabled={busy || !bundle} onClick={() => void approve()}>
            Approve Routes
          </button>
          <button type="button" className="admin-btn-primary" disabled={busy || !bundle} onClick={() => void exportCsv()}>
            <Download className="h-4 w-4" />
            Export Samsara CSV
          </button>
        </div>
      </section>

      {pullMeta ? (
        <section className="rounded-2xl border border-admin-border bg-black/20 px-4 py-3 text-sm text-admin-muted">
          Last pull · Pickup {pullMeta.pickup} · Drop-off {pullMeta.dropoff}
          {pullMeta.warnings.length ? (
            <p className="mt-1 text-amber-200">{pullMeta.warnings.join(" · ")}</p>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "Overview"],
            ["pickup", "Pickup Routes"],
            ["dropoff", "Drop-Off Routes"],
            ["needs_review", "Needs Review"],
            ["raw", "Raw Report"],
            ["exports", "Export History"],
            ["settings", "Settings"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === id ? "bg-fitdog-orange text-black" : "bg-black/20 text-admin-muted hover:text-white"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewCard label="Pickup dogs" value={String(bundle?.plan.summary?.pickupDogs ?? pullMeta?.pickup ?? "—")} />
            <OverviewCard label="Drop-off dogs" value={String(bundle?.plan.summary?.dropoffDogs ?? pullMeta?.dropoff ?? "—")} />
            <OverviewCard label="Vans used" value={String(bundle?.plan.summary?.vansUsed ?? "—")} />
            <OverviewCard label="Needs review" value={String(bundle?.plan.summary?.needsReview ?? needsReview.length ?? "—")} tone="warn" />
          </div>

          <section className="admin-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">Interactive map</h3>
              <div className="flex flex-wrap gap-2">
                {Object.keys(visibleVans).map((van) => (
                  <label key={van} className="inline-flex items-center gap-1 text-xs text-admin-muted">
                    <input
                      type="checkbox"
                      checked={visibleVans[van] !== false}
                      onChange={(event) => setVisibleVans((prev) => ({ ...prev, [van]: event.target.checked }))}
                    />
                    {van.replace("van_", "Van ")}
                  </label>
                ))}
              </div>
            </div>
            <div className="relative min-h-[280px] overflow-hidden rounded-xl border border-admin-border bg-[#0b1220]">
              {!mapStops.length ? (
                <div className="grid h-[280px] place-items-center text-sm text-admin-muted">
                  <div className="text-center">
                    <MapPin className="mx-auto mb-2 h-5 w-5" />
                    Pull a report and generate routes to plot stops.
                  </div>
                </div>
              ) : (
                <svg viewBox="0 0 800 320" className="h-[280px] w-full">
                  <rect width="800" height="320" fill="#0b1220" />
                  {mapStops.map((stop, index) => {
                    const route = bundle?.routes.find((r) => r.id === stop.route_id);
                    const color = String(route?.map_color || "#f15f2a");
                    const x = 60 + ((Number(stop.longitude) + 118.55) * 4000) % 680;
                    const y = 40 + ((34.05 - Number(stop.latitude)) * 4000) % 240;
                    return (
                      <g key={String(stop.id)}>
                        <circle cx={x} cy={y} r={stop.stop_kind === "depot_start" ? 8 : 6} fill={color} />
                        <text x={x + 10} y={y + 4} fill="#e2e8f0" fontSize="10">
                          {stop.stop_kind === "depot_start" ? "Depot" : `${index + 1}`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            {[...pickupRoutes, ...dropoffRoutes].map((route) => (
              <RouteCard
                key={String(route.id)}
                route={route}
                stops={(bundle?.stops ?? []).filter((s) => s.route_id === route.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {tab === "pickup" || tab === "dropoff" ? (
        <div className="space-y-3">
          {(tab === "pickup" ? pickupRoutes : dropoffRoutes).map((route) => (
            <RouteCard
              key={String(route.id)}
              route={route}
              stops={(bundle?.stops ?? []).filter((s) => s.route_id === route.id)}
              expanded
            />
          ))}
          {!(tab === "pickup" ? pickupRoutes : dropoffRoutes).length ? (
            <p className="admin-empty-state-text">No {tab} routes yet.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "needs_review" ? (
        <section className="admin-card overflow-hidden p-0">
          <div className="border-b border-admin-border px-4 py-3">
            <h3 className="text-base font-semibold text-white">Needs Review</h3>
            <p className="text-xs text-admin-muted">Fix these before approval/export unless a Super Admin overrides.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-black/20 text-xs uppercase tracking-wide text-admin-muted">
                <tr>
                  <th className="px-3 py-2">Dog</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Issues</th>
                </tr>
              </thead>
              <tbody>
                {needsReview.length ? (
                  needsReview.map((item) => (
                    <tr key={String(item.id)} className="border-t border-admin-border/70">
                      <td className="px-3 py-2 text-white">{String(item.dog_name ?? "—")}</td>
                      <td className="px-3 py-2 text-admin-muted">{String(item.owner_full_name ?? "—")}</td>
                      <td className="px-3 py-2 text-admin-muted">{String(item.direction)}</td>
                      <td className="px-3 py-2 text-amber-200">
                        {Array.isArray(item.validation_reasons)
                          ? item.validation_reasons.join(", ")
                          : String(item.validation_status)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-admin-muted">
                      <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-300" />
                      No unresolved records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "raw" ? (
        <section className="admin-card p-4 text-sm text-admin-muted">
          Raw import snapshots are stored server-side on each report run for audit. Open Needs Review for normalized
          validation issues. Sanitized previews are available to Super Admins via report source files.
        </section>
      ) : null}

      {tab === "exports" ? (
        <section className="admin-card space-y-3 p-4">
          <h3 className="text-base font-semibold text-white">Export History</h3>
          {csvPreview ? (
            <pre className="max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-emerald-100">{csvPreview}</pre>
          ) : (
            <p className="text-sm text-admin-muted">No CSV generated in this session yet.</p>
          )}
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="admin-card space-y-4 p-4">
          <h3 className="text-base font-semibold text-white">Setup checklist</h3>
          <ul className="space-y-2 text-sm text-admin-muted">
            <li>Depot verified: {bootstrap?.depot?.verified ? "yes" : "no — Super Admin must configure"}</li>
            <li>
              Active vans with capacity configured:{" "}
              {bootstrap?.vehicles?.filter((v) => v.active && v.capacityConfigured).length ?? 0}/
              {bootstrap?.vehicles?.filter((v) => v.active).length ?? 0}
            </li>
            <li>Shadow mode: {String(bootstrap?.checklist?.shadow_mode ?? true)}</li>
            <li>Vans available: Van 1, Van 2, Van 3, Van 5, Van 6 (never Van 4)</li>
            <li>Samsara template: upload under Settings → Integrations → Samsara Route Export before production export</li>
            <li>Fitdog integration: Connect under Settings → Integrations → Fitdog Route Report</li>
          </ul>
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            <AlertTriangle className="mb-1 h-4 w-4" />
            Production exports stay blocked until depot verification, van capacities, Samsara template validation, and
            shadow-mode review are complete.
          </div>
        </section>
      ) : null}
    </div>
  );
}

function OverviewCard({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "warn" ? "border-amber-400/30 bg-amber-500/10" : "border-admin-border bg-black/20"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-admin-muted">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function RouteCard({
  route,
  stops,
  expanded
}: {
  route: Record<string, unknown>;
  stops: Array<Record<string, unknown>>;
  expanded?: boolean;
}) {
  const customerStops = stops.filter((s) => s.stop_kind === "customer");
  return (
    <article className="admin-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-white">
            {String(route.van_key).replace("van_", "Van ")} · {String(route.direction)} · {String(route.wave_name)}
          </h4>
          <p className="text-xs text-admin-muted">
            {String(route.vehicle_pool)} pool · {customerStops.length} stops · {String(route.total_dogs)} dogs ·{" "}
            {String(route.estimated_distance_miles)} mi · {String(route.estimated_drive_minutes)} min
          </p>
        </div>
        <span
          className="mt-1 inline-block h-3 w-3 rounded-full"
          style={{ background: String(route.map_color || "#f15f2a") }}
        />
      </div>
      {expanded ? (
        <ol className="mt-3 space-y-2 text-sm">
          {stops
            .slice()
            .sort((a, b) => Number(a.sequence) - Number(b.sequence))
            .map((stop) => (
              <li key={String(stop.id)} className="rounded-lg border border-admin-border/60 px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-white">
                    #{Number(stop.sequence)} {String(stop.owner_name || stop.stop_kind)}
                  </span>
                  <span className="text-xs text-admin-muted">{String(stop.dog_count)} dogs</span>
                </div>
                <p className="text-xs text-admin-muted">{String(stop.address || "—")}</p>
                {stop.driver_notes ? <p className="mt-1 text-xs text-admin-muted">{String(stop.driver_notes)}</p> : null}
              </li>
            ))}
        </ol>
      ) : null}
    </article>
  );
}
