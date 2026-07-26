"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  Route,
  ShieldAlert
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { FitdogLocationsConfig } from "@/lib/route-generator/locations";

const RouteGeneratorMap = dynamic(
  () => import("@/components/admin/RouteGeneratorMap").then((mod) => mod.RouteGeneratorMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[360px] place-items-center text-sm text-admin-muted">Loading map…</div>
    )
  }
);

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
  locations?: FitdogLocationsConfig;
  vehicles: Array<{
    vanKey: string;
    active: boolean;
    vehiclePool: string;
    homeBaseKey?: string;
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
  latestPlan?: {
    id: string;
    operating_date?: string;
    report_run_id?: string | null;
    status?: string;
    current_version?: number;
  } | null;
};

type PlanBundle = {
  plan: {
    id: string;
    operating_date: string;
    report_run_id?: string | null;
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
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);

  const hydratePlan = useCallback(
    async (planId: string, options?: { quiet?: boolean }) => {
      const response = await fetch(`/api/admin/route-generator?view=plan&planId=${encodeURIComponent(planId)}`, {
        cache: "no-store"
      });
      const next = (await response.json()) as PlanBundle & { error?: string };
      if (!response.ok) {
        if (!options?.quiet) {
          throw new Error(next.error || "Unable to load the latest route plan.");
        }
        return null;
      }
      setBundle(next);
      if (next.plan?.report_run_id) setReportRunId(String(next.plan.report_run_id));
      if (next.plan?.operating_date) setDate(String(next.plan.operating_date));
      const summary = next.plan?.summary ?? {};
      setPullMeta({
        pickup: Number(summary.pickupDogs ?? next.items?.filter((i) => i.direction === "pickup").length ?? 0),
        dropoff: Number(summary.dropoffDogs ?? next.items?.filter((i) => i.direction === "dropoff").length ?? 0),
        warnings: []
      });
      return next;
    },
    []
  );

  const refresh = useCallback(
    async (options?: { hydrateLatestPlan?: boolean }) => {
      const hydrateLatestPlan = options?.hydrateLatestPlan !== false;
      setLoading(true);
      try {
        const response = await fetch("/api/admin/route-generator?view=bootstrap", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load Route Generator.");
        const nextBootstrap = body as Bootstrap;
        setBootstrap(nextBootstrap);
        const vans: Record<string, boolean> = {};
        for (const v of body.vehicles ?? []) vans[v.vanKey] = true;
        setVisibleVans(vans);

        // Restore the latest saved plan so Generate/Approve/Export are usable after navigation.
        if (hydrateLatestPlan && nextBootstrap.latestPlan?.id) {
          await hydratePlan(nextBootstrap.latestPlan.id, { quiet: true });
        } else if (hydrateLatestPlan && nextBootstrap.latestPlan?.report_run_id) {
          setReportRunId(String(nextBootstrap.latestPlan.report_run_id));
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load Route Generator.", "error");
      } finally {
        setLoading(false);
      }
    },
    [hydratePlan, showToast]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Bring the panel into view when opening from the sidebar (esp. mobile / long pages).
    const timer = window.setTimeout(() => {
      document.getElementById("route-generator-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
      setBundle(null);
      showToast("Report pulled and normalized. Next: Generate Routes.", "success");
      // Refresh connection/checklist only — keep the new reportRunId (don't rehydrate an older plan).
      await refresh({ hydrateLatestPlan: false });
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
    if (!bundle?.plan.id) {
      showToast("Generate routes before approving.", "error");
      return;
    }
    try {
      await postAction("approve_plan", { planId: bundle.plan.id });
      await hydratePlan(bundle.plan.id);
      showToast("Plan approved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Approve failed.", "error");
    }
  }

  async function exportCsv() {
    if (!bundle?.plan.id) {
      showToast("Generate and approve routes before exporting.", "error");
      return;
    }
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

  function onGenerateClick() {
    if (busy) return;
    if (!reportRunId) {
      showToast("Pull a report first, then generate routes.", "error");
      return;
    }
    void generateRoutes();
  }

  function onApproveClick() {
    if (busy) return;
    if (!bundle?.plan.id) {
      showToast("Generate routes first, then approve.", "error");
      return;
    }
    void approve();
  }

  function onExportClick() {
    if (busy) return;
    if (!bundle?.plan.id) {
      showToast("Generate routes first, then approve and export.", "error");
      return;
    }
    if (bundle.plan.status !== "approved") {
      showToast("Approve the route plan before exporting CSV.", "error");
      return;
    }
    void exportCsv();
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

  const mapRoutes = useMemo(() => {
    if (!bundle) return [];
    return bundle.routes
      .filter((route) => visibleVans[String(route.van_key)] !== false)
      .map((route) => {
        const stops = bundle.stops
          .filter((stop) => stop.route_id === route.id)
          .map((stop) => {
            const stopKind = String(stop.stop_kind ?? "customer");
            let label = String(stop.owner_name || stopKind || "Stop");
            // Keep optimizer labels (Fitdog Westwood Hub, Kenneth Hahn Trail, Huntington Dog Beach, Fitdog Club).
            return {
              id: String(stop.id),
              routeId: String(route.id),
              sequence: Number(stop.sequence ?? 0),
              stopKind,
              label,
              address: String(stop.address || ""),
              latitude: Number(stop.latitude),
              longitude: Number(stop.longitude),
              color: String(route.map_color || "#f15f2a")
            };
          })
          .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
        return {
          id: String(route.id),
          vanKey: String(route.van_key),
          direction: String(route.direction),
          waveName: String(route.wave_name || ""),
          color: String(route.map_color || "#f15f2a"),
          stops
        };
      });
  }, [bundle, visibleVans]);

  useEffect(() => {
    if (!selectedRouteId) return;
    if (!mapRoutes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(null);
    }
  }, [mapRoutes, selectedRouteId]);

  function selectRoute(routeId: string) {
    setSelectedRouteId((current) => (current === routeId ? null : routeId));
    setTab("overview");
    window.setTimeout(() => {
      document.getElementById("route-generator-map")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
  }

  if (loading && !bootstrap) {
    return <p className="admin-empty-state-text">Loading Route Generator…</p>;
  }

  if (!bootstrap) {
    return (
      <div id="route-generator-panel" className="admin-card space-y-3 p-6">
        <p className="admin-empty-state-text">Unable to load Route Generator. Try Refresh.</p>
        <button type="button" className="admin-btn-secondary" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div id="route-generator-panel" className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-fitdog-orange" />
            <h2 className="admin-page-title">Route Generator</h2>
          </div>
          <p className="admin-page-subtitle mt-1 max-w-3xl">
            Pull live Fitdog signups, build Van 1/2 (Hub↔Kenneth Hahn) and Van 3 (Hub↔Huntington) routes with Club
            stops for dogs already at Fitdog, then export Samsara CSVs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-admin-muted">
          <span>
            Connection:{" "}
            <strong className="text-white">{bootstrap.connection?.status ?? "disconnected"}</strong>
          </span>
          <span>
            Source:{" "}
            <strong className="text-white">{bootstrap.connection?.source_mode ?? "—"}</strong>
          </span>
          <span>
            Last pull:{" "}
            {bootstrap.connection?.last_successful_pull_at
              ? new Date(bootstrap.connection.last_successful_pull_at).toLocaleString()
              : "—"}
          </span>
          {bundle ? (
            <span>
              Plan v{bundle.plan.current_version} · <strong className="text-white">{bundle.plan.status}</strong>
            </span>
          ) : null}
          {!bootstrap.featureEnabled ? (
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
            {busy ? "Working…" : "Pull Report"}
          </button>
          <button
            type="button"
            className={reportRunId ? "admin-btn-primary" : "admin-btn-secondary"}
            disabled={busy}
            title={!reportRunId ? "Pull a report first" : "Generate optimized van routes"}
            onClick={onGenerateClick}
          >
            Generate Routes
          </button>
          <button
            type="button"
            className={bundle?.plan.id ? "admin-btn-primary" : "admin-btn-secondary"}
            disabled={busy}
            title={!bundle ? "Generate routes first" : "Approve the current plan"}
            onClick={onApproveClick}
          >
            Approve Routes
          </button>
          <button
            type="button"
            className={bundle?.plan.status === "approved" ? "admin-btn-primary" : "admin-btn-secondary"}
            disabled={busy}
            title={
              !bundle
                ? "Generate routes first"
                : bundle.plan.status !== "approved"
                  ? "Approve the route plan before exporting"
                  : "Export approved plan as Samsara CSV"
            }
            onClick={onExportClick}
          >
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

          <section id="route-generator-map" className="admin-card p-4">
            <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Interactive map</h3>
                <p className="text-xs text-admin-muted">
                  Click a route card to focus it. Hub, Club, Kenneth Hahn Trail, and Huntington Dog Beach are marked.
                </p>
              </div>
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
            <div className="overflow-hidden rounded-xl border border-admin-border bg-[#0b1220]">
              <RouteGeneratorMap
                routes={mapRoutes}
                selectedRouteId={selectedRouteId}
                locations={bootstrap.locations}
                onSelectRoute={setSelectedRouteId}
              />
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            {[...pickupRoutes, ...dropoffRoutes].map((route) => (
              <RouteCard
                key={String(route.id)}
                route={route}
                stops={(bundle?.stops ?? []).filter((s) => s.route_id === route.id)}
                selected={selectedRouteId === String(route.id)}
                onSelect={() => selectRoute(String(route.id))}
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
              selected={selectedRouteId === String(route.id)}
              onSelect={() => selectRoute(String(route.id))}
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
            <li>
              Fitdog Westwood Hub:{" "}
              {bootstrap?.locations?.hub?.address || "2140 Westwood Blvd, West Los Angeles, CA 90025"}
              {bootstrap?.locations?.hub?.verified ? " · verified" : ""}
            </li>
            <li>
              Fitdog Club: {bootstrap?.locations?.club?.address || "1712 21st St, Santa Monica, CA 90404"}
              {bootstrap?.locations?.club?.verified ? " · verified" : ""}
            </li>
            <li>
              Kenneth Hahn Trail: {bootstrap?.locations?.kenneth_hahn?.name || "Kenneth Hahn Trail"} (Van 1/2 Adventure
              end / drop-off start)
            </li>
            <li>
              Huntington Dog Beach: {bootstrap?.locations?.huntington?.name || "Huntington Dog Beach"} (Van 3 Beach end
              / drop-off start)
            </li>
            <li>
              Active vans with capacity configured:{" "}
              {bootstrap?.vehicles?.filter((v) => v.active && v.capacityConfigured).length ?? 0}/
              {bootstrap?.vehicles?.filter((v) => v.active).length ?? 0}
            </li>
            <li>Shadow mode: {String(bootstrap?.checklist?.shadow_mode ?? true)}</li>
            <li>
              Pickup: Van 1/2 Hub→Kenneth Hahn; Van 3 Hub→Huntington. Drop-off reverses. Club stop only when dogs are
              already at Fitdog. Never Van 4.
            </li>
            <li>Samsara template: upload under Settings → Integrations → Samsara Route Export before production export</li>
            <li>Fitdog integration: Connect under Settings → Integrations → Fitdog Route Report</li>
          </ul>
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            <AlertTriangle className="mb-1 h-4 w-4" />
            Production exports stay blocked until HUB/CLUB verification, van capacities, Samsara template validation, and
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
  expanded,
  selected,
  onSelect
}: {
  route: Record<string, unknown>;
  stops: Array<Record<string, unknown>>;
  expanded?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const customerStops = stops.filter((s) => s.stop_kind === "customer");
  const startStop = stops.find((s) => s.stop_kind === "depot_start");
  const endStop = stops.find((s) => s.stop_kind === "depot_end");
  const startLabel = String(startStop?.owner_name || "Fitdog Westwood Hub");
  const endLabel = String(endStop?.owner_name || "Fitdog Westwood Hub");
  return (
    <article
      className={`admin-card p-4 transition ${
        selected ? "ring-2 ring-fitdog-orange border-fitdog-orange/50" : ""
      } ${onSelect ? "cursor-pointer hover:border-fitdog-orange/40" : ""}`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-white">
            {String(route.van_key).replace("van_", "Van ")} · {String(route.direction)} · {String(route.wave_name)}
          </h4>
          <p className="text-xs text-admin-muted">
            {startLabel} → {endLabel} · {customerStops.length} stops · {String(route.total_dogs)} dogs ·{" "}
            {String(route.estimated_distance_miles)} mi · {String(route.estimated_drive_minutes)} min
          </p>
          {onSelect ? (
            <p className="mt-1 text-[11px] font-semibold text-fitdog-orange">
              {selected ? "Showing on map · click to clear" : "Click to view on map"}
            </p>
          ) : null}
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
            .map((stop) => {
              const kind = String(stop.stop_kind);
              const name = String(stop.owner_name || kind);
              return (
                <li key={String(stop.id)} className="rounded-lg border border-admin-border/60 px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-white">
                      #{Number(stop.sequence)} {name}
                    </span>
                    <span className="text-xs text-admin-muted">{String(stop.dog_count)} dogs</span>
                  </div>
                  <p className="text-xs text-admin-muted">{String(stop.address || "—")}</p>
                  {stop.driver_notes ? <p className="mt-1 text-xs text-admin-muted">{String(stop.driver_notes)}</p> : null}
                </li>
              );
            })}
        </ol>
      ) : null}
    </article>
  );
}
