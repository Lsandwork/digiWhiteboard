"use client";

import { readResponseJson } from "@/lib/http/read-response-json";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Dog, Loader2, PawPrint, Search } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { tlDogPhotoCandidates } from "@/lib/tl-digi-board/animal-photos";
import { packageGroupWalkOwnershipErrorDetail } from "@/lib/package-group-walks/gingr-packages";
import type {
  PackageGroupWalkCompletion,
  PackageGroupWalkRow,
  PackageGroupWalkState
} from "@/lib/package-group-walks/types";
import "./package-group-walks-panel.css";

/** Fallback refresh when Supabase Realtime is unavailable. Visibility-aware. */
const REFRESH_INTERVAL_MS = 30_000;

type Filter = "needs_walk" | "completed" | "all";

type CompletionPhase = "idle" | "saving" | "done";

function formatPacificTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

function DogAvatar({
  animalId,
  dogName,
  photoUrl
}: {
  animalId: string;
  dogName: string;
  photoUrl: string | null;
}) {
  const candidates = useMemo(() => tlDogPhotoCandidates(animalId, photoUrl), [animalId, photoUrl]);
  // Failures are tracked by URL, so a new dog's candidates never match stale
  // entries and no reset is required.
  const [failed, setFailed] = useState<string[]>([]);

  const src = candidates.find((url) => !failed.includes(url)) ?? null;

  if (!src) {
    return (
      <div className="pgw-avatar pgw-avatar--placeholder" aria-hidden="true">
        {dogName.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="pgw-avatar"
      loading="lazy"
      decoding="async"
      // Each candidate is retired permanently so a pair of dead URLs cannot loop.
      onError={() => setFailed((previous) => (previous.includes(src) ? previous : [...previous, src]))}
    />
  );
}

function PackageBadge({ packageKey, packageName }: { packageKey: string; packageName: string }) {
  return <span className={`pgw-package pgw-package--${packageKey}`}>{packageName}</span>;
}

function SyncPill({ state, lastSync }: { state: PackageGroupWalkState["meta"]["syncState"]; lastSync: string }) {
  const label =
    state === "LIVE" || state === "EMPTY_VALID"
      ? "GINGR • LIVE"
      : state === "STALE"
        ? "GINGR • STALE"
        : state === "ERROR"
          ? "ELIGIBILITY • UNVERIFIED"
          : "SYNCING…";
  const tone =
    state === "LIVE" || state === "EMPTY_VALID"
      ? "pgw-sync--live"
      : state === "STALE"
        ? "pgw-sync--stale"
        : state === "ERROR"
          ? "pgw-sync--error"
          : "pgw-sync--syncing";
  return (
    <div className={`pgw-sync ${tone}`} role="status">
      <span className="pgw-sync__label">{label}</span>
      <span className="pgw-sync__meta">Last synced: {lastSync}</span>
    </div>
  );
}

export function PackageGroupWalksPanel() {
  const { showToast } = useToast();
  const [state, setState] = useState<PackageGroupWalkState | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("needs_walk");
  const [query, setQuery] = useState("");
  const [phases, setPhases] = useState<Record<string, CompletionPhase>>({});
  const hasLoadedRef = useRef(false);

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    try {
      const response = await fetch("/api/admin/package-group-walks", { cache: "no-store" });
      const body = (await readResponseJson(response)) as PackageGroupWalkState & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load Package Group Walks.");
      setState(body);
      setLoadError(null);
      setHasLoaded(true);
      hasLoadedRef.current = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load Package Group Walks.";
      // Keep the last good list on screen; never blank the page on a failed refresh.
      setLoadError(message);
      setHasLoaded(true);
      if (!options.silent && !hasLoadedRef.current) showToast(message, "error");
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Realtime so every open page reacts the moment anyone completes a walk.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`package-group-walks-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "package_group_walks" }, () => {
        void load({ silent: true });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  // Polling fallback + recovery after sleep/network loss. Skipped while hidden.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ silent: true });
    }, REFRESH_INTERVAL_MS);

    function onWake() {
      if (document.visibilityState === "visible") void load({ silent: true });
    }
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [load]);

  const markCompleted = useCallback(
    async (row: PackageGroupWalkRow) => {
      if (phases[row.gingrAnimalId] === "saving") return;
      setPhases((previous) => ({ ...previous, [row.gingrAnimalId]: "saving" }));
      try {
        const response = await fetch("/api/admin/package-group-walks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            gingrAnimalId: row.gingrAnimalId,
            businessDate: row.businessDate
          })
        });
        const body = (await readResponseJson(response)) as { error?: string; completion?: PackageGroupWalkCompletion };
        if (!response.ok) throw new Error(body.error ?? "Unable to mark the group walk completed.");

        setPhases((previous) => ({ ...previous, [row.gingrAnimalId]: "done" }));
        showToast(`${row.dogName}'s group walk is marked completed.`, "success");
        await load({ silent: true });
      } catch (error) {
        // Never show a false success: restore the button and keep the row.
        setPhases((previous) => {
          const next = { ...previous };
          delete next[row.gingrAnimalId];
          return next;
        });
        showToast(
          error instanceof Error ? error.message : "Unable to mark the group walk completed.",
          "error"
        );
      }
    },
    [load, phases, showToast]
  );

  const meta = state?.meta;
  const summary = state?.summary;
  const lastSync = formatPacificTime(meta?.lastSuccessfulSyncAt);
  const syncState = !hasLoaded ? "LOADING" : (meta?.syncState ?? "LOADING");

  const normalizedQuery = query.trim().toLowerCase();
  const pending = useMemo(() => {
    const rows = state?.pending ?? [];
    if (!normalizedQuery) return rows;
    return rows.filter((row) => row.dogName.toLowerCase().includes(normalizedQuery));
  }, [state?.pending, normalizedQuery]);

  const completed = useMemo(() => {
    const rows = state?.completed ?? [];
    if (!normalizedQuery) return rows;
    return rows.filter((row) => row.dogName.toLowerCase().includes(normalizedQuery));
  }, [state?.completed, normalizedQuery]);

  const showNeedsWalk = filter === "needs_walk" || filter === "all";
  const showCompleted = filter === "completed" || filter === "all";

  return (
    <section className="pgw-page">
      <header className="pgw-header admin-card">
        <div className="pgw-header__top">
          <div className="pgw-header__identity">
            <div className="pgw-header__icon" aria-hidden="true">
              <PawPrint className="h-6 w-6" />
            </div>
            <div>
              <h1 className="pgw-header__title admin-text-emphasis">Package Group Walks</h1>
              <p className="pgw-header__subtitle">
                Checked-in dogs with eligible packages that include today&rsquo;s complimentary group walk.
              </p>
            </div>
          </div>
          <SyncPill state={syncState} lastSync={lastSync} />
        </div>

        <div className="pgw-metrics">
          <div className="pgw-metric">
            <span className="pgw-metric__label">Eligible Today</span>
            <strong className="pgw-metric__value">{summary?.eligibleToday ?? "—"}</strong>
          </div>
          <div className="pgw-metric pgw-metric--remaining">
            <span className="pgw-metric__label">Remaining</span>
            <strong className="pgw-metric__value">{summary?.remaining ?? "—"}</strong>
          </div>
          <div className="pgw-metric pgw-metric--completed">
            <span className="pgw-metric__label">Completed</span>
            <strong className="pgw-metric__value">{summary?.completed ?? "—"}</strong>
          </div>
          <div className="pgw-metric">
            <span className="pgw-metric__label">Business Date</span>
            <strong className="pgw-metric__value pgw-metric__value--text">
              {meta?.businessDate ?? "—"}
            </strong>
          </div>
        </div>
      </header>

      {syncState === "STALE" ? (
        <p className="pgw-notice pgw-notice--stale" role="status">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Showing last synced data from {lastSync}. Gingr has not confirmed the current check-in list.
        </p>
      ) : null}

      {syncState === "ERROR" ? (
        <p className="pgw-notice pgw-notice--error" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Unable to verify Package Group Walk eligibility.{" "}
          {packageGroupWalkOwnershipErrorDetail(meta?.lastError)} Last successful sync: {lastSync}.
          Retrying automatically.
        </p>
      ) : null}

      {loadError && syncState !== "ERROR" ? (
        <p className="pgw-notice pgw-notice--stale" role="status">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {loadError}
        </p>
      ) : null}

      <div className="pgw-controls">
        <div className="pgw-filters" role="group" aria-label="Filter Package Group Walks">
          {(
            [
              ["needs_walk", "Needs Walk"],
              ["completed", "Completed Today"],
              ["all", "All"]
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`pgw-filter ${filter === value ? "is-active" : ""}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="pgw-search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Search dog</span>
          <input
            type="search"
            className="pgw-search__input"
            placeholder="Search dog…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {showNeedsWalk ? (
        <section className="pgw-card admin-card" aria-label="Dogs that need a group walk">
          <div className="pgw-card__head">
            <h2 className="pgw-card__title">Needs Group Walk</h2>
            <span className="pgw-card__count">{pending.length}</span>
          </div>

          {!hasLoaded ? (
            <div className="pgw-state" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <p className="pgw-state__title">Checking Gingr…</p>
              <p>Package Group Walk eligibility is not confirmed yet.</p>
            </div>
          ) : syncState === "ERROR" ? (
            <div className="pgw-state pgw-state--error" role="alert">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              <p className="pgw-state__title">Unable to verify Package Group Walk eligibility</p>
              <p>
                {meta?.gingrOk
                  ? packageGroupWalkOwnershipErrorDetail(meta?.lastError)
                  : `Gingr is temporarily unavailable. Last successful sync: ${lastSync}`}
              </p>
            </div>
          ) : pending.length === 0 ? (
            <div className="pgw-state pgw-state--clear">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              <p className="pgw-state__title">All Package Group Walks Clear</p>
              <p>
                {normalizedQuery
                  ? "No matching dogs need a group walk."
                  : "No qualifying checked-in dogs currently need a group walk."}
              </p>
            </div>
          ) : (
            <div className="pgw-table-wrap">
              <table className="pgw-table">
                <thead>
                  <tr>
                    <th scope="col">Dog</th>
                    <th scope="col">Package</th>
                    <th scope="col">Check-In</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="pgw-table__action-col">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((row) => {
                    const phase = phases[row.gingrAnimalId] ?? "idle";
                    return (
                      <tr key={row.id} className="pgw-row">
                        <td>
                          <div className="pgw-dog">
                            <DogAvatar
                              animalId={row.gingrAnimalId}
                              dogName={row.dogName}
                              photoUrl={row.photoUrl}
                            />
                            <div className="pgw-dog__text">
                              <span className="pgw-dog__name">{row.dogName}</span>
                              {row.ownerName ? (
                                <span className="pgw-dog__owner">{row.ownerName}</span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <PackageBadge packageKey={row.packageKey} packageName={row.packageName} />
                        </td>
                        <td className="pgw-time">
                          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatPacificTime(row.checkedInAt)}
                        </td>
                        <td>
                          <span className="pgw-status pgw-status--needs">NEEDS GROUP WALK</span>
                        </td>
                        <td className="pgw-table__action-col">
                          <button
                            type="button"
                            className="pgw-complete"
                            disabled={phase !== "idle"}
                            onClick={() => void markCompleted(row)}
                          >
                            {phase === "saving" ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Saving…
                              </>
                            ) : phase === "done" ? (
                              <>
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                Completed
                              </>
                            ) : (
                              "Mark Completed"
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showCompleted ? (
        <section className="pgw-card admin-card" aria-label="Group walks completed today">
          <div className="pgw-card__head">
            <h2 className="pgw-card__title">Completed Today</h2>
            <span className="pgw-card__count">{completed.length}</span>
          </div>

          {completed.length === 0 ? (
            <div className="pgw-state">
              <Dog className="h-5 w-5" aria-hidden="true" />
              <p className="pgw-state__title">No group walks completed yet today.</p>
              <p>Completions appear here with the employee who recorded them.</p>
            </div>
          ) : (
            <div className="pgw-table-wrap">
              <table className="pgw-table">
                <thead>
                  <tr>
                    <th scope="col">Dog</th>
                    <th scope="col">Package</th>
                    <th scope="col">Completed</th>
                    <th scope="col">Completed By</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((row) => (
                    <tr key={row.id} className="pgw-row pgw-row--done">
                      <td>
                        <div className="pgw-dog">
                          <DogAvatar
                            animalId={row.gingrAnimalId}
                            dogName={row.dogName}
                            photoUrl={row.photoUrl}
                          />
                          <div className="pgw-dog__text">
                            <span className="pgw-dog__name">{row.dogName}</span>
                            {row.ownerName ? <span className="pgw-dog__owner">{row.ownerName}</span> : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <PackageBadge packageKey={row.packageKey} packageName={row.packageName} />
                      </td>
                      <td className="pgw-time">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatPacificTime(row.completedAt)}
                      </td>
                      <td className="pgw-completed-by">{row.completedByUserName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
