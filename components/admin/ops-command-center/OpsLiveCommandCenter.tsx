"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  BookOpen,
  CalendarPlus,
  Car,
  Dog,
  GraduationCap,
  Headset,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  UserPlus
} from "lucide-react";
import { SmsCostDashboardCard } from "@/components/admin/ops-command-center/SmsCostDashboardCard";
import { startVisibilityAwareInterval } from "@/lib/visibility-poll";
import { readResponseJson } from "@/lib/http/read-response-json";
import { humanizeUnknownError } from "@/lib/safe-url";
import type { CommandCenterView } from "@/lib/ops-command-center/action-queue";
import type { FloorCategory, FloorDog } from "@/lib/ops-command-center/live-floor";
import type { TimelineStatus } from "@/lib/ops-command-center/command-dashboard";
import "./ops-live-command-center.css";

const POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 25_000;
const FACILITY_AERIAL = "/assets/ruffops/map/fitdog-facility-aerial.png";
const RUFFOPS_MARK = "/assets/ruffops/brand/ruffops-mark.svg";

const CATEGORY_LABELS: Record<FloorCategory, string> = {
  boarding: "Boarding",
  daycare: "Daycare",
  training: "Training",
  grooming: "Grooming",
  outing: "Hikes & outings",
  other: "Other"
};
const CATEGORY_ORDER: FloorCategory[] = ["boarding", "daycare", "training", "grooming", "outing", "other"];
const STATUS_COPY: Record<TimelineStatus, string> = {
  on_track: "On Track",
  in_progress: "In Progress",
  pending: "Pending",
  upcoming: "Upcoming",
  late: "Late"
};

function clock(value: string | null) {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
}

function pacificNow() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

function matches(dog: FloorDog, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [dog.dogName, dog.ownerName, dog.breed, dog.serviceType].some((field) => field?.toLowerCase().includes(q));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "ST";
}

function DogFlags({ dog }: { dog: FloorDog }) {
  return (
    <span>
      {dog.allergies ? <span className="ops-live__flag ops-live__flag--danger">Allergy</span> : null}
      {dog.medicines ? <span className="ops-live__flag ops-live__flag--warning">Meds</span> : null}
    </span>
  );
}

const KPI_ICONS = {
  dog: Dog,
  calendar: CalendarPlus,
  car: Car,
  graduation: GraduationCap
} as const;

export function OpsLiveCommandCenter({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [view, setView] = useState<CommandCenterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const inFlight = useRef(false);

  const load = useCallback(async (force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (force) setSyncing(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/admin/ops-command-center?view=live_floor${force ? "&refresh=1" : ""}`, {
        cache: "no-store",
        signal: controller.signal
      });
      const body = await readResponseJson<CommandCenterView & { error?: string }>(response);
      if (!response.ok) throw new Error(body?.error || `Command Center returned ${response.status}.`);
      setView(body);
      setError(null);
    } catch (caught) {
      setError(
        controller.signal.aborted
          ? "The Command Center took too long to answer. The last good data is still shown."
          : humanizeUnknownError(caught, "Unable to load the Command Center.")
      );
    } finally {
      window.clearTimeout(timer);
      inFlight.current = false;
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => void load(), 0);
    const stop = startVisibilityAwareInterval(() => void load(), POLL_MS);
    return () => {
      window.clearTimeout(boot);
      stop();
    };
  }, [load]);

  const floor = view?.floor;
  const dashboard = view?.dashboard;
  const grouped = useMemo(() => {
    const groups = new Map<FloorCategory, FloorDog[]>();
    for (const dog of floor?.onSite ?? []) {
      if (!matches(dog, query.trim())) continue;
      groups.set(dog.category, [...(groups.get(dog.category) ?? []), dog]);
    }
    return CATEGORY_ORDER.filter((key) => groups.has(key)).map((key) => ({ key, dogs: groups.get(key)! }));
  }, [floor?.onSite, query]);

  const failedSources = (view?.sources ?? []).filter((source) => !source.ok);
  const healthClass =
    dashboard?.health === "operational" ? "ops-live__chip--live" : dashboard?.health === "degraded" ? "ops-live__chip--warn" : "ops-live__chip--danger";
  const showSmsCost =
    view?.staffMission?.roleKey === "super_admin" ||
    view?.staffMission?.roleKey === "admin" ||
    view?.staffMission?.roleKey === "management";

  if (loading && !view) {
    return (
      <section className="ops-live" aria-busy="true">
        <p className="ops-live__muted">Loading live facility state from Gingr and staff ops…</p>
      </section>
    );
  }

  return (
    <section className="ops-live">
      <header className="ops-live__exec">
        <div className="ops-live__brand">
          {/* SVG mark — native img so Next Image does not rasterize the logo */}
          <img src={RUFFOPS_MARK} alt="" width={44} height={44} />
          <div>
            <p className="ops-live__kicker">RuffOps</p>
            <h2 className="ops-live__title">Ops Command Center</h2>
            <p className="ops-live__muted">Real-time operations. A smoother day for dogs, staff, and members.</p>
          </div>
        </div>
        <div className="ops-live__exec-meta">
          <span className={`ops-live__chip ${healthClass}`}>
            {dashboard?.health === "operational" ? "Live" : dashboard?.health === "degraded" ? "Partial" : "Offline"}
          </span>
          <span className={`ops-live__chip ${healthClass}`}>{dashboard?.healthLabel ?? "Checking systems"}</span>
          <span className="ops-live__chip ops-live__clock">{pacificNow()}</span>
          <button type="button" className="ops-live__button" onClick={() => void load(true)} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? "ops-live__spin" : undefined} aria-hidden />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </header>

      {error || failedSources.length ? (
        <div className="ops-live__banner" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            {error ? <p>{error}</p> : null}
            {failedSources.map((source) => (
              <p key={source.key}>
                {source.label} could not be read: {source.detail || "unavailable"}.
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ops-live__kpis">
        {(dashboard?.kpis ?? []).map((kpi) => {
          const Icon = KPI_ICONS[kpi.icon];
          return (
            <button key={kpi.id} type="button" className={`ops-live__kpi ops-live__kpi--${kpi.tone}`} onClick={() => onNavigate(kpi.hrefTab)}>
              <Icon size={18} aria-hidden />
              <span className="ops-live__kpi-label">{kpi.label}</span>
              <span className="ops-live__kpi-value">{kpi.value}</span>
              <span className="ops-live__muted">{kpi.detail}</span>
            </button>
          );
        })}
      </div>

      <div className="ops-live__grid">
        <section className="ops-live__card">
          <div className="ops-live__section-head">
            <h3 className="ops-live__section-title">Today&apos;s Operations</h3>
            <button type="button" className="ops-live__link" onClick={() => onNavigate("my_shift")}>
              My Shift
            </button>
          </div>
          {dashboard?.timeline.length ? (
            <ul className="ops-live__list">
              {dashboard.timeline.map((item) => (
                <li key={item.id}>
                  <button type="button" className="ops-live__row" onClick={() => onNavigate(item.hrefTab)}>
                    <span className={`ops-live__dot ops-live__dot--${item.status}`} aria-hidden />
                    <span>
                      <span className="ops-live__strong">{item.title}</span>
                      <span className="ops-live__muted"> {item.detail}</span>
                    </span>
                    <span className="ops-live__status">{STATUS_COPY[item.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ops-live__muted">No Gingr arrivals, pickups, grooming, or classes to sequence yet.</p>
          )}
        </section>

        <div className="ops-live__stack">
          <section className="ops-live__card">
            <div className="ops-live__section-head">
              <h3 className="ops-live__section-title">Active Issues</h3>
              <button type="button" className="ops-live__link" onClick={() => onNavigate("active_issues")}>
                View all
              </button>
            </div>
            <div className="ops-live__count">
              <div className="ops-live__count-row">
                <span>Open issues</span>
                <strong>{dashboard?.issues.open ?? 0}</strong>
              </div>
              <div className="ops-live__count-row">
                <span>Needs attention</span>
                <strong>{dashboard?.issues.needsAttention ?? 0}</strong>
              </div>
              <div className="ops-live__count-row">
                <span>Resolved today</span>
                <strong>{dashboard?.issues.resolvedToday ?? 0}</strong>
              </div>
            </div>
            {dashboard?.issues.items.length ? (
              <ul className="ops-live__list">
                {dashboard.issues.items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="ops-live__issue" onClick={() => onNavigate(item.hrefTab)}>
                      <span>
                        <span className="ops-live__strong">{item.title}</span>
                        <span className="ops-live__muted"> {item.detail}</span>
                      </span>
                      <span className="ops-live__status">{item.severity}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ops-live__muted">No open issues in staff ops.</p>
            )}
          </section>

          <section className="ops-live__card">
            <h3 className="ops-live__section-title">Quick Actions</h3>
            <div className="ops-live__tools">
              <button type="button" className="ops-live__tool" onClick={() => window.open("/gingr", "_blank", "noopener,noreferrer")}>
                <BookOpen size={18} aria-hidden />
                Book Service
              </button>
              <button type="button" className="ops-live__tool" onClick={() => window.open("/gingr", "_blank", "noopener,noreferrer")}>
                <UserPlus size={18} aria-hidden />
                Add Dog
              </button>
              <button type="button" className="ops-live__tool" onClick={() => onNavigate("route_generator")}>
                <Car size={18} aria-hidden />
                Schedule Taxi
              </button>
              <button type="button" className="ops-live__tool" onClick={() => onNavigate("trainer_ops")}>
                <GraduationCap size={18} aria-hidden />
                Add Class
              </button>
              <button type="button" className="ops-live__tool" onClick={() => onNavigate("crossover_communication")}>
                <NotebookPen size={18} aria-hidden />
                New Note
              </button>
              <button type="button" className="ops-live__tool" onClick={() => onNavigate("management_support")}>
                <Headset size={18} aria-hidden />
                Get Support
              </button>
            </div>
          </section>
        </div>

        <div>
          <section className="ops-live__card ops-live__map">
            <div className="ops-live__section-head">
              <h3 className="ops-live__section-title">Fitdog facility</h3>
              <span className="ops-live__muted">{floor?.onSite.length ?? 0} on site</span>
            </div>
            <div className="ops-live__map-stage">
              <Image
                src={FACILITY_AERIAL}
                alt="Actual Fitdog facility aerial photograph"
                width={720}
                height={520}
                style={{ transform: `scale(${zoom})` }}
                priority
              />
            </div>
            <div className="ops-live__map-controls">
              <button type="button" onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))} aria-label="Zoom in">
                <Plus size={16} />
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.2))} aria-label="Zoom out">
                −
              </button>
            </div>
            <div className="ops-live__legend">
              <span>
                <i style={{ background: "#1596ff" }} /> Inside / on site · {floor?.onSite.length ?? 0}
              </span>
              <span>
                <i style={{ background: "#16d982" }} /> Daycare · {floor?.onSiteByCategory.daycare ?? 0}
              </span>
              <span>
                <i style={{ background: "#ff9b22" }} /> Awaiting pickup · {(floor?.pickupsRemaining.length ?? 0) + (floor?.overduePickups.length ?? 0)}
              </span>
            </div>
            <p className="ops-live__note">
              This is the real Fitdog aerial. Live GPS collars are not connected, so individual dogs are not plotted on the photo. Counts come from Gingr check-in state.
            </p>
          </section>

          <section className="ops-live__card" style={{ marginTop: 16 }}>
            <div className="ops-live__section-head">
              <h3 className="ops-live__section-title">Team Overview</h3>
              <button type="button" className="ops-live__link" onClick={() => onNavigate("staff_directory")}>
                Directory
              </button>
            </div>
            {dashboard?.team.length ? (
              <div className="ops-live__team">
                {dashboard.team.map((member) => (
                  <button key={member.id} type="button" className="ops-live__person" onClick={() => onNavigate("staff_directory")}>
                    <span className="ops-live__avatar">{initials(member.name)}</span>
                    <span className="ops-live__person-name">{member.name.split(" ")[0]}</span>
                    <span className="ops-live__person-meta">{member.department}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="ops-live__muted">No active directory members available.</p>
            )}
            <p className="ops-live__note">Active Staff Directory — not live clock-in or GPS.</p>
          </section>
        </div>
      </div>

      <div className="ops-live__columns">
        <section className="ops-live__card">
          <h3 className="ops-live__section-title">Recent Activity</h3>
          {view?.ownerActivity.length ? (
            <ul className="ops-live__list">
              {view.ownerActivity.map((item) => (
                <li key={item.id} className="ops-live__count-row">
                  <span>
                    <span className="ops-live__strong">{item.summary}</span>
                    <span className="ops-live__muted"> · {item.ownerName}</span>
                  </span>
                  <span className="ops-live__muted">{clock(item.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ops-live__muted">No owner or staff activity in the last 24 hours.</p>
          )}
        </section>

        <section className="ops-live__card">
          <div className="ops-live__section-head">
            <h3 className="ops-live__section-title">On site now ({floor?.onSite.length ?? 0})</h3>
            <label className="ops-live__search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a dog, owner, or breed"
                aria-label="Find a dog on site"
              />
            </label>
          </div>
          {grouped.length ? (
            grouped.map((group) => (
              <div key={group.key}>
                <p className="ops-live__muted" style={{ margin: "10px 0 8px" }}>
                  {CATEGORY_LABELS[group.key]} ({group.dogs.length})
                </p>
                <ul className="ops-live__dogs">
                  {group.dogs.map((dog) => (
                    <li key={dog.reservationId} className="ops-live__dog">
                      <p className="ops-live__strong">{dog.dogName}</p>
                      <p className="ops-live__muted">{[dog.breed, dog.ownerName].filter(Boolean).join(" · ")}</p>
                      <DogFlags dog={dog} />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="ops-live__muted">{query ? "No dog on site matches that search." : "No dogs are checked in right now."}</p>
          )}
        </section>
      </div>

      <div className="ops-live__columns">
        <section className="ops-live__card">
          <h3 className="ops-live__section-title">Pickups left ({(floor?.pickupsRemaining.length ?? 0) + (floor?.overduePickups.length ?? 0)})</h3>
          {(floor?.overduePickups.length || floor?.pickupsRemaining.length) ? (
            <ul className="ops-live__list">
              {[...(floor?.overduePickups ?? []), ...(floor?.pickupsRemaining ?? [])].map((dog) => (
                <li key={dog.reservationId} className="ops-live__count-row">
                  <span>
                    <span className="ops-live__strong">{dog.dogName}</span>
                    <span className="ops-live__muted"> · {dog.ownerName}</span>
                  </span>
                  <span className="ops-live__muted">{clock(dog.endsAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ops-live__muted">No remaining pickups on the Gingr floor.</p>
          )}
        </section>
        <section className="ops-live__card">
          <h3 className="ops-live__section-title">Allergy &amp; medical watch ({floor?.medicalWatch.length ?? 0})</h3>
          {floor?.medicalWatch.length ? (
            <ul className="ops-live__list">
              {floor.medicalWatch.map((dog) => (
                <li key={dog.reservationId}>
                  <p className="ops-live__strong">{dog.dogName}</p>
                  {dog.allergies ? <p className="ops-live__muted">Allergy: {dog.allergies}</p> : null}
                  {dog.medicines ? <p className="ops-live__muted">Meds: {dog.medicines}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ops-live__muted">No on-site allergy or medicine notes in Gingr.</p>
          )}
        </section>
      </div>

      {showSmsCost ? <SmsCostDashboardCard /> : null}
    </section>
  );
}
