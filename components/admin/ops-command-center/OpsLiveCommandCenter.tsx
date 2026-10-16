"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { SmsCostDashboardCard } from "@/components/admin/ops-command-center/SmsCostDashboardCard";
import { startVisibilityAwareInterval } from "@/lib/visibility-poll";
import { readResponseJson } from "@/lib/http/read-response-json";
import { humanizeUnknownError } from "@/lib/safe-url";
import type { CommandAction, CommandCenterView } from "@/lib/ops-command-center/action-queue";
import type { FloorCategory, FloorDog } from "@/lib/ops-command-center/live-floor";
import "./ops-live-command-center.css";

const POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 25_000;

const CATEGORY_LABELS: Record<FloorCategory, string> = {
  boarding: "Boarding",
  daycare: "Daycare",
  training: "Training",
  grooming: "Grooming",
  outing: "Hikes & outings",
  other: "Other"
};
const CATEGORY_ORDER: FloorCategory[] = ["boarding", "daycare", "training", "grooming", "outing", "other"];

const PRIORITY_LABELS: Record<CommandAction["priority"], string> = {
  critical: "Now",
  high: "Soon",
  attention: "Today"
};

function clock(value: string | null) {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
}

function dayAndClock(value: string | null) {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function minutesUntil(value: string | null, now: number) {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.round((at - now) / 60_000);
}

function relative(minutes: number | null) {
  if (minutes == null) return "";
  if (minutes <= 0) return "due now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

function matches(dog: FloorDog, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [dog.dogName, dog.ownerName, dog.breed, dog.serviceType].some((field) => field?.toLowerCase().includes(q));
}

function DogFlags({ dog }: { dog: FloorDog }) {
  return (
    <span className="ops-live__flags">
      {dog.allergies ? <span className="ops-live__flag ops-live__flag--danger">Allergy</span> : null}
      {dog.medicines ? <span className="ops-live__flag ops-live__flag--warning">Meds / care</span> : null}
      {dog.hasNotes ? <span className="ops-live__flag">Notes in Gingr</span> : null}
    </span>
  );
}

export function OpsLiveCommandCenter({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [view, setView] = useState<CommandCenterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
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
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => void load(), 0);
    const stop = startVisibilityAwareInterval(() => void load(), POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(boot);
      stop();
      window.clearInterval(tick);
    };
  }, [load]);

  const floor = view?.floor;
  const grouped = useMemo(() => {
    const groups = new Map<FloorCategory, FloorDog[]>();
    for (const dog of floor?.onSite ?? []) {
      if (!matches(dog, query.trim())) continue;
      groups.set(dog.category, [...(groups.get(dog.category) ?? []), dog]);
    }
    return CATEGORY_ORDER.filter((key) => groups.has(key)).map((key) => ({ key, dogs: groups.get(key)! }));
  }, [floor?.onSite, query]);

  const pickups = useMemo(
    () => [...(floor?.overduePickups ?? []), ...(floor?.pickupsRemaining ?? [])],
    [floor?.overduePickups, floor?.pickupsRemaining]
  );
  const arrivals = useMemo(
    () => [...(floor?.lateArrivals ?? []), ...(floor?.arrivalsExpected ?? [])],
    [floor?.lateArrivals, floor?.arrivalsExpected]
  );
  const failedSources = (view?.sources ?? []).filter((source) => !source.ok);
  const actions = view?.actions ?? [];

  if (loading && !view) {
    return (
      <section className="ops-live" aria-busy="true">
        <p className="ops-live__muted">Gingr ● Checking — loading who is on site, pickups, and arrivals…</p>
      </section>
    );
  }

  return (
    <section className="ops-live">
      <header className="ops-live__header">
        <div>
          <h2 className="ops-live__title">Ops Command Center</h2>
          <p className="ops-live__muted">
            Live from Gingr ·{" "}
            {floor?.syncedAt ? `synced ${clock(floor.syncedAt)}` : "not synced yet"}
            {floor?.stale ? " · showing last good data" : ""} · refreshes every minute
          </p>
        </div>
        <button type="button" className="ops-live__button" onClick={() => void load(true)} disabled={syncing}>
          <RefreshCw size={16} className={syncing ? "ops-live__spin" : undefined} aria-hidden />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
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
        <Kpi label="On site now" value={floor?.onSite.length ?? 0} detail={kpiBreakdown(floor?.onSiteByCategory)} />
        <Kpi
          label="Pickups left today"
          value={pickups.length}
          detail={floor?.overduePickups.length ? `${floor.overduePickups.length} overdue` : `${floor?.leftToday ?? 0} already left`}
          tone={floor?.overduePickups.length ? "danger" : undefined}
        />
        <Kpi
          label="Still arriving"
          value={arrivals.length}
          detail={floor?.lateArrivals.length ? `${floor.lateArrivals.length} late` : `${floor?.arrivedToday ?? 0} arrived today`}
          tone={floor?.lateArrivals.length ? "warning" : undefined}
        />
        <Kpi
          label="Allergy / meds on site"
          value={floor?.medicalWatch.length ?? 0}
          detail="Check before feeding or treats"
          tone={floor?.medicalWatch.length ? "warning" : undefined}
        />
        <Kpi
          label="Arriving tomorrow"
          value={floor?.tomorrow.arrivals ?? 0}
          detail={`${floor?.tomorrow.byCategory.boarding ?? 0} boarding · ${floor?.tomorrow.unconfirmed ?? 0} unconfirmed`}
        />
        <Kpi
          label="Needs action"
          value={actions.length}
          detail={actions.some((a) => a.priority === "critical") ? "Includes urgent items" : "Nothing urgent"}
          tone={actions.some((a) => a.priority === "critical") ? "danger" : undefined}
        />
      </div>

      <section className="ops-live__card">
        <h3 className="ops-live__section-title">Needs action</h3>
        {actions.length ? (
          <ul className="ops-live__list">
            {actions.map((action) => (
              <li key={action.id} className={`ops-live__action ops-live__action--${action.priority}`}>
                <span className={`ops-live__pill ops-live__pill--${action.priority}`}>{PRIORITY_LABELS[action.priority]}</span>
                <div className="ops-live__grow">
                  <p className="ops-live__strong">{action.title}</p>
                  {action.detail ? <p className="ops-live__muted">{action.detail}</p> : null}
                </div>
                {action.hrefTab ? (
                  <button type="button" className="ops-live__link" onClick={() => onNavigate(action.hrefTab!)}>
                    {action.hrefLabel || "Open"}
                  </button>
                ) : action.hrefLabel ? (
                  <span className="ops-live__muted">{action.hrefLabel}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ops-live__muted">
            All clear. No overdue pickups, late arrivals, body-check follow-ups, urgent Team Log items, or payment problems.
          </p>
        )}
      </section>

      <div className="ops-live__columns">
        <section className="ops-live__card">
          <h3 className="ops-live__section-title">Pickups today ({pickups.length})</h3>
          {pickups.length ? (
            <ul className="ops-live__list">
              {pickups.map((dog) => {
                const late = floor?.overduePickups.includes(dog);
                return (
                  <li key={dog.reservationId} className="ops-live__row">
                    <span className={`ops-live__time${late ? " ops-live__time--late" : ""}`}>{clock(dog.endsAt)}</span>
                    <div className="ops-live__grow">
                      <p className="ops-live__strong">
                        {dog.dogName} <DogFlags dog={dog} />
                      </p>
                      <p className="ops-live__muted">
                        {[dog.ownerName, dog.serviceType].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className={late ? "ops-live__late" : "ops-live__muted"}>
                      {dog.overstay ? "Past checkout date" : late ? `${dog.minutesLate} min late` : relative(minutesUntil(dog.endsAt, now))}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ops-live__muted">No more pickups scheduled today.</p>
          )}
        </section>

        <section className="ops-live__card">
          <h3 className="ops-live__section-title">Arrivals still expected ({arrivals.length})</h3>
          {arrivals.length ? (
            <ul className="ops-live__list">
              {arrivals.map((dog) => {
                const late = floor?.lateArrivals.includes(dog);
                return (
                  <li key={dog.reservationId} className="ops-live__row">
                    <span className={`ops-live__time${late ? " ops-live__time--late" : ""}`}>{clock(dog.startsAt)}</span>
                    <div className="ops-live__grow">
                      <p className="ops-live__strong">
                        {dog.dogName} <DogFlags dog={dog} />
                      </p>
                      <p className="ops-live__muted">{[dog.ownerName, dog.serviceType].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={late ? "ops-live__late" : "ops-live__muted"}>
                      {late ? `${dog.minutesLate} min late` : relative(minutesUntil(dog.startsAt, now))}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ops-live__muted">Everyone booked for today has arrived.</p>
          )}
        </section>
      </div>

      <section className="ops-live__card">
        <h3 className="ops-live__section-title">Allergy &amp; medical watch ({floor?.medicalWatch.length ?? 0})</h3>
        {floor?.medicalWatch.length ? (
          <ul className="ops-live__watch">
            {floor.medicalWatch.map((dog) => (
              <li key={dog.reservationId} className="ops-live__watch-item">
                <p className="ops-live__strong">
                  {dog.dogName} <span className="ops-live__muted">· {CATEGORY_LABELS[dog.category]}</span>
                </p>
                {dog.allergies ? (
                  <p>
                    <span className="ops-live__flag ops-live__flag--danger">Allergy</span> {dog.allergies}
                  </p>
                ) : null}
                {dog.medicines ? (
                  <p>
                    <span className="ops-live__flag ops-live__flag--warning">Meds / care</span> {dog.medicines}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ops-live__muted">No dogs on site have allergies or medicines listed in Gingr.</p>
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
            <div key={group.key} className="ops-live__group">
              <h4 className="ops-live__group-title">
                {CATEGORY_LABELS[group.key]} ({group.dogs.length})
              </h4>
              <ul className="ops-live__grid">
                {group.dogs.map((dog) => (
                  <li key={dog.reservationId} className="ops-live__dog">
                    <p className="ops-live__strong">{dog.dogName}</p>
                    <p className="ops-live__muted">{[dog.breed, dog.ownerName].filter(Boolean).join(" · ")}</p>
                    <p className="ops-live__muted">
                      {dog.serviceType} · in {clock(dog.checkedInAt)} · out {dayAndClock(dog.endsAt)}
                    </p>
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

      <div className="ops-live__columns">
        <section className="ops-live__card">
          <h3 className="ops-live__section-title">Tomorrow ({floor?.tomorrow.arrivals ?? 0} arriving)</h3>
          <ul className="ops-live__chips">
            {CATEGORY_ORDER.filter((key) => floor?.tomorrow.byCategory[key]).map((key) => (
              <li key={key} className="ops-live__chip">
                {CATEGORY_LABELS[key]}: {floor?.tomorrow.byCategory[key]}
              </li>
            ))}
          </ul>
          {floor?.tomorrow.boardingArrivals.length ? (
            <>
              <h4 className="ops-live__group-title">Boarding check-ins</h4>
              <ul className="ops-live__list">
                {floor.tomorrow.boardingArrivals.map((dog) => (
                  <li key={dog.reservationId} className="ops-live__row">
                    <span className="ops-live__time">{clock(dog.startsAt)}</span>
                    <div className="ops-live__grow">
                      <p className="ops-live__strong">
                        {dog.dogName} <DogFlags dog={dog} />
                      </p>
                      <p className="ops-live__muted">
                        {[dog.ownerName, dog.serviceType, `until ${dayAndClock(dog.endsAt)}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="ops-live__muted">No boarding check-ins tomorrow.</p>
          )}
        </section>

        <section className="ops-live__card">
          <h3 className="ops-live__section-title">Owner activity, last 24 hours ({view?.ownerActivity.length ?? 0})</h3>
          {view?.ownerActivity.length ? (
            <ul className="ops-live__list">
              {view.ownerActivity.map((item) => (
                <li key={item.id} className="ops-live__row">
                  <span className="ops-live__time">{clock(item.at)}</span>
                  <div className="ops-live__grow">
                    <p className="ops-live__strong">{item.ownerName}</p>
                    <p className="ops-live__muted">{item.summary}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ops-live__muted">No owner uploads or cancellations in the last 24 hours.</p>
          )}
        </section>
      </div>

      <SmsCostDashboardCard />
    </section>
  );
}

function kpiBreakdown(counts: Record<FloorCategory, number> | undefined) {
  if (!counts) return "";
  return CATEGORY_ORDER.filter((key) => counts[key])
    .map((key) => `${counts[key]} ${CATEGORY_LABELS[key].toLowerCase()}`)
    .join(" · ");
}

function Kpi({ label, value, detail, tone }: { label: string; value: number; detail?: string; tone?: "danger" | "warning" }) {
  return (
    <div className={`ops-live__kpi${tone ? ` ops-live__kpi--${tone}` : ""}`}>
      <p className="ops-live__kpi-label">{label}</p>
      <p className="ops-live__kpi-value">{value}</p>
      {detail ? <p className="ops-live__muted">{detail}</p> : null}
    </div>
  );
}
