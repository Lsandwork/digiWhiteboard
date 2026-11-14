"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  RefreshCw,
  Upload
} from "lucide-react";
import type { GingrRouteSchedulePayload } from "@/lib/gingr-route-generator/normalize";
import { todayPacificDateKey } from "@/lib/gingr-route-generator/service";
import { GingrRouteBoard } from "@/components/gingr-route-generator/GingrRouteBoard";
import "./gingr-route-generator.css";

type LoadState = "loading" | "ready" | "error";

function shiftDateKey(dateKey: string, deltaDays: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function formatHeaderDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatUpdatedTime(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function GingrRouteGeneratorWorkspace({
  backHref = "/admin?board=staff&tab=sa_apps_hub",
  backLabel = "Apps"
}: {
  backHref?: string;
  backLabel?: string;
}) {
  const todayKey = useMemo(() => todayPacificDateKey(), []);
  const [dateKey, setDateKey] = useState(todayKey);
  const [payload, setPayload] = useState<GingrRouteSchedulePayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingSamsara, setExportingSamsara] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [exportVehicle, setExportVehicle] = useState("All vans");
  const [sendLiveTrackingSms, setSendLiveTrackingSms] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async (date: string, refresh: boolean) => {
    if (inFlightRef.current && refresh) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;
    inFlightRef.current = true;
    if (refresh) setRefreshing(true);
    else setLoadState("loading");
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({ date });
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/admin/gingr-route-generator?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal
      });
      const data = (await res.json()) as GingrRouteSchedulePayload & {
        error?: string;
        detail?: string;
      };
      if (seq !== requestSeq.current) return;
      if (!res.ok) {
        setLoadState("error");
        setErrorMessage(data.detail || data.error || "Unable to load Gingr schedule");
        setPayload(null);
        return;
      }
      setPayload(data);
      setLoadState("ready");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      if (seq !== requestSeq.current) return;
      setLoadState("error");
      setErrorMessage("We couldn't retrieve schedule data for this date.");
      setPayload(null);
    } finally {
      if (seq === requestSeq.current) {
        inFlightRef.current = false;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(dateKey, false);
    return () => abortRef.current?.abort();
  }, [dateKey, load]);

  const exportEligibleCount = payload?.dogs.length ?? 0;

  async function exportSamsaraCsv() {
    if (exportingSamsara || exportEligibleCount === 0) return;
    setExportingSamsara(true);
    setExportMessage(null);
    setExportWarning(null);
    try {
      const params = new URLSearchParams({ date: dateKey, vehicle: exportVehicle });
      if (sendLiveTrackingSms) params.set("sendOwnerSms", "1");
      const res = await fetch(`/api/admin/gingr-route-generator/samsara-export?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        csv?: string;
        summary?: {
          fileName: string;
          stopCount: number;
          pickupCount: number;
          dropoffCount: number;
          excludedMissingAddress: number;
        };
        missingAddressStops?: Array<{ dogName: string; ownerName: string; kind: string }>;
        ownerTracking?: {
          attempted?: boolean;
          reason?: string;
          smsQueued?: number;
          created?: number;
          smsEnabled?: boolean;
          smsDeferredQuietHours?: boolean;
          smsBlockedByKillSwitch?: boolean;
          smsErrors?: string[];
        };
        ownerTrackingError?: string | null;
      };
      if (!res.ok || !data.ok || !data.csv || !data.summary) {
        const missing = data.missingAddressStops?.length
          ? ` Missing addresses: ${data.missingAddressStops
              .map((s) => `${s.dogName} (${s.kind.replace("_", " ")})`)
              .join(", ")}.`
          : "";
        setExportWarning((data.error || "Unable to export Samsara CSV.") + missing);
        return;
      }
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.summary.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMessage(
        `Samsara CSV ready — ${data.summary.stopCount} stops (${data.summary.pickupCount} pickups, ${data.summary.dropoffCount} drop-offs).`
      );
      const trackingWarnings: string[] = [];
      if (data.summary.excludedMissingAddress > 0) {
        trackingWarnings.push(
          `${data.summary.excludedMissingAddress} stop(s) excluded due to missing addresses.`
        );
      }
      if (data.ownerTrackingError) {
        trackingWarnings.push(`Live tracking SMS failed: ${data.ownerTrackingError}`);
      } else if (sendLiveTrackingSms && data.ownerTracking?.attempted) {
        const queued = data.ownerTracking.smsQueued ?? 0;
        setExportMessage(
          `Samsara CSV ready — ${data.summary.stopCount} stops (${data.summary.pickupCount} pickups, ${data.summary.dropoffCount} drop-offs). Live tracking SMS sent to ${queued} pickup owner${queued === 1 ? "" : "s"}.`
        );
        if (data.ownerTracking.smsDeferredQuietHours) {
          trackingWarnings.push("Owner SMS is outside service hours; tracking links were saved but not texted yet.");
        }
        if (data.ownerTracking.smsBlockedByKillSwitch) {
          trackingWarnings.push("Owner SMS is disabled in settings; tracking links were created without texting.");
        }
        if (data.ownerTracking.smsErrors?.length) {
          trackingWarnings.push(data.ownerTracking.smsErrors.slice(0, 3).join(" "));
        }
      } else if (sendLiveTrackingSms && data.ownerTracking?.reason === "no_pickups") {
        trackingWarnings.push("No home pickups to text for live tracking.");
      }
      if (trackingWarnings.length) {
        setExportWarning(trackingWarnings.join(" "));
      }
    } catch {
      setExportWarning("Unable to export Samsara CSV. Please try again.");
    } finally {
      setExportingSamsara(false);
    }
  }

  async function uploadGingrFile(file: File) {
    if (uploadingFile) return;
    setUploadingFile(true);
    setExportMessage(null);
    setExportWarning(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("date", dateKey);
      const res = await fetch("/api/admin/gingr-route-generator/upload", {
        method: "POST",
        credentials: "same-origin",
        body
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        payload?: GingrRouteSchedulePayload;
      };
      if (!res.ok || !data.ok || !data.payload) {
        setExportWarning(data.error || "Unable to import that Gingr file.");
        return;
      }
      setPayload(data.payload);
      setLoadState("ready");
      setExportMessage(data.message || `Imported ${data.payload.stats.dogsScheduled} dog(s).`);
    } catch {
      setExportWarning("Unable to import that Gingr file. Try a CSV export from Gingr.");
    } finally {
      setUploadingFile(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  const updatedLabel = formatUpdatedTime(payload?.fetchedAt ?? null);

  return (
    <div className="grg-page">
      <header className="grg-header">
        <div className="grg-header-left">
          <Link href={backHref} className="grg-back">
            ← {backLabel}
          </Link>
          <h1 className="grg-title">Gingr Route Generator</h1>
        </div>
        <div className="grg-header-controls">
          <div className="grg-date-group" role="group" aria-label="Schedule date">
            <button type="button" className="grg-icon-btn" aria-label="Previous day" onClick={() => setDateKey((d) => shiftDateKey(d, -1))}>
              <ChevronLeft size={16} />
            </button>
            <div className="grg-date-display">
              <Calendar size={14} aria-hidden />
              <span>{formatHeaderDate(dateKey)}</span>
            </div>
            <button type="button" className="grg-icon-btn" aria-label="Next day" onClick={() => setDateKey((d) => shiftDateKey(d, 1))}>
              <ChevronRight size={16} />
            </button>
            <button type="button" className="grg-today-btn" onClick={() => setDateKey(todayPacificDateKey())}>
              Today
            </button>
          </div>
          <button
            type="button"
            className="grg-refresh-btn"
            disabled={refreshing || loadState === "loading"}
            onClick={() => void load(dateKey, true)}
          >
            <RefreshCw size={15} className={refreshing ? "grg-spin" : undefined} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {updatedLabel ? <div className="grg-updated">Updated {updatedLabel}</div> : null}
        </div>
      </header>

      <div className="grg-export-toolbar" role="group" aria-label="Samsara export and live tracking">
        <input
          ref={uploadInputRef}
          type="file"
          accept=".csv,.txt,application/pdf,.pdf,text/csv"
          className="grg-upload-input"
          aria-label="Upload Gingr CSV or PDF"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadGingrFile(file);
          }}
        />
        <button
          type="button"
          className="grg-export-btn"
          onClick={() => uploadInputRef.current?.click()}
          disabled={uploadingFile}
        >
          <Upload size={15} />
          {uploadingFile ? "Importing…" : "Upload Gingr CSV or PDF"}
        </button>
        <label className="grg-sms-toggle">
          <input
            type="checkbox"
            checked={sendLiveTrackingSms}
            onChange={(e) => setSendLiveTrackingSms(e.target.checked)}
          />
          <span>Send live tracking SMS to pickup owners</span>
        </label>
        <select
          className="grg-export-vehicle"
          value={exportVehicle}
          onChange={(e) => setExportVehicle(e.target.value)}
          aria-label="Samsara van"
        >
          <option value="All vans">All vans</option>
          <option value="Van 01">Van 01</option>
          <option value="Van 02">Van 02</option>
          <option value="Van 03">Van 03</option>
          <option value="Van 05">Van 05</option>
          <option value="Van 06">Van 06</option>
        </select>
        <button
          type="button"
          className="grg-export-btn"
          onClick={() => void exportSamsaraCsv()}
          disabled={exportingSamsara || exportEligibleCount === 0}
        >
          <Download size={15} />
          {exportingSamsara ? "Preparing…" : "Export"}
        </button>
        <button type="button" className="grg-print-btn" onClick={() => window.print()}>
          <Printer size={15} />
          Print
        </button>
        {exportMessage ? <p className="grg-export-status">{exportMessage}</p> : null}
        {exportWarning ? <p className="grg-export-warning">{exportWarning}</p> : null}
        {payload?.source === "upload" && payload.uploadFileName ? (
          <p className="grg-export-status">
            Using uploaded file {payload.uploadFileName}. Export writes a shortest-distance Samsara route (no traffic). Refresh pulls live Gingr again.
          </p>
        ) : null}
      </div>

      {loadState === "error" ? (
        <div className="grg-error" role="alert">
          <h2>Unable to load Gingr schedule</h2>
          <p>{errorMessage || "We couldn't retrieve schedule data for this date."}</p>
          <button type="button" className="grg-primary-btn" onClick={() => void load(dateKey, true)}>
            Try Again
          </button>
        </div>
      ) : (
        <GingrRouteBoard dogs={payload?.dogs ?? []} loading={loadState === "loading"} />
      )}
    </div>
  );
}
