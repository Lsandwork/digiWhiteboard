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
import { htmlDateInputValue, normalizeHtmlDateValue, pacificHtmlDate } from "@/lib/dates/html-date";
import { RouteGeneratorExtras } from "@/components/admin/RouteGeneratorExtras";
import { RouteGeneratorTrackingTab } from "@/components/admin/RouteGeneratorTrackingTab";
import type { FitdogLocationsConfig } from "@/lib/route-generator/locations";
import type { SkippedOccurrence } from "@/lib/route-generator/fitdog-api";
import type { GingrTaxiServiceRow } from "@/lib/route-generator/gingr-taxi";

const RouteGeneratorMap = dynamic(
  () => import("@/components/admin/RouteGeneratorMap").then((mod) => mod.RouteGeneratorMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[360px] place-items-center text-sm text-admin-muted">Loading map…</div>
    )
  }
);

type TabId =
  | "overview"
  | "pickup"
  | "dropoff"
  | "needs_review"
  | "extras"
  | "raw"
  | "exports"
  | "tracking"
  | "audit"
  | "settings";

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
  ownerSmsEnabled?: boolean;
};

type PlanBundle = {
  plan: {
    id: string;
    operating_date: string;
    report_run_id?: string | null;
    status: string;
    current_version: number;
    summary: Record<string, unknown>;
    shadow_mode: boolean;
  };
  routes: Array<Record<string, unknown>>;
  stops: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  metadata?: {
    warnings?: string[];
    skippedOccurrences?: SkippedOccurrence[];
  };
};

function todayLA() {
  return pacificHtmlDate();
}

export function RouteGeneratorPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabId>("overview");
  const [date, setDate] = useState(todayLA);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  const [pullMeta, setPullMeta] = useState<{
    pickup: number;
    dropoff: number;
    warnings: string[];
    skippedOccurrences: SkippedOccurrence[];
  } | null>(null);
  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [sendOwnerSms, setSendOwnerSms] = useState(false);
  const [generateAsOneBigRoute, setGenerateAsOneBigRoute] = useState(false);
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
      setGenerateAsOneBigRoute(
        String((next.plan?.summary as { routeGenerationMode?: string } | undefined)?.routeGenerationMode || "") ===
          "single_combined_route"
      );
      const nextReportRunId = next.plan?.report_run_id ? String(next.plan.report_run_id) : null;
      if (nextReportRunId) setReportRunId(nextReportRunId);
      if (next.plan?.operating_date) setDate(String(next.plan.operating_date).slice(0, 10));
      const summary = next.plan?.summary ?? {};
      let skipped = next.metadata?.skippedOccurrences ?? [];
      let warnings = next.metadata?.warnings ?? [];
      // Heal empty plan metadata by re-fetching the report run (source-file fallback).
      if (nextReportRunId && !skipped.length) {
        try {
          const response = await fetch(
            `/api/admin/route-generator?view=report_run&reportRunId=${encodeURIComponent(nextReportRunId)}`,
            { cache: "no-store" }
          );
          const body = await response.json();
          if (response.ok) {
            skipped = body.metadata?.skippedOccurrences ?? skipped;
            warnings = body.metadata?.warnings?.length ? body.metadata.warnings : warnings;
          }
        } catch {
          // keep plan metadata
        }
      }
      setPullMeta({
        pickup: Number(summary.pickupDogs ?? next.items?.filter((i) => i.direction === "pickup").length ?? 0),
        dropoff: Number(summary.dropoffDogs ?? next.items?.filter((i) => i.direction === "dropoff").length ?? 0),
        warnings,
        skippedOccurrences: skipped
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
      const runId = String(body.run.id);
      setReportRunId(runId);
      const skipped =
        (body.metadata?.skippedOccurrences as SkippedOccurrence[] | undefined) ||
        (body.pull?.skippedOccurrences as SkippedOccurrence[] | undefined) ||
        (body.run?.metadata?.skippedOccurrences as SkippedOccurrence[] | undefined) ||
        [];
      const nextMeta = {
        pickup: Number(body.pull?.pickupItems?.length ?? body.run?.pickup_count ?? 0),
        dropoff: Number(body.pull?.dropoffItems?.length ?? body.run?.dropoff_count ?? 0),
        warnings: (body.pull?.warnings as string[] | undefined) ?? body.metadata?.warnings ?? [],
        skippedOccurrences: skipped
      };
      setPullMeta(nextMeta);
      setBundle(null);
      setGenerateAsOneBigRoute(false);
      if (skipped.length) setTab("extras");
      showToast(
        skipped.length
          ? `Report pulled. ${skipped.length} non-route class(es) need assignment.`
          : "Report pulled and normalized. Next: Generate Routes.",
        skipped.length ? "info" : "success"
      );
      // Refresh connection/checklist only — keep the new reportRunId (don't rehydrate an older plan).
      await refresh({ hydrateLatestPlan: false });
      // Re-assert pull meta after bootstrap refresh so a remount/race cannot wipe skipped rows.
      setPullMeta(nextMeta);
      if (skipped.length) {
        try {
          await refreshReportMeta(runId);
        } catch {
          setPullMeta(nextMeta);
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Pull failed.", "error");
    }
  }

  async function refreshReportMeta(reportRunIdValue: string) {
    const response = await fetch(
      `/api/admin/route-generator?view=report_run&reportRunId=${encodeURIComponent(reportRunIdValue)}`,
      { cache: "no-store" }
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to refresh report run.");
    setPullMeta({
      pickup: Number(body.run?.pickup_count ?? 0),
      dropoff: Number(body.run?.dropoff_count ?? 0),
      warnings: body.metadata?.warnings ?? [],
      skippedOccurrences: body.metadata?.skippedOccurrences ?? []
    });
  }

  async function assignSkipped(occurrenceId: number, vanKey: string) {
    if (!reportRunId) {
      showToast("Pull a report first.", "error");
      return;
    }
    try {
      const body = await postAction("assign_skipped_occurrence", { reportRunId, occurrenceId, vanKey });
      await refreshReportMeta(reportRunId);
      if (body.planApply?.planId) {
        await hydratePlan(String(body.planApply.planId), { quiet: true });
        setTab(vanKey ? "pickup" : "overview");
      }
      showToast(
        body.planApply?.updated
          ? `${vanKey.replace("van_", "Van ")} updated — ${body.planApply.message}`
          : `Assigned to ${vanKey.replace("van_", "Van ")}. ${body.planApply?.message || "Generate Routes to include it."}`,
        body.planApply?.updated ? "success" : "info"
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Assign failed.", "error");
    }
  }

  async function addManualTaxi(payload: {
    dogName: string;
    ownerName: string;
    address: string;
    city: string;
    zip: string;
    phone: string;
    notes: string;
    vanKey: string;
    wave: "pickup" | "dropoff" | "both";
  }) {
    if (!reportRunId) {
      showToast("Pull a report first.", "error");
      return;
    }
    try {
      const body = await postAction("add_taxi", { reportRunId, source: "manual", ...payload });
      await refreshReportMeta(reportRunId);
      if (body.planApply?.planId) {
        await hydratePlan(String(body.planApply.planId), { quiet: true });
        setTab(payload.wave === "dropoff" ? "dropoff" : "pickup");
      }
      showToast(
        body.planApply?.updated
          ? body.planApply.message
          : `Taxi saved to report. ${body.planApply?.message || "Generate Routes to include it."}`,
        body.planApply?.updated ? "success" : "info"
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to add taxi.", "error");
    }
  }

  async function addGingrTaxi(
    row: GingrTaxiServiceRow,
    vanKey: string,
    wave: "pickup" | "dropoff" | "both" = "both"
  ) {
    if (!reportRunId) {
      showToast("Pull a report first.", "error");
      return;
    }
    try {
      const body = await postAction("add_taxi", {
        reportRunId,
        source: "gingr",
        vanKey,
        wave,
        gingrReservationId: row.reservationId,
        gingrRow: row
      });
      await refreshReportMeta(reportRunId);
      if (body.planApply?.planId) {
        await hydratePlan(String(body.planApply.planId), { quiet: true });
        setTab(wave === "dropoff" ? "dropoff" : "pickup");
      }
      showToast(
        body.planApply?.updated
          ? body.planApply.message
          : `Gingr Taxi saved to report. ${body.planApply?.message || "Generate Routes to include it."}`,
        body.planApply?.updated ? "success" : "info"
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to add Gingr taxi.", "error");
    }
  }

  async function generateRoutes() {
    if (!reportRunId) {
      showToast("Pull a report first.", "error");
      return;
    }
    try {
      const body = (await postAction("generate_plan", {
        reportRunId,
        routeGenerationMode: generateAsOneBigRoute ? "single_combined_route" : "automatic_split"
      })) as PlanBundle;
      setBundle(body);
      setTab("overview");
      showToast(
        generateAsOneBigRoute
          ? "One Big Route generated: AM pickups and PM drop-offs. Gingr Taxi included when present."
          : "Routes generated.",
        "success"
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Generate failed.", "error");
    }
  }

  async function approve() {
    if (!bundle?.plan.id) {
      showToast("Generate routes before approving.", "error");
      return;
    }
    if (sendOwnerSms) {
      const ok = window.confirm(
        "Send owner tracking SMS for this plan?\n\nOwners will get a tracking link now (only during 6 AM–8 PM Pacific), then ETA texts when Samsara shows the van actually moving toward their stop.\n\nOvernight / parked vans will not text."
      );
      if (!ok) return;
    }
    try {
      const body = await postAction("approve_plan", {
        planId: bundle.plan.id,
        sendOwnerSms
      });
      await hydratePlan(bundle.plan.id);
      const tracking = body.tracking as
        | {
            smsQueued?: number;
            smsConfigured?: boolean;
            smsEnabled?: boolean;
            smsDeferredQuietHours?: boolean;
            smsErrors?: string[];
          }
        | undefined;
      if (tracking?.smsQueued) {
        showToast(`Plan approved. Sent ${tracking.smsQueued} owner tracking SMS.`, "success");
      } else if (tracking?.smsDeferredQuietHours) {
        showToast(
          "Plan approved. Owner SMS opted in, but quiet hours (8 PM–6 AM PT) blocked sending — ETA alerts stay off until daytime service hours with a moving van.",
          "error"
        );
      } else if (tracking?.smsEnabled && tracking?.smsConfigured === false) {
        showToast("Plan approved, but Twilio is not configured — tracking links created without SMS.", "error");
      } else if (tracking?.smsEnabled && tracking?.smsErrors?.length) {
        showToast(`Plan approved. Tracking SMS issue: ${tracking.smsErrors[0]}`, "error");
      } else if (tracking?.smsEnabled) {
        showToast("Plan approved. Owner SMS alerts enabled (no link texts needed yet).", "success");
      } else {
        showToast("Plan approved. Owner SMS alerts were not enabled.", "success");
      }
      setSendOwnerSms(false);
      setTab("tracking");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Approve failed.", "error");
    }
  }

  async function exportCsv(options?: { emergencyOverride?: boolean; overrideReason?: string }) {
    if (!bundle?.plan.id) {
      showToast("Generate and approve routes before exporting.", "error");
      return;
    }
    try {
      const body = await postAction("export_csv", {
        planId: bundle.plan.id,
        emergencyOverride: Boolean(options?.emergencyOverride),
        overrideReason: options?.overrideReason
      });
      const exportFiles = (
        Array.isArray(body.files) && body.files.length
          ? body.files
          : [{ csv: body.csv, fileName: body.fileName }]
      ) as Array<{ csv: string; fileName: string }>;
      setCsvPreview(
        exportFiles
          .map((file) => `--- ${file.fileName} ---\n${file.csv}`)
          .join("\n")
      );
      for (const [index, file] of exportFiles.entries()) {
        await new Promise((resolve) => window.setTimeout(resolve, index === 0 ? 0 : 250));
        const blob = new Blob([file.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      await hydratePlan(String(bundle.plan.id), { quiet: true });
      const reminder =
        body.validation?.uploadReminder ||
        "Upload this CSV to Samsara today only. Never reuse a previous day's file.";
      showToast(
        exportFiles.length > 1
          ? `Exported ${exportFiles.length} Samsara CSVs (AM pickups and PM drop-offs). ${reminder}`
          : `Samsara CSV exported. ${reminder}`,
        "success"
      );
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
    if (bundle.plan.status !== "approved" && bundle.plan.status !== "exported") {
      showToast("Approve the route plan before exporting CSV.", "error");
      return;
    }
    const planDate = String(bundle.plan.operating_date || date).slice(0, 10);
    const today = todayLA();
    if (planDate !== today) {
      const confirmed = window.confirm(
        `This plan is for ${planDate}, but today is ${today}.\n\nUploading another day's CSV to Samsara is blocked by default.\n\nOnly continue with emergency override if a manager explicitly approved exporting ${planDate}.`
      );
      if (!confirmed) return;
      const reason = window.prompt(
        `Emergency override reason for exporting ${planDate} routes (required):`,
        ""
      );
      if (!reason?.trim()) {
        showToast("Emergency export cancelled — a written reason is required.", "error");
        return;
      }
      void exportCsv({ emergencyOverride: true, overrideReason: reason.trim() });
      return;
    }
    void exportCsv();
  }

  const canExportCsv =
    Boolean(bundle?.plan.id) &&
    (bundle?.plan.status === "approved" || bundle?.plan.status === "exported");
  const isWrongOperatingDay = Boolean(date && date !== todayLA());

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
          {/* Reads the live server flag, so this is the authoritative answer to
              "can anyone be texted right now?" without opening Vercel. */}
          {bootstrap.ownerSmsEnabled === false ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200"
              title="ROUTE_OWNER_SMS_ENABLED is not set on this deployment. No owner can receive a route text."
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Owner SMS OFF system-wide
            </span>
          ) : bootstrap.ownerSmsEnabled === true ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-100"
              title="ROUTE_OWNER_SMS_ENABLED is true on this deployment. Approving with the SMS box checked can text owners."
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Owner SMS is ARMED
            </span>
          ) : null}
        </div>
      </header>

      {isWrongOperatingDay ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-50">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Operating date is <strong>{date}</strong>, but today is <strong>{todayLA()}</strong>. Samsara CSV
            export for a non-today plan is blocked unless a manager uses emergency override. Never upload
            Friday&apos;s (or any prior day&apos;s) CSV to Samsara on a later day.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Export only today&apos;s CSV to Samsara. Digi blocks wrong-day exports and validates stop
            times/coords/notes so bulk upload does not return Internal Server Error.
          </p>
        </div>
      )}

      <section className="admin-card flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
        <label className="block text-sm">
          <span className="admin-label">Operating date</span>
          <input
            type="date"
            className="admin-input mt-1"
            value={htmlDateInputValue(date)}
            onChange={(event) => setDate(normalizeHtmlDateValue(event.target.value, pacificHtmlDate()))}
          />
        </label>
        <div className="flex flex-col gap-2 sm:items-end">
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
            className={canExportCsv ? "admin-btn-primary" : "admin-btn-secondary"}
            disabled={busy}
            title={
              !bundle
                ? "Generate routes first"
                : !canExportCsv
                  ? "Approve the route plan before exporting"
                  : bundle.plan.status === "exported"
                    ? String((bundle.plan.summary as { routeGenerationMode?: string } | undefined)?.routeGenerationMode) ===
                      "single_combined_route"
                      ? "Re-download today's AM pickup and PM drop-off One Big Route CSVs"
                      : "Re-download today's Samsara CSV (do not reuse an old file)"
                    : String((bundle.plan.summary as { routeGenerationMode?: string } | undefined)?.routeGenerationMode) ===
                        "single_combined_route"
                      ? "Export AM pickup and PM drop-off One Big Route CSVs"
                      : "Export approved plan as Samsara CSV"
            }
            onClick={onExportClick}
          >
            <Download className="h-4 w-4" />
            {String((bundle?.plan.summary as { routeGenerationMode?: string } | undefined)?.routeGenerationMode) ===
            "single_combined_route"
              ? bundle?.plan.status === "exported"
                ? "Re-export AM + PM CSVs"
                : "Export AM + PM CSVs"
              : bundle?.plan.status === "exported"
                ? "Re-export Samsara CSV"
                : "Export Samsara CSV"}
          </button>
          </div>
          <label
            className="flex max-w-xl cursor-pointer items-start gap-2 rounded-xl border border-admin-border bg-black/25 px-3 py-2 text-left text-xs text-admin-muted"
            title="When checked, Generate Routes combines all eligible stops into one geographically ordered route instead of splitting by van."
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={generateAsOneBigRoute}
              disabled={busy}
              onChange={(event) => setGenerateAsOneBigRoute(event.target.checked)}
            />
            <span>
              <span className="font-medium text-white">Generate as One Big Route</span>
              <span className="mt-0.5 block">
                Creates two combined Samsara-ready exports — AM pickups and PM drop-offs — without dividing stops between
                vans. Automatically includes Gingr Taxi. The Route Coordinator uploads both CSVs to Samsara and separates
                the stops manually.
              </span>
            </span>
          </label>
          <label
            className="flex max-w-xl cursor-pointer items-start gap-2 rounded-xl border border-admin-border bg-black/25 px-3 py-2 text-left text-xs text-admin-muted"
            title="Owner texts are independent of approval. You can change this before or after Approve."
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={
                sendOwnerSms ||
                Boolean((bundle?.plan.summary as { ownerTextsEnabled?: boolean } | undefined)?.ownerTextsEnabled)
              }
              disabled={busy || !bundle?.plan.id || bootstrap?.ownerSmsEnabled === false}
              onChange={(event) => {
                const enabled = event.target.checked;
                setSendOwnerSms(enabled);
                const status = bundle?.plan.status;
                if (
                  bundle?.plan.id &&
                  (status === "approved" || status === "exported" || status === "ready_for_approval")
                ) {
                  void (async () => {
                    try {
                      await postAction("set_owner_texts", { planId: bundle.plan.id, enabled });
                      await hydratePlan(String(bundle.plan.id), { quiet: true });
                      showToast(
                        enabled
                          ? "Owner tracking texts enabled for this plan."
                          : "Owner tracking texts disabled for this plan.",
                        "success"
                      );
                    } catch (error) {
                      setSendOwnerSms(!enabled);
                      showToast(error instanceof Error ? error.message : "Unable to update owner texts.", "error");
                    }
                  })();
                }
              }}
            />
            <span>
              <span className="font-medium text-white">Owner Tracking Texts</span>
              <span className="mt-0.5 block">
                {bootstrap?.ownerSmsEnabled === false
                  ? "Owner SMS is OFF system-wide (ROUTE_OWNER_SMS_ENABLED). No owner will be texted until an admin turns that flag on in Vercel for live route days."
                  : "Independent of approval — toggle before or after Approve. Does not regenerate routes or re-export to Samsara."}
              </span>
            </span>
          </label>
        </div>
      </section>

      {pullMeta ? (
        <section className="rounded-2xl border border-admin-border bg-black/20 px-4 py-3 text-sm text-admin-muted">
          Last pull · Pickup {pullMeta.pickup} · Drop-off {pullMeta.dropoff}
          {pullMeta.skippedOccurrences.length ? (
            <p className="mt-1 text-amber-200">
              Skipped {pullMeta.skippedOccurrences.length} non-route class occurrence(s) — open{" "}
              <button type="button" className="underline" onClick={() => setTab("extras")}>
                Skipped / Taxi
              </button>{" "}
              to assign them.
            </p>
          ) : null}
          {pullMeta.warnings.filter((warning) => !/Skipped \d+ non-route class/i.test(warning)).length ? (
            <p className="mt-1 text-amber-200">
              {pullMeta.warnings.filter((warning) => !/Skipped \d+ non-route class/i.test(warning)).join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="admin-tabs">
        {(
          [
            ["overview", "Overview"],
            ["pickup", "Pickup Routes"],
            ["dropoff", "Drop-Off Routes"],
            ["needs_review", "Needs Review"],
            ["extras", "Skipped / Taxi"],
            ["tracking", "Tracking / SMS"],
            ["raw", "Raw Report"],
            ["exports", "Export History"],
            ["settings", "Settings"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`admin-tab ${tab === id ? "admin-tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "extras" && pullMeta?.skippedOccurrences.some((row) => !row.assignedVanKey)
              ? ` (${pullMeta.skippedOccurrences.filter((row) => !row.assignedVanKey).length})`
              : ""}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          {(() => {
            const summary = (bundle?.plan.summary ?? {}) as Record<string, unknown>;
            const missing = (summary.reconciliation as { missing?: string[] } | undefined)?.missing ?? [];
            const missingCount = Number(summary.missingLegs ?? missing.length ?? 0);
            const addressIssues = Number(summary.addressIssues ?? 0);
            const assigned = Number(summary.assignedLegs ?? 0);
            const expected = Number(summary.transportLegs ?? 0);
            const ready = Boolean(bundle) && missingCount === 0 && addressIssues === 0 && expected > 0;
            const oneBigRoute = summary.oneBigRoute as
              | {
                  totalDogs?: number;
                  totalStops?: number;
                  pickupStops?: number;
                  dropoffStops?: number;
                  pickupDogs?: number;
                  dropoffDogs?: number;
                  services?: string[];
                  gingrTaxiImported?: number;
                  warnings?: string[];
                  missingAddresses?: Array<{
                    dog?: string;
                    customer?: string;
                    stop?: string;
                    field?: string;
                    correction?: string;
                  }>;
                }
              | null
              | undefined;
            const isOneBigRoute = summary.routeGenerationMode === "single_combined_route";
            const liveCustomerStops = (bundle?.stops ?? []).filter((stop) => stop.stop_kind === "customer");
            const livePickupStops = liveCustomerStops.filter((stop) => {
              const route = bundle?.routes.find((row) => row.id === stop.route_id);
              return route?.direction === "pickup";
            });
            const liveDropoffStops = liveCustomerStops.filter((stop) => {
              const route = bundle?.routes.find((row) => row.id === stop.route_id);
              return route?.direction === "dropoff";
            });
            const liveDogs = liveCustomerStops.reduce((n, stop) => n + Number(stop.dog_count ?? 0), 0);
            const liveServices = [
              ...new Set(
                (bundle?.routes ?? []).flatMap((route) =>
                  Array.isArray(route.service_types) ? (route.service_types as string[]) : []
                )
              )
            ];
            return (
              <>
                {isOneBigRoute ? (
                  <section className="rounded-2xl border border-sky-400/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">ONE BIG ROUTE</p>
                    <p className="mt-1 text-sky-100/90">
                      Two combined geographically ordered exports — AM pickups and PM drop-offs. Stops were not divided
                      by van, driver, or capacity. Gingr Taxi is included when present.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <OverviewCard
                        label="Total dogs"
                        value={String(oneBigRoute?.totalDogs ?? liveDogs)}
                      />
                      <OverviewCard
                        label="Total stops"
                        value={String(oneBigRoute?.totalStops ?? liveCustomerStops.length)}
                      />
                      <OverviewCard
                        label="Pickups"
                        value={`${oneBigRoute?.pickupDogs ?? livePickupStops.reduce((n, stop) => n + Number(stop.dog_count ?? 0), 0)} dogs / ${oneBigRoute?.pickupStops ?? livePickupStops.length} stops`}
                      />
                      <OverviewCard
                        label="Drop-offs"
                        value={`${oneBigRoute?.dropoffDogs ?? liveDropoffStops.reduce((n, stop) => n + Number(stop.dog_count ?? 0), 0)} dogs / ${oneBigRoute?.dropoffStops ?? liveDropoffStops.length} stops`}
                      />
                    </div>
                    <p className="mt-3 text-xs text-sky-100/90">
                      Services represented:{" "}
                      {(oneBigRoute?.services?.length ? oneBigRoute.services : liveServices).join(", ") || "—"}
                      {Number(oneBigRoute?.gingrTaxiImported) > 0
                        ? ` · Gingr Taxi imported: ${String(oneBigRoute?.gingrTaxiImported)}`
                        : ""}
                    </p>
                    {(oneBigRoute?.warnings?.length ?? 0) > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100">
                        {oneBigRoute!.warnings!.slice(0, 12).map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    {(oneBigRoute?.missingAddresses?.length ?? 0) > 0 ? (
                      <div className="mt-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-rose-50">
                        <p className="font-semibold">Missing / invalid addresses</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {oneBigRoute!.missingAddresses!.slice(0, 12).map((row, index) => (
                            <li key={`${row.stop}-${index}`}>
                              {row.dog || "Dog"} / {row.customer || "customer"} — {row.stop || "stop"}: {row.field}.{" "}
                              {row.correction}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <OverviewCard label="Services / legs" value={`${summary.services ?? "—"} / ${expected || "—"}`} />
                  <OverviewCard label="Assigned" value={String(assigned || "—")} />
                  <OverviewCard
                    label="Unassigned / blocked"
                    value={String(missingCount || 0)}
                    tone={missingCount ? "warn" : undefined}
                  />
                  <OverviewCard
                    label="Status"
                    value={ready ? "READY" : bundle ? "NEEDS ATTENTION" : "—"}
                    tone={ready ? undefined : "warn"}
                  />
                </div>
                {missingCount > 0 || addressIssues > 0 ? (
                  <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-50">
                    <p className="font-semibold">ROUTES NEED ATTENTION</p>
                    <p className="mt-1 text-rose-100/90">
                      {missingCount ? `${missingCount} transportation leg(s) unassigned or blocked. ` : null}
                      {addressIssues ? `${addressIssues} address issue(s) need review. ` : null}
                      Approval is blocked until every valid service is accounted for and locations resolve.
                    </p>
                    {missing.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-rose-50/95">
                        {missing.slice(0, 12).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            );
          })()}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewCard label="Pickup dogs" value={String(bundle?.plan.summary?.pickupDogs ?? pullMeta?.pickup ?? "—")} />
            <OverviewCard label="Drop-off dogs" value={String(bundle?.plan.summary?.dropoffDogs ?? pullMeta?.dropoff ?? "—")} />
            <OverviewCard
              label="Skipped classes"
              value={String(pullMeta?.skippedOccurrences.length ?? 0)}
              tone={pullMeta?.skippedOccurrences.some((row) => !row.assignedVanKey) ? "warn" : undefined}
            />
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

      {tab === "extras" ? (
        <RouteGeneratorExtras
          date={date}
          reportRunId={reportRunId}
          skippedOccurrences={pullMeta?.skippedOccurrences ?? []}
          busy={busy}
          onAssignSkipped={assignSkipped}
          onAddManualTaxi={addManualTaxi}
          onAddGingrTaxi={addGingrTaxi}
        />
      ) : null}

      {tab === "tracking" ? (
        <RouteGeneratorTrackingTab
          operatingDate={date}
          planId={bundle?.plan?.id ?? bootstrap?.latestPlan?.id ?? null}
          busy={busy}
          onBusy={setBusy}
        />
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
