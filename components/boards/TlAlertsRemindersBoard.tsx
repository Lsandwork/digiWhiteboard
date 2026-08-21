"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { CastKeeperProvider, useCastKeeperContext } from "@/hooks/useCastKeeper";
import { TlBoardClock, useLaBoardNow } from "@/components/boards/TlBoardClock";
import {
  currentMedicationPeriodAt,
  formatLaBoardClock,
  periodLabel
} from "@/lib/tl-digi-board/medication-windows";
import { tlDogPhotoCandidates } from "@/lib/tl-digi-board/animal-photos";
import { splitMedicationDisplayNotes } from "@/lib/tl-digi-board/medication-notes";
import type {
  TlBoardAdditionalServiceRow,
  TlBoardDisplayState,
  TlBoardMedicationRow,
  TlDigiBoardSnapshot
} from "@/lib/tl-digi-board/types";
import {
  didTlBoardRecover,
  headerLabelForKind,
  headerLastSyncText,
  headerPeriodText,
  mergeTlBoardClientPayload,
  planTlBoardRefresh,
  resolveTlCardKind,
  resolveTlHeaderKind,
  shouldResyncOnWake,
  TL_BOARD_CLIENT_FETCH_TIMEOUT_MS,
  type TlCardKind
} from "@/lib/tl-digi-board/display-state";
import {
  TL_DAILY_TEAM_REMINDERS,
  shouldShowDailyTeamRemindersForServices
} from "@/lib/tl-digi-board/daily-team-reminders";
import "./tl-alerts-reminders-board.css";
import { TlBoardPushTakeover } from "@/components/boards/TlBoardPushTakeover";

type BoardPayload = TlDigiBoardSnapshot & {
  config?: { displayTitle?: string; enabled?: boolean };
  reminders?: Array<{
    id: string;
    title: string;
    message: string;
    scheduledTime: string;
  }>;
  error?: string;
};

const FITDOG_LOGO = "/assets/fitdog/fitdog-logo-white.svg";
const TL_BOARD_LAST_GOOD_KEY = "fitdog-tl-board-last-good";

/** Passive TV pagination for unusually long Additional Services lists. */
const TL_SERVICES_PAGE_INTERVAL_MS = 10_000;
const TL_SERVICES_PAGE_SIZE_WITH_REMINDERS = 8;
const TL_SERVICES_PAGE_SIZE_EXPANDED = 14;

function readStoredTlBoard(): BoardPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TL_BOARD_LAST_GOOD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoardPayload;
    if (!parsed?.meta) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredTlBoard(payload: BoardPayload) {
  try {
    window.localStorage.setItem(TL_BOARD_LAST_GOOD_KEY, JSON.stringify(payload));
  } catch {
    // TV browsers can reject storage; in-memory last-good still holds.
  }
}

function payloadHasRows(payload: BoardPayload | null) {
  if (!payload) return false;
  return Boolean(
    payload.medications?.length ||
      payload.overdue?.length ||
      payload.current?.length ||
      payload.additionalServices?.length ||
      payload.meta?.lastSuccessfulSyncAt
  );
}

function usePassiveServicePages<T>(items: T[], pageSize: number, intervalMs: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize) || 1);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [items.length, pageSize]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const id = window.setInterval(() => {
      setPageIndex((previous) => (previous + 1) % pageCount);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [pageCount, intervalMs]);

  const safePage = Math.min(pageIndex, pageCount - 1);
  const start = safePage * pageSize;
  const end = Math.min(start + pageSize, items.length);
  return {
    pageItems: items.slice(start, end),
    start: items.length ? start + 1 : 0,
    end,
    total: items.length,
    pageCount
  };
}

function scheduleBadge(row: TlBoardMedicationRow) {
  if (row.displayStatus === "overdue" && row.overdueSourcePeriod) {
    return `OVERDUE • ${periodLabel(row.overdueSourcePeriod)}`;
  }
  if (row.scheduleKind === "other_special") {
    return `OTHER / SPECIAL • ${row.gingrScheduleLabel}`;
  }
  if (row.scheduleKind === "am" || row.scheduleKind === "mid_day" || row.scheduleKind === "pm") {
    return periodLabel(row.scheduleKind);
  }
  return row.gingrScheduleLabel;
}

function medicationStatusLabel(row: TlBoardMedicationRow) {
  const gingrLabel = row.gingrReportStatusLabel?.trim();
  if (gingrLabel) return gingrLabel.toUpperCase();
  if (row.displayStatus === "overdue") return "NOT ADMINISTERED";
  if (row.displayStatus === "administered") {
    return row.administrationStatus === "owner_administered" ? "OWNER ADMINISTERED" : "ADMINISTERED";
  }
  if (row.displayStatus === "prepared") return "PREPARED";
  if (row.displayStatus === "refused") {
    return row.administrationStatus === "unable_to_administer" ? "UNABLE TO ADMINISTER" : "REFUSED";
  }
  if (row.displayStatus === "partially_administered") return "PARTIALLY ADMINISTERED";
  return "NEEDS MEDICATION";
}

function MedicationNotesCell({ row }: { row: TlBoardMedicationRow }) {
  const display = splitMedicationDisplayNotes(row);
  if (!display.instructions && !display.notes) return <span className="tl-table__muted">—</span>;
  if (display.instructions && display.notes) {
    return (
      <div className="tl-table__notes-stack">
        <p className="tl-table__instruction-text">{display.instructions}</p>
        <p className="tl-table__notes">
          <span className="tl-table__notes-label">Notes</span>
          {display.notes}
        </p>
      </div>
    );
  }
  const text = display.notes || display.instructions;
  return (
    <div className="tl-table__notes-stack">
      <p className="tl-table__notes">
        <span className="tl-table__notes-label">Notes</span>
        {text}
      </p>
    </div>
  );
}

function formatAdminTime(iso: string | null) {
  if (!iso) return null;
  try {
    return formatLaBoardClock(new Date(iso));
  } catch {
    return null;
  }
}

function DogPhoto({
  animalId,
  dogName,
  photoUrl
}: {
  animalId: string;
  dogName: string;
  photoUrl: string | null;
}) {
  const candidates = useMemo(
    () => tlDogPhotoCandidates(animalId, photoUrl),
    [animalId, photoUrl]
  );
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);

  useEffect(() => {
    setFailedSrcs([]);
  }, [candidates]);

  const src = candidates.find((url) => !failedSrcs.includes(url)) ?? null;

  if (!src) {
    return (
      <div className="tl-table__photo tl-table__photo--placeholder" aria-hidden>
        {dogName.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="tl-table__photo"
      // Each candidate is retired permanently. Tracking only the last failure
      // made the board alternate between two dead URLs forever.
      onError={() => setFailedSrcs((previous) => (previous.includes(src) ? previous : [...previous, src]))}
    />
  );
}

function MedicationTableRow({ row }: { row: TlBoardMedicationRow }) {
  const tone =
    row.displayStatus === "overdue"
      ? "tl-table__row--overdue"
      : row.displayStatus === "needs_medication" ||
          row.displayStatus === "prepared" ||
          row.displayStatus === "partially_administered"
        ? "tl-table__row--needs"
        : row.displayStatus === "refused"
          ? "tl-table__row--overdue"
          : "tl-table__row--done";

  return (
    <tr className={`tl-table__row ${tone}`}>
      <td>
        <div className="tl-table__dog">
          <DogPhoto animalId={row.gingrAnimalId} dogName={row.dogName} photoUrl={row.photoUrl} />
          <div>
            <strong className="tl-table__dog-name">{row.dogName}</strong>
          </div>
        </div>
      </td>
      <td className="tl-table__lodging">{row.lodgingLabel || "—"}</td>
      <td className="tl-table__schedule">{scheduleBadge(row)}</td>
      <td className="tl-table__med">{row.medicationName}</td>
      <td className="tl-table__dose">{row.dosage || "—"}</td>
      <td className="tl-table__instructions">
        <MedicationNotesCell row={row} />
      </td>
      <td className="tl-table__status-cell">
        <span className={`tl-badge tl-badge--${row.displayStatus}`}>{medicationStatusLabel(row)}</span>
        {row.displayStatus === "administered" || row.administrationStatus === "owner_administered" ? (
          <span className="tl-table__status-detail">
            {[formatAdminTime(row.administeredAt), row.administeredBy || "Recorded in Gingr"].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function ServiceTableRow({ row }: { row: TlBoardAdditionalServiceRow }) {
  const isUnknown = row.displayStatus === "completion_unknown";
  return (
    <tr className={`tl-table__row tl-table__row--service ${isUnknown ? "tl-table__row--unknown" : ""}`}>
      <td>
        <div className="tl-table__dog">
          <DogPhoto animalId={row.gingrAnimalId} dogName={row.dogName} photoUrl={row.photoUrl} />
          <div>
            <strong className="tl-table__dog-name">{row.dogName}</strong>
          </div>
        </div>
      </td>
      <td className="tl-table__service">{row.serviceName}</td>
      <td className="tl-table__status-cell">
        <span className={`tl-badge ${isUnknown ? "tl-badge--completion_unknown" : "tl-badge--needs_completion"}`}>
          {isUnknown ? "COMPLETION UNKNOWN" : "NEEDS COMPLETION"}
        </span>
      </td>
    </tr>
  );
}

function BoardInner() {
  const castKeeper = useCastKeeperContext();
  const now = useLaBoardNow();
  const [snapshot, setSnapshot] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasResolved, setHasResolved] = useState(false);
  const [retryInSec, setRetryInSec] = useState<number | null>(null);
  const snapshotRef = useRef<BoardPayload | null>(null);
  const failCountRef = useRef(0);
  const lastAttemptRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);

  const clearTimers = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current != null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(
    (boardState: TlBoardDisplayState | null, consecutiveFailures: number) => {
      clearTimers();
      const plan = planTlBoardRefresh({ consecutiveFailures, boardState });
      if (plan.delayMs <= 0) {
        void loadRef.current(plan.force);
        return;
      }
      const dueAt = Date.now() + plan.delayMs;
      const showRetry = consecutiveFailures > 0 || boardState === "CONNECTION_ERROR";
      setRetryInSec(showRetry ? Math.ceil(plan.delayMs / 1000) : null);
      if (showRetry) {
        countdownRef.current = window.setInterval(() => {
          const remaining = Math.max(0, Math.ceil((dueAt - Date.now()) / 1000));
          setRetryInSec(remaining);
        }, 1000);
      }
      timerRef.current = window.setTimeout(() => {
        void loadRef.current(plan.force);
      }, plan.delayMs);
    },
    [clearTimers]
  );

  const load = useCallback(
    async (force = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), TL_BOARD_CLIENT_FETCH_TIMEOUT_MS);
      lastAttemptRef.current = Date.now();
      try {
        const url = force ? "/api/boards/tl-alerts-reminders?force=1" : "/api/boards/tl-alerts-reminders";
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        const json = (await res.json().catch(() => ({}))) as BoardPayload;
        if (abortRef.current !== controller) return;
        const payload = json.meta ? json : null;
        if (!payload) {
          throw new Error(json.error || "Failed to load board.");
        }
        const merged = mergeTlBoardClientPayload(snapshotRef.current, payload) as BoardPayload;
        const previousState = snapshotRef.current?.meta.boardState ?? null;
        const nextState = merged.meta.boardState;
        const recovered = didTlBoardRecover({ previousState, nextState });
        const usable = payloadHasRows(merged);
        const syncFailed =
          !usable &&
          (nextState === "CONNECTION_ERROR" ||
            nextState === "PARTIAL_DATA_ERROR" ||
            Boolean(merged.error) ||
            !res.ok);

        snapshotRef.current = merged;
        setSnapshot(merged);
        setHasResolved(true);
        if (usable) writeStoredTlBoard(merged);
        if (syncFailed) {
          failCountRef.current += 1;
          setError(merged.meta.lastError || json.error || "Gingr is temporarily unavailable.");
        } else {
          failCountRef.current = 0;
          setError(null);
          if (recovered) {
            setRetryInSec(null);
          }
          castKeeper?.markDataFresh();
        }
        scheduleNext(nextState, failCountRef.current);
      } catch (err) {
        if (abortRef.current !== controller) return;
        failCountRef.current += 1;
        setHasResolved(true);
        const timedOut =
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && (err.name === "AbortError" || /aborted|timed out/i.test(err.message)));
        if (!payloadHasRows(snapshotRef.current)) {
          setError(
            timedOut
              ? "Board request timed out waiting for Gingr status."
              : err instanceof Error
                ? err.message
                : "Failed to load board."
          );
        }
        if (payloadHasRows(snapshotRef.current)) {
          castKeeper?.markDataFresh();
        }
        scheduleNext(snapshotRef.current?.meta.boardState ?? "CONNECTION_ERROR", failCountRef.current);
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [castKeeper, scheduleNext]
  );

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const stored = readStoredTlBoard();
    if (stored && payloadHasRows(stored)) {
      snapshotRef.current = stored;
      setSnapshot(stored);
      setHasResolved(true);
    }
    void loadRef.current(false);

    function maybeWakeSync() {
      if (
        shouldResyncOnWake({
          lastAttemptAtMs: lastAttemptRef.current,
          nowMs: Date.now(),
          boardState: snapshotRef.current?.meta.boardState ?? "INITIAL_LOADING"
        })
      ) {
        void loadRef.current(true);
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") maybeWakeSync();
    }
    function onFocus() {
      maybeWakeSync();
    }
    function onOnline() {
      void loadRef.current(true);
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      clearTimers();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
    // Initial mount only — load/schedule live in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = hasResolved ? "resolved" : "initial";
  const title = snapshot?.config?.displayTitle || "Team Lead Alerts + Reminders";
  const summary = snapshot?.summary;
  const servicesSummary = snapshot?.servicesSummary;
  const meta = snapshot?.meta;
  const periodText = headerPeriodText(meta?.currentPeriod, now ? currentMedicationPeriodAt(now) : null);

  const headerKind = resolveTlHeaderKind({
    phase,
    boardState: meta?.boardState,
    gingrSyncHealth: meta?.gingrSyncHealth
  });
  const syncClass =
    headerKind === "live"
      ? "tl-sync--live"
      : headerKind === "delayed" || headerKind === "stale"
        ? "tl-sync--delayed"
        : headerKind === "syncing"
          ? "tl-sync--syncing"
          : "tl-sync--issue";
  const syncLabel = headerLabelForKind(headerKind);

  const lastSync = (() => {
    if (!meta?.lastSuccessfulSyncAt) return headerLastSyncText({ phase, formattedSuccess: null });
    try {
      return headerLastSyncText({
        phase,
        formattedSuccess: formatLaBoardClock(new Date(meta.lastSuccessfulSyncAt))
      });
    } catch {
      return headerLastSyncText({ phase, formattedSuccess: null });
    }
  })();

  const medicationRows = snapshot
    ? [
        ...snapshot.overdue.filter((row) => row.displayStatus !== "administered"),
        ...snapshot.current.filter(
          (row) =>
            row.displayStatus === "needs_medication" ||
            row.displayStatus === "overdue" ||
            row.displayStatus === "prepared" ||
            row.displayStatus === "refused" ||
            row.displayStatus === "partially_administered"
        )
      ]
    : [];

  const serviceRows = snapshot?.additionalServices ?? [];
  // Layout from resolved Additional Services only — avoids flash before first payload / last-good.
  const showDailyTeamReminders = hasResolved && shouldShowDailyTeamRemindersForServices(serviceRows);
  const servicesPageSize = showDailyTeamReminders
    ? TL_SERVICES_PAGE_SIZE_WITH_REMINDERS
    : TL_SERVICES_PAGE_SIZE_EXPANDED;
  const servicePages = usePassiveServicePages(serviceRows, servicesPageSize, TL_SERVICES_PAGE_INTERVAL_MS);
  const medCard = resolveTlCardKind({
    phase,
    health: meta?.medicationsHealth,
    allClear: Boolean(meta?.medicationsAllClear),
    hasRows: medicationRows.length > 0
  });
  const serviceCard = resolveTlCardKind({
    phase,
    health: meta?.servicesHealth,
    allClear: Boolean(meta?.servicesAllClear),
    hasRows: serviceRows.length > 0
  });

  const retryLabel =
    retryInSec != null && (headerKind === "issue" || headerKind === "stale" || headerKind === "delayed")
      ? `Retrying in ${retryInSec} second${retryInSec === 1 ? "" : "s"}…`
      : null;

  return (
    <>
      <main className="tl-board">
      <header className="tl-board__header">
        <div className="tl-board__brand">
          <div className="tl-board__logo-row">
            <Image
              src={FITDOG_LOGO}
              alt="Fitdog"
              width={168}
              height={40}
              className="tl-board__logo"
              priority
            />
            <p className="tl-board__eyebrow">DIGITAL WHITEBOARD</p>
          </div>
          <h1 className="tl-board__title">{title}</h1>
        </div>
        <TlBoardClock now={now} />
        <div className={`tl-board__sync ${syncClass}`}>
          <p className="tl-board__sync-label">{syncLabel}</p>
          <p className="tl-board__sync-meta">Last synced: {lastSync}</p>
          <p className="tl-board__sync-meta">
            Period {periodText} · America/Los_Angeles
          </p>
          {retryLabel ? <p className="tl-board__sync-meta tl-board__sync-retry">{retryLabel}</p> : null}
        </div>
      </header>

      {meta && !meta.servicesCompletionStatusAvailable && serviceCard !== "checking" && serviceCard !== "error" ? (
        <p className="tl-board__api-note" role="status">
          One or more additional services could not read completion status from Gingr reservation rows (missing{" "}
          <code>complete</code> field). Those rows show COMPLETION UNKNOWN and are not treated as incomplete. See{" "}
          {meta.servicesCompletionAudit?.documentationPath || "docs/tl-digi-board/ADDITIONAL_SERVICES_GINGR.md"}.
        </p>
      ) : null}

      {meta && !meta.administrationStatusAvailable && medCard !== "checking" && medCard !== "error" ? (
        <p className="tl-board__api-note" role="status">
          Medication schedules are syncing from Gingr, but administration status could not be loaded from Gingr’s
          Medication Report yet. Doses still must be recorded in Gingr — this board will show ADMINISTERED once report
          history syncs.
        </p>
      ) : null}

      {headerKind === "stale" && lastSync ? (
        <p className="tl-board__stale" role="alert">
          Showing last synced data from {lastSync}
        </p>
      ) : null}

      {error && headerKind === "issue" ? <p className="tl-board__error">{error}</p> : null}

      {summary && medCard !== "checking" && medCard !== "error" ? (
        <section className="tl-board__stats" aria-label="Medication summary">
          <div className="tl-stat">
            <span className="tl-stat__label">Medications Due</span>
            <strong className="tl-stat__value">{summary.due}</strong>
          </div>
          <div className="tl-stat">
            <span className="tl-stat__label">Completed</span>
            <strong className="tl-stat__value">{summary.completed}</strong>
          </div>
          <div className="tl-stat">
            <span className="tl-stat__label">Remaining</span>
            <strong className="tl-stat__value">{summary.remaining}</strong>
          </div>
          <div className={`tl-stat ${summary.overdue > 0 ? "tl-stat--overdue" : ""}`}>
            <span className="tl-stat__label">Overdue</span>
            <strong className="tl-stat__value">{summary.overdue}</strong>
          </div>
        </section>
      ) : null}

      <section className="tl-board__split">
        <GingrStatusCard
          title="Medication Reminders"
          subtitle="Only shows items not yet completed in Gingr."
          kind={medCard}
          lastSync={lastSync}
          retryLabel={retryLabel}
          errorNoun="medications"
        >
          {medicationRows.length ? (
            <div className="tl-table-wrap">
              <table className="tl-table">
                <thead>
                  <tr>
                    <th>Dog</th>
                    <th>Lodging</th>
                    <th>Schedule</th>
                    <th>Medication</th>
                    <th>Dosage</th>
                    <th>Instructions / Notes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {medicationRows.map((row) => (
                    <MedicationTableRow key={`${row.gingrMedicationId}-${row.gingrScheduleLabel}`} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </GingrStatusCard>

        <div
          className={`tl-board__stack${showDailyTeamReminders ? "" : " tl-board__stack--services-expanded"}`}
        >
          <GingrStatusCard
            title="Additional Services"
            subtitle="Only shows services not marked completed in Gingr."
            kind={serviceCard}
            lastSync={lastSync}
            retryLabel={retryLabel}
            errorNoun="additional services"
            className="tl-panel--services"
            allClearDetail={
              servicesSummary?.completed ? `${servicesSummary.completed} completed in Gingr today.` : undefined
            }
          >
            {serviceRows.length ? (
              <div className={`tl-table-wrap${serviceRows.length > servicesPageSize ? " tl-table-wrap--paged" : ""}`}>
                {servicePages.pageCount > 1 ? (
                  <p className="tl-services-page" aria-live="polite">
                    {servicePages.start}–{servicePages.end} of {servicePages.total}
                  </p>
                ) : null}
                <table
                  className={`tl-table tl-table--services${
                    !showDailyTeamReminders && serviceRows.length >= 8 ? " tl-table--services-dense" : ""
                  }`}
                >
                  <thead>
                    <tr>
                      <th>Dog</th>
                      <th>Service</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicePages.pageItems.map((row) => (
                      <ServiceTableRow key={row.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </GingrStatusCard>

          {showDailyTeamReminders ? (
            <section className="tl-panel tl-panel--reminders" aria-label="Daily Team Reminders">
              <div className="tl-panel__head">
                <h2 className="tl-panel__title">Daily Team Reminders</h2>
                <p className="tl-panel__sub">Standing checklist for the Team Lead floor.</p>
              </div>
              <ul className="tl-team-reminders">
                {TL_DAILY_TEAM_REMINDERS.map((item) => (
                  <li key={item} className="tl-team-reminders__item">
                    <span className="tl-team-reminders__mark" aria-hidden>
                      ✓
                    </span>
                    <span className="tl-team-reminders__text">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
      </main>
      <TlBoardPushTakeover />
    </>
  );
}

function GingrStatusCard({
  title,
  subtitle,
  kind,
  lastSync,
  retryLabel,
  errorNoun,
  errorDetail,
  allClearText,
  allClearDetail,
  className,
  children
}: {
  title: string;
  subtitle: string;
  kind: TlCardKind;
  lastSync: string | null;
  retryLabel: string | null;
  errorNoun: string;
  errorDetail?: string;
  allClearText?: string;
  allClearDetail?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`tl-panel${className ? ` ${className}` : ""}`}>
      <div className="tl-panel__head">
        <h2 className="tl-panel__title">{title}</h2>
        <p className="tl-panel__sub">{subtitle}</p>
      </div>
      {kind === "checking" ? (
        <div className="tl-card-state tl-card-state--checking" role="status">
          <div className="tl-skeleton" aria-hidden />
          <p className="tl-card-state__title">Checking Gingr…</p>
          <p>Medication and service status is not confirmed yet.</p>
        </div>
      ) : null}
      {kind === "error" ? (
        <div className="tl-card-state tl-card-state--error" role="alert">
          <p className="tl-card-state__title">⚠ Unable to verify {errorNoun}</p>
          <p>{errorDetail ?? "Gingr is temporarily unavailable."}</p>
          <p>Last successful sync: {lastSync || "—"}</p>
          {retryLabel ? <p className="tl-card-state__retry">{retryLabel}</p> : null}
        </div>
      ) : null}
      {kind === "all_clear" ? (
        <div className="tl-all-clear">
          <p className="tl-all-clear__title">✓ All Clear</p>
          <p>
            {allClearText ??
              (errorNoun === "medications"
                ? "No medications currently due."
                : "No additional services need completion.")}
          </p>
          {allClearDetail ? <p className="tl-panel__sub">{allClearDetail}</p> : null}
        </div>
      ) : null}
      {kind === "stale" || kind === "rows" ? (
        <>
          {kind === "stale" && lastSync ? (
            <p className="tl-card-state__stale-note">Showing last synced data from {lastSync}</p>
          ) : null}
          {children}
        </>
      ) : null}
      {kind === "stale" && !children ? (
        <div className="tl-card-state tl-card-state--stale" role="status">
          <p className="tl-card-state__title">Showing last synced data{lastSync ? ` from ${lastSync}` : ""}</p>
          <p>Gingr has not confirmed the current {errorNoun} list.</p>
        </div>
      ) : null}
    </div>
  );
}

export function TlAlertsRemindersBoard() {
  return (
    <CastKeeperProvider displayType="tl_alerts_reminders" route="/boards/tl-alerts-reminders" enabled allowStaleReload={false}>
      <BoardInner />
    </CastKeeperProvider>
  );
}
