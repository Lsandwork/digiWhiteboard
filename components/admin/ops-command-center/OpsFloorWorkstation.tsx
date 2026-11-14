"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { RefreshCw, Search } from "lucide-react";
import {
  DriverModePanel,
  FrontDeskCommandPanel,
  OvernightCommandPanel,
  YardCommandPanel
} from "@/components/admin/ops-command-center/RoleWorkspaces";
import { OpsSidePanel } from "@/components/admin/ops-command-center/SidePanel";
import { startVisibilityAwareInterval } from "@/lib/visibility-poll";
import { readResponseJson } from "@/lib/http/read-response-json";
import { humanizeUnknownError } from "@/lib/safe-url";
import type { CommandCenterView } from "@/lib/ops-command-center/action-queue";
import type { OpsCommandCenterSnapshot } from "@/lib/ops-command-center/snapshot";
import type { OpsWorkItem } from "@/lib/ops-command-center/adapters/staff-ops-feed";
import {
  availableActionsForKind,
  workItemActionLabel,
  type WorkItemAction
} from "@/lib/ops-command-center/work-item-actions";
import { buildFloorRows, floorRowMatches, type FloorRow, type FloorRowStatus } from "@/lib/ops-command-center/floor-rows";
import type { TeamMemberCard } from "@/lib/ops-command-center/command-dashboard";
import "./ops-floor-workstation.css";

const POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 25_000;
const RUFFOPS_MARK = "/assets/ruffops/brand/ruffops-mark.svg";

type StationView = "floor" | "issues" | "desk" | "yard" | "driver" | "overnight";
type FloorFilter = "needs" | "late" | "onsite" | "arriving" | "pickup" | "care" | "all";
type IssuesPane = "work" | "alerts";

type DogSearchHit = {
  id: string;
  name: string;
  ownerName: string | null;
  gingrAnimalId?: string | null;
};

const FILTERS: Array<{ id: FloorFilter; label: string }> = [
  { id: "needs", label: "Needs a person" },
  { id: "late", label: "Late" },
  { id: "onsite", label: "On site" },
  { id: "arriving", label: "Arriving" },
  { id: "pickup", label: "Pickups" },
  { id: "care", label: "Care" },
  { id: "all", label: "Entire floor" }
];

function pacificClock() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

function pillClass(status: FloorRowStatus) {
  if (status === "overdue" || status === "late") return "ops-floor__pill--late";
  if (status === "pending" || status === "upcoming") return "ops-floor__pill--warn";
  if (status === "in_progress") return "ops-floor__pill--info";
  return "ops-floor__pill--ok";
}

function gingrHref(animalId: string) {
  const id = animalId.trim();
  if (!id) return "/gingr";
  return `/gingr?animalId=${encodeURIComponent(id)}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function priorityRank(priority: string) {
  const p = priority.toLowerCase();
  if (p === "critical") return 0;
  if (p === "high" || p === "urgent") return 1;
  if (p === "attention") return 2;
  return 3;
}

function mergeWorkItems(snapshot: OpsCommandCenterSnapshot | null): OpsWorkItem[] {
  if (!snapshot) return [];
  const open = snapshot.openWork?.length ? snapshot.openWork : [];
  const extra = snapshot.needsAttention
    .filter((item) => !open.some((row) => row.id === item.id))
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      priority: item.severity,
      statusLabel: "open",
      dueAt: null,
      hrefTab: item.hrefTab,
      dogName: item.dogName ?? null,
      completable: true
    }));
  return [...open, ...extra].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

export function OpsFloorWorkstation({
  onNavigate,
  displayName,
  roleLabel
}: {
  onNavigate: (tab: string) => void;
  displayName?: string | null;
  roleLabel?: string | null;
}) {
  const [view, setView] = useState<StationView>("floor");
  const [filter, setFilter] = useState<FloorFilter>("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<CommandCenterView | null>(null);
  const [snapshot, setSnapshot] = useState<OpsCommandCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [issuesPane, setIssuesPane] = useState<IssuesPane>("work");
  const [dogHits, setDogHits] = useState<DogSearchHit[]>([]);
  const [clock, setClock] = useState(pacificClock());
  const inFlight = useRef(false);

  const load = useCallback(async (force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (force) setSyncing(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const liveUrl = `/api/admin/ops-command-center?view=live_floor${force ? "&refresh=1" : ""}`;
      const [liveRes, snapRes] = await Promise.all([
        fetch(liveUrl, { cache: "no-store", signal: controller.signal }),
        fetch("/api/admin/ops-command-center", { cache: "no-store", signal: controller.signal })
      ]);
      const liveBody = await readResponseJson<CommandCenterView & { error?: string }>(liveRes);
      const snapBody = await readResponseJson<OpsCommandCenterSnapshot & { error?: string }>(snapRes);
      if (!liveRes.ok) throw new Error(liveBody?.error || `Live floor returned ${liveRes.status}.`);
      setLive(liveBody);
      if (snapBody?.greetingName || snapBody?.shiftSummary) setSnapshot(snapBody);
      setError(null);
    } catch (caught) {
      setError(
        controller.signal.aborted
          ? "Live data is taking longer than usual. Showing the last good copy."
          : humanizeUnknownError(caught, "Unable to refresh the floor.")
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
    const tick = window.setInterval(() => setClock(pacificClock()), 30_000);
    return () => {
      window.clearTimeout(boot);
      stop();
      window.clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setDogHits([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/ops-command-center?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const body = await readResponseJson<{ dogs?: DogSearchHit[]; boardDogs?: DogSearchHit[] }>(res);
        if (!res.ok) return;
        const ops = (body.dogs || []).map((d) => ({
          id: d.id,
          name: d.name,
          ownerName: d.ownerName ?? null,
          gingrAnimalId: "gingrAnimalId" in d ? (d as DogSearchHit).gingrAnimalId : null
        }));
        const board = (body.boardDogs || []).map((d) => ({
          id: `board:${d.id}`,
          name: d.name,
          ownerName: d.ownerName ?? null,
          gingrAnimalId: "gingrAnimalId" in d ? (d as DogSearchHit).gingrAnimalId : null
        }));
        setDogHits([...ops, ...board]);
      } catch {
        setDogHits([]);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const allRows = useMemo(() => (live?.floor ? buildFloorRows(live.floor) : []), [live?.floor]);

  const visibleRows = useMemo(() => {
    let rows = allRows.filter((row) => floorRowMatches(row, query));
    if (filter === "needs") {
      rows = rows.filter((row) => ["overdue", "late", "pending"].includes(row.status));
    } else if (filter === "late") {
      rows = rows.filter((row) => row.status === "late" || row.status === "overdue");
    } else if (filter === "onsite") {
      rows = rows.filter((row) => row.status === "on_site" || row.status === "in_progress");
    } else if (filter === "arriving") {
      rows = rows.filter((row) => row.status === "late" || row.status === "upcoming");
    } else if (filter === "pickup") {
      rows = rows.filter((row) => row.status === "overdue" || row.status === "pending");
    } else if (filter === "care") {
      rows = rows.filter((row) => row.flags.length > 0);
    }
    return rows;
  }, [allRows, filter, query]);

  const counts = useMemo(() => {
    const floor = live?.floor;
    return {
      lateOnly: floor?.lateArrivals.length ?? 0,
      overdue: floor?.overduePickups.length ?? 0,
      care: floor?.medicalWatch.length ?? allRows.filter((r) => r.flags.length).length,
      onSite: floor?.onSite.length ?? 0,
      issues: mergeWorkItems(snapshot).length + (snapshot?.alertFeed?.length ?? 0),
      deskIn: snapshot?.boardCounts.checkingIn ?? 0,
      deskOut: snapshot?.boardCounts.checkingOut ?? 0
    };
  }, [allRows, live?.floor, snapshot]);

  const selectedRow = visibleRows.find((r) => r.id === selectedRowId) ?? allRows.find((r) => r.id === selectedRowId) ?? null;

  const team: TeamMemberCard[] = live?.dashboard?.team ?? [];

  const nextRows = useMemo(() => {
    return allRows
      .filter((row) => ["overdue", "late", "pending", "upcoming"].includes(row.status))
      .slice(0, 8);
  }, [allRows]);

  const careWatch = live?.floor?.medicalWatch ?? [];

  const health = live?.dashboard?.health ?? "operational";
  const gingrSource = live?.sources?.find((s) => s.key === "gingr");

  async function runWorkItemAction(itemId: string, workAction: WorkItemAction, itemTitle?: string | null) {
    setBusyItemId(itemId);
    try {
      const res = await fetch("/api/admin/ops-command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "work_item_action", itemId, workAction, title: itemTitle || null })
      });
      const body = await readResponseJson<{ error?: string }>(res).catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body.error || "Unable to update row");
      await load(true);
    } finally {
      setBusyItemId(null);
    }
  }

  function rowPrimaryClick(row: FloorRow, event: React.MouseEvent) {
    event.stopPropagation();
    if (row.primaryAction === "gingr") {
      window.open(gingrHref(row.animalId), "_blank", "noopener,noreferrer");
      return;
    }
    if (row.primaryAction === "follow_up") {
      onNavigate("owner_follow_up");
      return;
    }
  }

  function openTeamLog(_row: FloorRow) {
    onNavigate("crossover_communication");
  }

  const workItems = useMemo(() => mergeWorkItems(snapshot), [snapshot]);
  const alertItems = useMemo(() => snapshot?.alertFeed ?? [], [snapshot]);
  const recentEvents = snapshot?.recentEvents?.slice(0, 8) ?? [];
  const roleTools = snapshot?.tools ?? [];

  const showRail = view === "floor" || view === "issues";

  return (
    <section className="ops-floor" aria-label="Ops floor workstation">
      <header className="ops-floor__chrome">
        <div className="ops-floor__brand">
          <Image src={RUFFOPS_MARK} alt="" width={28} height={28} className="ops-floor__brand-mark" />
          <div>
            <p className="ops-floor__brand-title">RUFFOPS</p>
            <p className="ops-floor__brand-sub">Fitdog floor</p>
          </div>
        </div>
        <div className="ops-floor__search-wrap">
          <label className="ops-floor__search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Dog, owner, or Gingr ID"
              aria-label="Search the floor"
            />
          </label>
          {dogHits.length ? (
            <div className="ops-floor__search-hits" role="listbox">
              {dogHits.slice(0, 8).map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="ops-floor__search-hit"
                  onClick={() => {
                    const match = allRows.find(
                      (row) =>
                        row.dogName.toLowerCase() === hit.name.toLowerCase() ||
                        row.animalId === hit.gingrAnimalId ||
                        row.animalId === hit.id
                    );
                    if (match) setSelectedRowId(match.id);
                    if (hit.id.startsWith("board:")) setView("desk");
                    setQuery(hit.name);
                    setDogHits([]);
                  }}
                >
                  <p className="ops-floor__dog">{hit.name}</p>
                  <p className="ops-floor__sub">
                    {hit.ownerName || "Owner unknown"}
                    {hit.gingrAnimalId ? ` · Gingr #${hit.gingrAnimalId}` : ""}
                  </p>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="ops-floor__meta">
          <span className="ops-floor__clock">{clock} PT</span>
          <span
            className={`ops-floor__live${health !== "operational" ? " ops-floor__live--warn" : ""}`}
            title={gingrSource?.detail || live?.dashboard?.healthLabel}
          >
            <i aria-hidden />
            {health === "operational" ? "Feeds live" : live?.dashboard?.healthLabel ?? "Partial feeds"}
          </span>
          {displayName ? (
            <span>
              {displayName}
              {roleLabel ? ` · ${roleLabel}` : ""}
            </span>
          ) : null}
          <button type="button" className="ops-floor__sync" onClick={() => void load(true)} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} aria-hidden /> Sync
          </button>
        </div>
      </header>

      <div className="ops-floor__body">
        <nav className="ops-floor__nav" aria-label="Floor stations">
          <div>
            <p className="ops-floor__nav-label">Floor</p>
            <button
              type="button"
              className={`ops-floor__nav-btn${view === "floor" ? " is-active" : ""}`}
              onClick={() => setView("floor")}
            >
              <span>Floor</span>
            </button>
            <button
              type="button"
              className={`ops-floor__nav-btn${view === "issues" ? " is-active" : ""}`}
              onClick={() => setView("issues")}
            >
              <span>Issues</span>
              {counts.issues ? <span className="ops-floor__badge">{counts.issues}</span> : null}
            </button>
          </div>
          <div>
            <p className="ops-floor__nav-label">Stations</p>
            <button
              type="button"
              className={`ops-floor__nav-btn${view === "desk" ? " is-active" : ""}`}
              onClick={() => setView("desk")}
            >
              <span>Front desk</span>
              {counts.deskIn + counts.deskOut ? (
                <span className="ops-floor__badge ops-floor__badge--quiet">{counts.deskIn + counts.deskOut}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={`ops-floor__nav-btn${view === "yard" ? " is-active" : ""}`}
              onClick={() => setView("yard")}
            >
              <span>Yard</span>
            </button>
            <button
              type="button"
              className={`ops-floor__nav-btn${view === "driver" ? " is-active" : ""}`}
              onClick={() => setView("driver")}
            >
              <span>Driver</span>
            </button>
            <button
              type="button"
              className={`ops-floor__nav-btn${view === "overnight" ? " is-active" : ""}`}
              onClick={() => setView("overnight")}
            >
              <span>Overnight</span>
            </button>
          </div>
          <p className="ops-floor__hint">
            Reservations and checkout live in Gingr. Team Log, issues, and driver timestamps stay in RuffOps.
          </p>
        </nav>

        <div className={`ops-floor__stage${showRail ? "" : " ops-floor__stage--solo"}`}>
          <main className="ops-floor__main">
            {error ? (
              <div className="ops-floor__health ops-floor__health--warn" role="alert">
                <p>{error}</p>
              </div>
            ) : null}
            {snapshot?.stale && !snapshot.pending ? (
              <div className="ops-floor__health ops-floor__health--warn" role="status">
                Live data is delayed. You are seeing the last good copy from RuffOps.
              </div>
            ) : null}
            {snapshot?.gingrHealth?.status === "offline" ? (
              <div className="ops-floor__health ops-floor__health--warn" role="status">
                {snapshot.gingrHealth.detail || "Gingr may be stale. Open Gingr to confirm reservations."}
              </div>
            ) : null}
            {snapshot?.staffOpsHealth?.status === "error" ? (
              <div className="ops-floor__health ops-floor__health--danger" role="status">
                {snapshot.staffOpsHealth.detail ||
                  "Staff ops feed failed. An empty Issues list does not mean All Clear."}
              </div>
            ) : null}

            {view === "floor" ? (
              <>
                <div className="ops-floor__head">
                  <h2>Floor</h2>
                  <p>
                    One queue for the building. Check in, checkout, and packages are changed in Gingr. Log moves and
                    owner updates here in RuffOps.
                  </p>
                </div>
                <div className="ops-floor__filters" role="toolbar" aria-label="Floor filters">
                  {FILTERS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`ops-floor__chip${filter === chip.id ? " is-active" : ""}`}
                      onClick={() => setFilter(chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <div className="ops-floor__stats" aria-label="Floor counts">
                  <button type="button" className="ops-floor__stat ops-floor__stat--red" onClick={() => setFilter("late")}>
                    <strong>{counts.lateOnly}</strong>
                    <span>Late arrivals</span>
                  </button>
                  <button type="button" className="ops-floor__stat ops-floor__stat--red" onClick={() => setFilter("pickup")}>
                    <strong>{counts.overdue}</strong>
                    <span>Overdue pickups</span>
                  </button>
                  <button type="button" className="ops-floor__stat ops-floor__stat--amber" onClick={() => setFilter("care")}>
                    <strong>{counts.care}</strong>
                    <span>Allergy or meds</span>
                  </button>
                  <button type="button" className="ops-floor__stat ops-floor__stat--blue" onClick={() => setFilter("onsite")}>
                    <strong>{counts.onSite}</strong>
                    <span>On site now</span>
                  </button>
                </div>
                <div className="ops-floor__quick-links" aria-label="Shortcuts">
                  <button type="button" onClick={() => onNavigate("my_shift")}>
                    My Shift
                  </button>
                  <button type="button" onClick={() => onNavigate("active_issues")}>
                    Active issues
                  </button>
                  <button type="button" onClick={() => onNavigate("owner_follow_up")}>
                    Owner follow-ups
                  </button>
                  <button type="button" onClick={() => onNavigate("crossover_communication")}>
                    Team log
                  </button>
                  {roleTools.map((tool) => (
                    <button key={tool.tab} type="button" onClick={() => onNavigate(tool.tab)}>
                      {tool.label}
                    </button>
                  ))}
                </div>
                <p className="ops-floor__gingr-note">
                  Open Gingr changes reservations. Team log, issues, and driver timestamps stay in RuffOps.
                </p>
                {loading && !allRows.length ? (
                  <p className="ops-floor__empty">Loading live floor from Gingr…</p>
                ) : visibleRows.length ? (
                  <div className="ops-floor__table-wrap">
                    <table className="ops-floor__table">
                      <thead>
                        <tr>
                          <th scope="col">When</th>
                          <th scope="col">Dog</th>
                          <th scope="col">Service</th>
                          <th scope="col">Where</th>
                          <th scope="col">Status</th>
                          <th scope="col">Next</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => {
                          const late = row.status === "late" || row.status === "overdue";
                          const flag = row.flags[0];
                          return (
                            <tr
                              key={row.id}
                              className={`ops-floor__row${selectedRowId === row.id ? " is-selected" : ""}`}
                              onClick={() => setSelectedRowId(row.id)}
                            >
                              <td className={`ops-floor__time${late ? " ops-floor__time--late" : row.status === "pending" ? " ops-floor__time--warn" : ""}`}>
                                {row.timeLabel}
                              </td>
                              <td>
                                <div className="ops-floor__dog">{row.dogName}</div>
                                <div className="ops-floor__sub">
                                  {[row.breed, row.ownerName].filter(Boolean).join(" · ")}
                                  {flag ? (
                                    <>
                                      {" · "}
                                      <span className="ops-floor__flag">{flag}</span>
                                    </>
                                  ) : null}
                                </div>
                              </td>
                              <td>{row.service}</td>
                              <td className="ops-floor__sub">{row.where}</td>
                              <td>
                                <span className={`ops-floor__pill ${pillClass(row.status)}`}>{row.statusLabel}</span>
                              </td>
                              <td className="ops-floor__sub">{row.next}</td>
                              <td>
                                <button
                                  type="button"
                                  className="ops-floor__act"
                                  onClick={(event) => {
                                    if (row.primaryAction === "team_log") {
                                      event.stopPropagation();
                                      openTeamLog(row);
                                      return;
                                    }
                                    rowPrimaryClick(row, event);
                                  }}
                                >
                                  {row.primaryLabel}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="ops-floor__empty">
                    {query.trim() ? "No dog matches that search." : "No dogs match this filter right now."}
                  </p>
                )}
              </>
            ) : null}

            {view === "issues" ? (
              <IssuesTable
                pane={issuesPane}
                onPaneChange={setIssuesPane}
                workCount={workItems.length}
                alertCount={alertItems.length}
                items={(issuesPane === "work" ? workItems : alertItems).filter(
                  (item) =>
                    !query.trim() ||
                    [item.title, item.dogName, item.detail].some((part) =>
                      String(part || "")
                        .toLowerCase()
                        .includes(query.trim().toLowerCase())
                    )
                )}
                busyItemId={busyItemId}
                onAction={runWorkItemAction}
                onNavigate={onNavigate}
              />
            ) : null}

            {view === "desk" ? (
              <div className="ops-floor__embedded">
                <FrontDeskCommandPanel onNavigate={onNavigate} theme="floor" />
              </div>
            ) : null}
            {view === "yard" ? (
              <div className="ops-floor__embedded">
                <YardCommandPanel onNavigate={onNavigate} theme="floor" />
              </div>
            ) : null}
            {view === "driver" ? (
              <div className="ops-floor__embedded">
                <DriverModePanel />
              </div>
            ) : null}
            {view === "overnight" ? (
              <div className="ops-floor__embedded">
                <OvernightCommandPanel />
              </div>
            ) : null}
          </main>

          {showRail ? (
            <aside className="ops-floor__rail" aria-label="Next on shift">
              <h3>Next</h3>
              {nextRows.length ? (
                nextRows.map((row) => (
                  <div key={row.id} className="ops-floor__slot">
                    <strong className={row.status === "late" || row.status === "overdue" ? "ops-floor__time--late" : ""}>
                      {row.timeLabel}
                    </strong>
                    <div>
                      <p className="ops-floor__dog">{row.dogName}</p>
                      <p className="ops-floor__sub">
                        {row.statusLabel} · {row.where}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ops-floor__sub">No overdue or upcoming items in this feed.</p>
              )}

              <h3>On this shift</h3>
              <p className="ops-floor__sub">Scheduled stations — not live GPS or clock-in.</p>
              {team.length ? (
                team.map((member) => (
                  <div key={member.id} className="ops-floor__person">
                    <span className="ops-floor__avatar">{initials(member.name)}</span>
                    <div>
                      <p className="ops-floor__dog">{member.name.split(" ")[0]}</p>
                      <p className="ops-floor__sub">
                        {member.department} · {member.role}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ops-floor__sub">No active directory members loaded.</p>
              )}

              <h3>Care watch</h3>
              {careWatch.length ? (
                careWatch.map((dog) => (
                  <button
                    key={dog.reservationId}
                    type="button"
                    className="ops-floor__slot"
                    style={{ width: "100%", border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}
                    onClick={() => {
                      setView("floor");
                      setSelectedRowId(dog.reservationId);
                    }}
                  >
                    <span />
                    <ul className="ops-floor__sub" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      <li className="ops-floor__dog">{dog.dogName}</li>
                      <li>
                        {[dog.allergies, dog.medicines].filter(Boolean).join(" · ") || "See Gingr profile"}
                      </li>
                    </ul>
                  </button>
                ))
              ) : (
                <p className="ops-floor__sub">No allergy or medicine flags on site.</p>
              )}

              <h3>Recent activity</h3>
              {live?.ownerActivity?.length ? (
                live.ownerActivity.slice(0, 6).map((item) => (
                  <div key={item.id} className="ops-floor__slot">
                    <span className="ops-floor__sub">
                      {new Date(item.at).toLocaleTimeString("en-US", {
                        timeZone: "America/Los_Angeles",
                        hour: "numeric",
                        minute: "2-digit"
                      })}
                    </span>
                    <div>
                      <p className="ops-floor__dog">{item.summary}</p>
                      <p className="ops-floor__sub">{item.ownerName}</p>
                    </div>
                  </div>
                ))
              ) : recentEvents.length ? (
                recentEvents.map((event) => (
                  <div key={event.id} className="ops-floor__slot">
                    <span className="ops-floor__sub">
                      {new Date(event.occurredAt).toLocaleTimeString("en-US", {
                        timeZone: "America/Los_Angeles",
                        hour: "numeric",
                        minute: "2-digit"
                      })}
                    </span>
                    <div>
                      <p className="ops-floor__dog">{event.title}</p>
                      <p className="ops-floor__sub">{event.sourceModule}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ops-floor__sub">Activity appears as Gingr and staff workflows sync.</p>
              )}
            </aside>
          ) : null}
        </div>
      </div>

      <OpsSidePanel
        open={Boolean(selectedRow)}
        title={selectedRow?.dogName ?? "Dog"}
        onClose={() => setSelectedRowId(null)}
        footer={
          selectedRow ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <a className="ops-floor__act" href={gingrHref(selectedRow.animalId)} target="_blank" rel="noopener noreferrer">
                Open Gingr
              </a>
              <button type="button" className="ops-floor__act ops-floor__act--ghost" onClick={() => openTeamLog(selectedRow)}>
                Team log
              </button>
              <button type="button" className="ops-floor__act ops-floor__act--ghost" onClick={() => onNavigate("owner_follow_up")}>
                Owner follow-up
              </button>
            </div>
          ) : null
        }
      >
        {selectedRow ? (
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px 12px", fontSize: 14 }}>
            <dt className="ops-floor__sub">Status</dt>
            <dd>
              <span className={`ops-floor__pill ${pillClass(selectedRow.status)}`}>{selectedRow.statusLabel}</span>
            </dd>
            <dt className="ops-floor__sub">Service</dt>
            <dd>{selectedRow.service}</dd>
            <dt className="ops-floor__sub">Where</dt>
            <dd>{selectedRow.where}</dd>
            <dt className="ops-floor__sub">Owner</dt>
            <dd>{selectedRow.ownerName || "Unknown"}</dd>
            <dt className="ops-floor__sub">Gingr</dt>
            <dd>
              <a href={gingrHref(selectedRow.animalId)} target="_blank" rel="noopener noreferrer" className="ops-floor__sub" style={{ color: "var(--ops-blue)" }}>
                Animal {selectedRow.animalId}
              </a>
            </dd>
            <dt className="ops-floor__sub">Care</dt>
            <dd>{selectedRow.flags.length ? selectedRow.flags.join(", ") : "None flagged"}</dd>
            <dt className="ops-floor__sub">Next</dt>
            <dd>{selectedRow.next}</dd>
          </dl>
        ) : null}
        <p className="ops-floor__sub" style={{ marginTop: 16 }}>
          Change reservations, check-in, and payments in Gingr. Use Team Log or Owner follow-up for internal RuffOps comms.
        </p>
      </OpsSidePanel>
    </section>
  );
}

function IssuesTable({
  items,
  pane,
  onPaneChange,
  workCount,
  alertCount,
  busyItemId,
  onAction,
  onNavigate
}: {
  items: OpsWorkItem[];
  pane: IssuesPane;
  onPaneChange: (pane: IssuesPane) => void;
  workCount: number;
  alertCount: number;
  busyItemId: string | null;
  onAction: (id: string, action: WorkItemAction, title?: string | null) => Promise<void>;
  onNavigate: (tab: string) => void;
}) {
  return (
    <>
      <div className="ops-floor__head">
        <h2>Issues & alerts</h2>
        <p>
          Same work-item actions as before — Clear, Hide, Archive, In progress, and Resolve stay available. Delete needs
          a second confirmation so it is not accidental.
        </p>
      </div>
      <div className="ops-floor__issues-tabs" role="tablist" aria-label="Issue feeds">
        <button
          type="button"
          className={`ops-floor__chip${pane === "work" ? " is-active" : ""}`}
          role="tab"
          aria-selected={pane === "work"}
          onClick={() => onPaneChange("work")}
        >
          Work queue ({workCount})
        </button>
        <button
          type="button"
          className={`ops-floor__chip${pane === "alerts" ? " is-active" : ""}`}
          role="tab"
          aria-selected={pane === "alerts"}
          onClick={() => onPaneChange("alerts")}
        >
          Alerts ({alertCount})
        </button>
      </div>
      {items.length ? (
        <div className="ops-floor__table-wrap">
          <table className="ops-floor__table">
            <thead>
              <tr>
                <th scope="col">Priority</th>
                <th scope="col">Work</th>
                <th scope="col">Dog</th>
                <th scope="col">Due</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const tone =
                  String(item.priority).toLowerCase() === "critical"
                    ? "ops-floor__pill--late"
                    : String(item.priority).toLowerCase() === "high"
                      ? "ops-floor__pill--warn"
                      : "ops-floor__pill--info";
                const primary =
                  item.kind === "payment_alert" || item.kind === "facility_service"
                    ? "Open Gingr"
                    : item.kind === "owner_follow_up"
                      ? "Follow up"
                      : "Resolve";
                return (
                  <IssueRow
                    key={item.id}
                    item={item}
                    tone={tone}
                    primary={primary}
                    busy={busyItemId === item.id}
                    onAction={onAction}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ops-floor__empty">No open issues or follow-ups in the staff ops feed.</p>
      )}
    </>
  );
}

function IssueRow({
  item,
  tone,
  primary,
  busy,
  onAction,
  onNavigate
}: {
  item: OpsWorkItem;
  tone: string;
  primary: string;
  busy: boolean;
  onAction: (id: string, action: WorkItemAction, title?: string | null) => Promise<void>;
  onNavigate: (tab: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const actions = availableActionsForKind(item.kind);
  const secondary = actions.filter((a) => a !== "delete" && a !== "resolved");

  return (
    <tr>
      <td>
        <span className={`ops-floor__pill ${tone}`}>{item.priority}</span>
      </td>
      <td>
        <p className="ops-floor__dog">{item.title}</p>
        {item.detail ? <p className="ops-floor__sub">{item.detail}</p> : null}
      </td>
      <td className="ops-floor__sub">{item.dogName || "—"}</td>
      <td className="ops-floor__sub">{item.dueAt ? new Date(item.dueAt).toLocaleString() : "—"}</td>
      <td>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className="ops-floor__act"
            disabled={busy}
            onClick={() => {
              if (primary === "Open Gingr") {
                window.open("/gingr", "_blank", "noopener,noreferrer");
                return;
              }
              if (item.hrefTab) onNavigate(item.hrefTab);
              else void onAction(item.id, "resolved", item.title);
            }}
          >
            {busy ? "…" : primary}
          </button>
          {item.hrefTab ? (
            <button type="button" className="ops-floor__act ops-floor__act--ghost" disabled={busy} onClick={() => onNavigate(item.hrefTab!)}>
              Open
            </button>
          ) : null}
          <button
            type="button"
            className="ops-floor__act ops-floor__act--ghost"
            disabled={busy}
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((v) => !v);
              setConfirmDelete(false);
            }}
          >
            More
          </button>
        </div>
        {expanded ? (
          <div className="ops-floor__confirm-delete" style={{ marginTop: 8 }}>
            {secondary.map((action) => (
              <button
                key={action}
                type="button"
                className="ops-floor__act ops-floor__act--ghost"
                disabled={busy}
                onClick={() => void onAction(item.id, action, item.title)}
              >
                {workItemActionLabel(action)}
              </button>
            ))}
            {actions.includes("resolved") ? (
              <button
                type="button"
                className="ops-floor__act ops-floor__act--ghost"
                disabled={busy}
                onClick={() => void onAction(item.id, "resolved", item.title)}
              >
                Resolve
              </button>
            ) : null}
            {actions.includes("delete") ? (
              confirmDelete ? (
                <>
                  <span className="ops-floor__sub">Remove this row?</span>
                  <button
                    type="button"
                    className="ops-floor__act ops-floor__act--danger"
                    disabled={busy}
                    onClick={() => void onAction(item.id, "delete", item.title)}
                  >
                    Confirm delete
                  </button>
                  <button type="button" className="ops-floor__act ops-floor__act--ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="ops-floor__act ops-floor__act--danger"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete…
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}