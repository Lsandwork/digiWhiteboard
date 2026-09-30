"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  Printer,
  RefreshCw,
  Search,
  Truck,
  Upload
} from "lucide-react";
import {
  GINGR_ROUTE_ACTIVITIES,
  GINGR_ROUTE_ACTIVITY_BY_ID,
  type GingrRouteActivityId
} from "@/lib/gingr-route-generator/activities";
import type { GingrRouteDog, GingrRouteSchedulePayload } from "@/lib/gingr-route-generator/normalize";
import {
  type GingrActivityFilter,
  dogMatchesActivityFilter,
  groupDogsBySubject,
  subjectGroupAccent
} from "@/lib/gingr-route-generator/subject-groups";
import { gingrTransportDisplays } from "@/lib/gingr-route-generator/transportation-display";
import { resolveStopPlan } from "@/lib/gingr-route-generator/transportation-stops";
import { todayPacificDateKey } from "@/lib/gingr-route-generator/service";
import "./gingr-route-generator.css";

type LoadState = "loading" | "ready" | "error";

const CHIP_FILTERS: Array<{ id: GingrActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "class", label: "Class" },
  { id: "adventure_hike", label: "Adventure Hike" },
  { id: "beach_excursion", label: "Beach" },
  { id: "club", label: "Club" },
  { id: "taxi", label: "Taxi" }
];

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

function visibleClassActivities(dog: GingrRouteDog): GingrRouteActivityId[] {
  const classIds = dog.activities.filter((id) => GINGR_ROUTE_ACTIVITY_BY_ID[id]?.category === "class");
  return classIds.length ? classIds : dog.activities.filter((id) => id !== "club");
}

const DogRow = memo(function DogRow({ dog }: { dog: GingrRouteDog }) {
  const initial = (dog.name.trim().charAt(0) || "?").toUpperCase();
  const activities = visibleClassActivities(dog);
  const displays = gingrTransportDisplays(dog);
  const note = [dog.notes, dog.pickupInstructions].filter(Boolean).join(" · ");
  return (
    <article className="grg-dog-row">
      <div className="grg-avatar" aria-hidden>
        {initial}
      </div>
      <div className="grg-dog-identity">
        <div className="grg-dog-name">{dog.name}</div>
        <div className="grg-dog-owner">{dog.owner}</div>
      </div>
      <div className="grg-dog-activity">
        {activities.map((activityId) => (
          <span key={activityId} className={`grg-activity-badge grg-ab--${activityId}`}>
            {GINGR_ROUTE_ACTIVITY_BY_ID[activityId]?.label ?? activityId}
          </span>
        ))}
      </div>
      <div className="grg-dog-transport">
        {displays.map((display) => (
          <span key={display.kind} className={`grg-transport-badge ${display.className}`} title={display.title}>
            <strong>{display.strong}</strong>
            <em>{display.em}</em>
          </span>
        ))}
        {dog.routeVanKey && displays.some((display) => display.vanLeg) ? (
          <span className="grg-transport-badge" title={dog.assignedTo || dog.routeVanKey}>
            <strong>{dog.routeVanKey.replace("van_", "Van ")}</strong>
          </span>
        ) : null}
        {(dog.pickup || dog.dropoff) &&
        dog.addressStatus !== "ok" ? (
          <span className="grg-transport-badge grg-transport-badge--address">Address Required</span>
        ) : null}
        {!displays.length ? <span className="grg-transport-empty">No van</span> : null}
      </div>
      <div className="grg-dog-notes" title={note || undefined}>
        {note || "—"}
      </div>
      <div className="grg-dog-time">{dog.scheduledTimeLabel || "—"}</div>
    </article>
  );
});

export function GingrRouteGeneratorWorkspace() {
  const todayKey = useMemo(() => todayPacificDateKey(), []);
  const [dateKey, setDateKey] = useState(todayKey);
  const [payload, setPayload] = useState<GingrRouteSchedulePayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<GingrActivityFilter>("all");
  const [pickupOnly, setPickupOnly] = useState(false);
  const [dropoffOnly, setDropoffOnly] = useState(false);
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

  const filteredDogs = useMemo(() => {
    const dogs = payload?.dogs ?? [];
    const q = search.trim().toLowerCase();
    return dogs.filter((dog) => {
      if (pickupOnly && !dog.pickup) return false;
      if (dropoffOnly && !dog.dropoff) return false;
      if (!dogMatchesActivityFilter(dog, activityFilter)) return false;
      if (!q) return true;
      return (
        dog.name.toLowerCase().includes(q) ||
        dog.owner.toLowerCase().includes(q) ||
        dog.activityLabels.some((label) => label.toLowerCase().includes(q))
      );
    });
  }, [activityFilter, dropoffOnly, payload?.dogs, pickupOnly, search]);

  const dogsBySubject = useMemo(() => groupDogsBySubject(filteredDogs), [filteredDogs]);

  const routeGroups = useMemo(() => {
    const vans: Array<{ id: GingrRouteDog["routeVanKey"]; label: string }> = [
      { id: "van_1", label: "Van 1" },
      { id: "van_2", label: "Van 2" },
      { id: "van_3", label: "Van 3" },
      { id: "van_5", label: "Van 5 · Club / class / taxi" },
      { id: "van_6", label: "Van 6 · Club / class / taxi" }
    ];
    return vans
      .map((van) => {
        const dogs = filteredDogs.filter((d) => d.routeVanKey === van.id);
        if (!dogs.length) return null;
        const group = {
          groupId: van.id,
          label: van.label,
          accent: "#1F2937",
          accentSoft: "#F3F4F6",
          accentText: "#111827",
          pickups: dogs.filter((d) => resolveStopPlan(d).pickup?.locationType === "OWNER_HOME"),
          clubPickups: dogs.filter((d) => resolveStopPlan(d).pickup?.locationType === "FITDOG_CLUB"),
          atClub: dogs.filter(
            (d) => !resolveStopPlan(d).pickup && (d.ownerClubDropoff || d.alreadyOnProperty)
          ),
          dropoffs: dogs.filter((d) => resolveStopPlan(d).dropoff?.locationType === "OWNER_HOME"),
          clubReturns: dogs.filter((d) => resolveStopPlan(d).dropoff?.locationType === "FITDOG_CLUB"),
          clubDropoffs: dogs.filter((d) => !resolveStopPlan(d).dropoff && d.ownerClubPickup)
        };
        const hasStops = Object.values(group).some((value) => Array.isArray(value) && value.length);
        if (!hasStops) return null;
        return group;
      })
      .filter((group) => group !== null);
  }, [filteredDogs]);

  const totalPickups = useMemo(
    () => filteredDogs.filter((d) => d.pickup && d.pickupDestination === "home").length,
    [filteredDogs]
  );
  const totalDropoffs = useMemo(
    () => filteredDogs.filter((d) => d.dropoff && d.dropoffDestination === "home").length,
    [filteredDogs]
  );
  const totalReturnToClub = useMemo(
    () =>
      filteredDogs.filter((d) => !d.pickup && !d.dropoff && (d.ownerClubDropoff || d.ownerClubPickup || d.alreadyOnProperty))
        .length,
    [filteredDogs]
  );
  const exportEligibleCount = useMemo(() => filteredDogs.length, [filteredDogs]);
  const missingAddressDogs = useMemo(
    () =>
      filteredDogs.filter(
        (d) =>
          (d.pickup || d.dropoff) &&
          d.addressStatus &&
          d.addressStatus !== "ok"
      ),
    [filteredDogs]
  );
  const hasFilters = Boolean(search || activityFilter !== "all" || pickupOnly || dropoffOnly);

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

  const stats = payload?.stats;
  const updatedLabel = formatUpdatedTime(payload?.fetchedAt ?? null);

  return (
    <div className="grg-page">
      <header className="grg-header">
        <div className="grg-header-left">
          <Link href="/admin?board=staff&tab=sa_apps_hub" className="grg-back">
            ← Apps
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

      <section className="grg-stats" aria-label="Schedule statistics">
        <div className="grg-stat-card">
          <div className="grg-stat-value">{stats?.dogsScheduled ?? "—"}</div>
          <div className="grg-stat-label">Dogs</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{stats?.classCount ?? "—"}</div>
          <div className="grg-stat-label">Class</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{stats?.adventureHike ?? "—"}</div>
          <div className="grg-stat-label">Adventure Hike</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{stats?.transportationRequired ?? "—"}</div>
          <div className="grg-stat-label">Home van</div>
        </div>
      </section>

      {loadState === "error" ? (
        <div className="grg-error" role="alert">
          <h2>Unable to load Gingr schedule</h2>
          <p>{errorMessage || "We couldn't retrieve schedule data for this date."}</p>
          <button type="button" className="grg-primary-btn" onClick={() => void load(dateKey, true)}>
            Try Again
          </button>
        </div>
      ) : (
        <div className="grg-workspace">
          <section className="grg-list-panel">
            <div className="grg-filters">
              <label className="grg-search">
                <Search size={15} aria-hidden />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dogs or owners"
                  aria-label="Search dogs or owners"
                />
              </label>
              <select
                className="grg-select"
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as GingrActivityFilter)}
                aria-label="Filter by activity"
              >
                <option value="all">All Activities</option>
                <option value="class">Class</option>
                {GINGR_ROUTE_ACTIVITIES.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.label}
                  </option>
                ))}
              </select>
              <button type="button" className={`grg-toggle ${pickupOnly ? "is-active" : ""}`} onClick={() => setPickupOnly((v) => !v)}>
                <Truck size={14} />
                Home pickup
              </button>
              <button type="button" className={`grg-toggle ${dropoffOnly ? "is-active" : ""}`} onClick={() => setDropoffOnly((v) => !v)}>
                <MapPin size={14} />
                Home drop-off
              </button>
              {hasFilters ? (
                <button
                  type="button"
                  className="grg-clear"
                  onClick={() => {
                    setSearch("");
                    setActivityFilter("all");
                    setPickupOnly(false);
                    setDropoffOnly(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="grg-chips" role="tablist" aria-label="Activity chips">
              {CHIP_FILTERS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={activityFilter === chip.id}
                  className={`grg-chip ${activityFilter === chip.id ? "is-active" : ""}`}
                  onClick={() => setActivityFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="grg-dog-list">
              <div className="grg-dog-columns">
                <span className="grg-col-spacer" />
                <span>Dog</span>
                <span>Class / Activity</span>
                <span>Transport</span>
                <span>Notes</span>
                <span>Time</span>
              </div>

              {loadState === "loading" && !payload
                ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="grg-dog-row grg-dog-row--skeleton" />)
                : null}

              {loadState === "ready" && filteredDogs.length === 0 ? (
                <div className="grg-empty">
                  <h3>No dogs for this filter</h3>
                  <p>Try All, or pick another date.</p>
                </div>
              ) : null}

              {dogsBySubject.map((group) => {
                const colors = subjectGroupAccent(group.id);
                return (
                  <section key={group.id} className="grg-subject-group">
                    <header
                      className="grg-subject-header"
                      style={{ background: colors.accentSoft, color: colors.accentText }}
                    >
                      <span className="grg-subject-title">{group.label}</span>
                      <span className="grg-subject-count">{group.dogs.length}</span>
                    </header>
                    {group.dogs.map((dog) => (
                      <DogRow key={`${group.id}-${dog.id}`} dog={dog} />
                    ))}
                  </section>
                );
              })}
            </div>
          </section>

          <aside className="grg-route-panel">
            <div className="grg-route-header">
              <h2>Route Plan</h2>
              <p>Van 1–3 are outing vans. Van 5 and Van 6 stay at Fitdog Club for class, taxi, and home transport.</p>
            </div>
            <div className="grg-route-body">
              {loadState === "ready" && routeGroups.length === 0 ? (
                <div className="grg-route-empty">No van stops for this filter.</div>
              ) : null}
              {routeGroups.map((group) => {
                const count = new Set([
                  ...group.pickups.map((d) => d.id),
                  ...group.clubPickups.map((d) => d.id),
                  ...group.atClub.map((d) => d.id),
                  ...group.dropoffs.map((d) => d.id),
                  ...group.clubReturns.map((d) => d.id),
                  ...group.clubDropoffs.map((d) => d.id)
                ]).size;
                return (
                  <section key={group.groupId} className="grg-route-section">
                    <header className="grg-route-section-head" style={{ background: group.accentSoft, color: group.accentText }}>
                      <span className="grg-route-section-name">{group.label}</span>
                      <span className="grg-route-count" style={{ background: group.accent }}>
                        {count}
                      </span>
                    </header>
                    {group.pickups.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">HOME PICKUPS</div>
                        <ol>
                          {group.pickups.map((dog, index) => (
                            <li key={`pu-${dog.id}`}>
                              {index + 1}. {dog.name}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {group.clubPickups.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">FITDOG CLUB PICKUPS</div>
                        <ol>
                          {group.clubPickups.map((dog, index) => (
                            <li key={`cpu-van-${dog.id}`}>
                              {index + 1}. {dog.name} {dog.ownerLastName || ""}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {group.atClub.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">AT FITDOG CLUB — NO VAN</div>
                        <ol>
                          {group.atClub.map((dog, index) => (
                            <li key={`cpu-${dog.id}`}>
                              {index + 1}. {dog.name} {dog.ownerLastName || ""}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {group.dropoffs.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">HOME DROP-OFFS</div>
                        <ol>
                          {group.dropoffs.map((dog, index) => (
                            <li key={`do-${dog.id}`}>
                              {index + 1}. {dog.name}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {group.clubReturns.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">FITDOG CLUB DROP-OFFS</div>
                        <ol>
                          {group.clubReturns.map((dog, index) => (
                            <li key={`cdo-van-${dog.id}`}>
                              {index + 1}. {dog.name} {dog.ownerLastName || ""}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {group.clubDropoffs.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">OWNER PICK-UP AT CLUB</div>
                        <ol>
                          {group.clubDropoffs.map((dog, index) => (
                            <li key={`cdo-${dog.id}`}>
                              {index + 1}. {dog.name} {dog.ownerLastName || ""}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
            <footer className="grg-route-footer">
              <div className="grg-route-totals">
                <div>
                  Home pickups <strong>{totalPickups}</strong>
                </div>
                <div>
                  Home drop-offs <strong>{totalDropoffs}</strong>
                </div>
                <div>
                  Club stops <strong>{totalReturnToClub}</strong>
                </div>
              </div>
              <div className="grg-route-actions">
                <button type="button" className="grg-print-btn" onClick={() => window.print()}>
                  <Printer size={15} />
                  Print
                </button>
              </div>
              {missingAddressDogs.length ? (
                <p className="grg-export-warning">
                  Address missing: {missingAddressDogs.map((d) => d.name).join(", ")}
                </p>
              ) : null}
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
