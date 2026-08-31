"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dog,
  MapPin,
  Mountain,
  PawPrint,
  Printer,
  RefreshCw,
  Search,
  Truck,
  Waves,
  X
} from "lucide-react";
import {
  GINGR_ROUTE_ACTIVITIES,
  GINGR_ROUTE_ACTIVITY_BY_ID,
  type GingrRouteActivityId
} from "@/lib/gingr-route-generator/activities";
import type { GingrRouteDog, GingrRouteSchedulePayload } from "@/lib/gingr-route-generator/normalize";
import { todayPacificDateKey } from "@/lib/gingr-route-generator/service";
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
    day: "numeric",
    year: "numeric"
  });
}

function formatUpdatedTime(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function DogAvatar({ dog }: { dog: GingrRouteDog }) {
  const [failed, setFailed] = useState(false);
  if (!dog.imageUrl || failed) {
    return (
      <div className="grg-avatar grg-avatar--fallback" aria-hidden>
        <Dog size={18} strokeWidth={1.75} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="grg-avatar"
      src={dog.imageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ActivityBadge({ activityId }: { activityId: GingrRouteActivityId }) {
  const meta = GINGR_ROUTE_ACTIVITY_BY_ID[activityId];
  if (!meta) return null;
  return (
    <span
      className="grg-activity-badge"
      style={{
        background: meta.accentSoft,
        color: meta.accentText,
        borderColor: `${meta.accent}33`
      }}
    >
      {meta.label}
    </span>
  );
}

export function GingrRouteGeneratorWorkspace() {
  const todayKey = useMemo(() => todayPacificDateKey(), []);
  const [dateKey, setDateKey] = useState(todayKey);
  const [payload, setPayload] = useState<GingrRouteSchedulePayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<GingrRouteActivityId | "all">("all");
  const [pickupOnly, setPickupOnly] = useState(false);
  const [dropoffOnly, setDropoffOnly] = useState(false);
  const [activityChip, setActivityChip] = useState<GingrRouteActivityId | "all">("all");

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
    // Fetch schedule when the selected date changes (abort in-flight requests on cleanup).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on date change
    void load(dateKey, false);
    return () => abortRef.current?.abort();
  }, [dateKey, load]);

  const filteredDogs = useMemo(() => {
    const dogs = payload?.dogs ?? [];
    const q = search.trim().toLowerCase();
    return dogs.filter((dog) => {
      if (pickupOnly && !dog.pickup) return false;
      if (dropoffOnly && !dog.dropoff) return false;
      const activityNeedle = activityChip !== "all" ? activityChip : activityFilter;
      if (activityNeedle !== "all" && !dog.activities.includes(activityNeedle)) return false;
      if (!q) return true;
      return (
        dog.name.toLowerCase().includes(q) ||
        dog.owner.toLowerCase().includes(q) ||
        dog.activityLabels.some((label) => label.toLowerCase().includes(q))
      );
    });
  }, [activityChip, activityFilter, dropoffOnly, payload?.dogs, pickupOnly, search]);

  const routeGroups = useMemo(() => {
    const groups: Array<{
      activityId: GingrRouteActivityId;
      pickups: GingrRouteDog[];
      dropoffs: GingrRouteDog[];
      selfDropoffs: GingrRouteDog[];
    }> = [];

    for (const activity of GINGR_ROUTE_ACTIVITIES) {
      const inActivity = filteredDogs.filter((d) => d.activities.includes(activity.id));
      if (!inActivity.length) continue;
      groups.push({
        activityId: activity.id,
        pickups: inActivity.filter((d) => d.pickup),
        dropoffs: inActivity.filter((d) => d.dropoff),
        selfDropoffs: inActivity.filter((d) => !d.pickup && !d.dropoff)
      });
    }
    return groups;
  }, [filteredDogs]);

  const totalPickups = filteredDogs.filter((d) => d.pickup).length;
  const totalDropoffs = filteredDogs.filter((d) => d.dropoff).length;
  const hasFilters = Boolean(search || activityFilter !== "all" || activityChip !== "all" || pickupOnly || dropoffOnly);

  function clearFilters() {
    setSearch("");
    setActivityFilter("all");
    setActivityChip("all");
    setPickupOnly(false);
    setDropoffOnly(false);
  }

  function printRoute() {
    window.print();
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
          <p className="grg-subtitle">Generate operational routes directly from Gingr schedules.</p>
        </div>

        <div className="grg-header-controls">
          <div className="grg-date-group" role="group" aria-label="Schedule date">
            <button
              type="button"
              className="grg-icon-btn"
              aria-label="Previous day"
              onClick={() => setDateKey((d) => shiftDateKey(d, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="grg-date-display">
              <Calendar size={14} aria-hidden />
              <span>{formatHeaderDate(dateKey)}</span>
            </div>
            <button
              type="button"
              className="grg-icon-btn"
              aria-label="Next day"
              onClick={() => setDateKey((d) => shiftDateKey(d, 1))}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="grg-today-btn"
              onClick={() => setDateKey(todayPacificDateKey())}
            >
              Today
            </button>
          </div>

          <div className="grg-refresh-wrap">
            <button
              type="button"
              className="grg-refresh-btn"
              disabled={refreshing || loadState === "loading"}
              onClick={() => void load(dateKey, true)}
            >
              <RefreshCw size={15} className={refreshing ? "grg-spin" : undefined} />
              Refresh Gingr Data
            </button>
            {updatedLabel ? (
              <div className="grg-updated">
                <span className="grg-updated-dot" aria-hidden />
                Last updated {updatedLabel}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grg-stats" aria-label="Schedule statistics">
        {(
          [
            {
              key: "dogs",
              label: "Dogs Scheduled",
              value: stats?.dogsScheduled ?? "—",
              icon: <Dog size={18} />,
              tone: "blue"
            },
            {
              key: "hike",
              label: "Adventure Hike",
              value: stats?.adventureHike ?? "—",
              icon: <Mountain size={18} />,
              tone: "green"
            },
            {
              key: "beach",
              label: "Beach Excursion",
              value: stats?.beachExcursion ?? "—",
              icon: <Waves size={18} />,
              tone: "sky"
            },
            {
              key: "transport",
              label: "Transportation Required",
              value: stats?.transportationRequired ?? "—",
              icon: <Truck size={18} />,
              tone: "purple"
            }
          ] as const
        ).map((card) => (
          <div key={card.key} className={`grg-stat-card grg-stat-card--${card.tone}`}>
            <div className="grg-stat-icon">{card.icon}</div>
            <div className="grg-stat-body">
              {loadState === "loading" && !payload ? (
                <div className="grg-skeleton grg-skeleton--stat" />
              ) : (
                <div className="grg-stat-value">{card.value}</div>
              )}
              <div className="grg-stat-label">{card.label}</div>
            </div>
          </div>
        ))}
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
                  placeholder="Search dogs or owners..."
                  aria-label="Search dogs or owners"
                />
              </label>

              <select
                className="grg-select"
                value={activityFilter}
                onChange={(e) => {
                  const value = e.target.value as GingrRouteActivityId | "all";
                  setActivityFilter(value);
                  setActivityChip(value);
                }}
                aria-label="Filter by activity"
              >
                <option value="all">All Activities</option>
                {GINGR_ROUTE_ACTIVITIES.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`grg-toggle ${pickupOnly ? "is-active" : ""}`}
                onClick={() => setPickupOnly((v) => !v)}
              >
                <Truck size={14} />
                Pick Up Required
              </button>
              <button
                type="button"
                className={`grg-toggle ${dropoffOnly ? "is-active" : ""}`}
                onClick={() => setDropoffOnly((v) => !v)}
              >
                <MapPin size={14} />
                Drop Off Required
              </button>

              {hasFilters ? (
                <button type="button" className="grg-clear" onClick={clearFilters}>
                  Clear Filters
                </button>
              ) : null}
            </div>

            <div className="grg-chips" role="tablist" aria-label="Activity chips">
              <button
                type="button"
                role="tab"
                aria-selected={activityChip === "all"}
                className={`grg-chip ${activityChip === "all" ? "is-active" : ""}`}
                onClick={() => {
                  setActivityChip("all");
                  setActivityFilter("all");
                }}
              >
                All Dogs
              </button>
              {GINGR_ROUTE_ACTIVITIES.map((activity) => (
                <button
                  key={activity.id}
                  type="button"
                  role="tab"
                  aria-selected={activityChip === activity.id}
                  className={`grg-chip ${activityChip === activity.id ? "is-active" : ""}`}
                  onClick={() => {
                    setActivityChip(activity.id);
                    setActivityFilter(activity.id);
                  }}
                >
                  {activity.label}
                </button>
              ))}
            </div>

            <div className="grg-dog-list">
              {loadState === "loading" && !payload
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="grg-dog-row grg-dog-row--skeleton">
                      <div className="grg-skeleton grg-skeleton--avatar" />
                      <div className="grg-skeleton grg-skeleton--line" />
                      <div className="grg-skeleton grg-skeleton--pill" />
                    </div>
                  ))
                : null}

              {loadState === "ready" && filteredDogs.length === 0 ? (
                <div className="grg-empty">
                  <PawPrint size={28} strokeWidth={1.5} />
                  <h3>No route activities scheduled</h3>
                  <p>No dogs are scheduled for eligible route activities on this date.</p>
                </div>
              ) : null}

              {filteredDogs.map((dog) => {
                const primaryActivity = dog.activities[0];
                return (
                  <article key={dog.id} className="grg-dog-row">
                    <DogAvatar dog={dog} />
                    <div className="grg-dog-identity">
                      <div className="grg-dog-name">{dog.name}</div>
                      <div className="grg-dog-owner">{dog.owner}</div>
                    </div>
                    <div className="grg-dog-activity">
                      {primaryActivity ? <ActivityBadge activityId={primaryActivity} /> : null}
                      {dog.activities.length > 1 ? (
                        <span className="grg-more-activities">+{dog.activities.length - 1}</span>
                      ) : null}
                    </div>
                    <div className="grg-dog-transport">
                      {dog.pickup ? (
                        <span className="grg-transport-badge grg-transport-badge--pickup">
                          <Truck size={12} />
                          Pick Up
                        </span>
                      ) : null}
                      {dog.dropoff ? (
                        <span className="grg-transport-badge grg-transport-badge--dropoff">
                          <MapPin size={12} />
                          Drop Off
                        </span>
                      ) : null}
                    </div>
                    <div className="grg-dog-meta">
                      {dog.scheduledTimeLabel ? (
                        <span className="grg-dog-time">
                          <Clock size={12} />
                          {dog.scheduledTimeLabel}
                        </span>
                      ) : null}
                      {dog.notes ? <span className="grg-dog-notes">{dog.notes}</span> : null}
                    </div>
                    <ChevronRight className="grg-row-chevron" size={16} aria-hidden />
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="grg-route-panel">
            <div className="grg-route-header">
              <div className="grg-route-title-row">
                <PawPrint size={16} />
                <h2>Route Plan</h2>
              </div>
              <p>Optimized by activity, pickup and drop-off</p>
            </div>

            <div className="grg-route-body">
              {loadState === "loading" && !payload
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="grg-route-section grg-route-section--skeleton">
                      <div className="grg-skeleton grg-skeleton--route-head" />
                      <div className="grg-skeleton grg-skeleton--line" />
                      <div className="grg-skeleton grg-skeleton--line" />
                    </div>
                  ))
                : null}

              {loadState === "ready" && routeGroups.length === 0 ? (
                <div className="grg-route-empty">No dogs match the current filters.</div>
              ) : null}

              {routeGroups.map((group) => {
                const meta = GINGR_ROUTE_ACTIVITY_BY_ID[group.activityId];
                const count =
                  new Set([
                    ...group.pickups.map((d) => d.id),
                    ...group.dropoffs.map((d) => d.id),
                    ...group.selfDropoffs.map((d) => d.id)
                  ]).size;
                return (
                  <section key={group.activityId} className="grg-route-section">
                    <header
                      className="grg-route-section-head"
                      style={{ background: meta.accentSoft, color: meta.accentText }}
                    >
                      <span className="grg-route-section-name">{meta.label}</span>
                      <span className="grg-route-count" style={{ background: meta.accent }}>
                        {count}
                      </span>
                    </header>

                    {group.pickups.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">
                          <Truck size={12} />
                          PICK UP
                        </div>
                        <ol>
                          {group.pickups.map((dog, index) => (
                            <li key={`pu-${dog.id}`}>
                              <span className="grg-route-index">{index + 1}.</span>
                              <div>
                                <div className="grg-route-dog-name">{dog.name}</div>
                                <div className="grg-route-dog-owner">{dog.owner}</div>
                                {dog.scheduledTimeLabel ? (
                                  <div className="grg-route-dog-time">{dog.scheduledTimeLabel}</div>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}

                    {group.selfDropoffs.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">SELF DROP-OFF</div>
                        <ol>
                          {group.selfDropoffs.map((dog, index) => (
                            <li key={`self-${dog.id}`}>
                              <span className="grg-route-index">{index + 1}.</span>
                              <div>
                                <div className="grg-route-dog-name">{dog.name}</div>
                                <div className="grg-route-dog-owner">{dog.owner}</div>
                                {dog.scheduledTimeLabel ? (
                                  <div className="grg-route-dog-time">{dog.scheduledTimeLabel}</div>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}

                    {group.dropoffs.length ? (
                      <div className="grg-route-group">
                        <div className="grg-route-group-label">
                          <MapPin size={12} />
                          DROP OFF AFTER ACTIVITY
                        </div>
                        <ol>
                          {group.dropoffs.map((dog, index) => (
                            <li key={`do-${dog.id}`}>
                              <span className="grg-route-index">{index + 1}.</span>
                              <div>
                                <div className="grg-route-dog-name">{dog.name}</div>
                                <div className="grg-route-dog-owner">{dog.owner}</div>
                                {dog.scheduledTimeLabel ? (
                                  <div className="grg-route-dog-time">{dog.scheduledTimeLabel}</div>
                                ) : null}
                              </div>
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
                  <Truck size={14} />
                  Total Pick Ups <strong>{totalPickups}</strong>
                </div>
                <div>
                  <MapPin size={14} />
                  Total Drop Offs <strong>{totalDropoffs}</strong>
                </div>
              </div>
              <button type="button" className="grg-print-btn" onClick={printRoute}>
                <Printer size={15} />
                Print Route
              </button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
