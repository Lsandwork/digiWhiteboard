"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CastKeeperProvider, useCastKeeperContext } from "@/hooks/useCastKeeper";
import {
  formatLaBoardClock,
  formatLaBoardDate,
  periodLabel
} from "@/lib/tl-digi-board/medication-windows";
import type { TlBoardMedicationRow, TlDigiBoardSnapshot } from "@/lib/tl-digi-board/types";
import "./tl-alerts-reminders-board.css";

type TlReminderCard = {
  id: string;
  title: string;
  message: string;
  scheduledTime: string;
};

type BoardPayload = TlDigiBoardSnapshot & {
  config?: { displayTitle?: string; enabled?: boolean };
  reminders?: TlReminderCard[];
  error?: string;
};

const POLL_MS = 12_000;

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

function statusLabel(row: TlBoardMedicationRow) {
  if (row.displayStatus === "overdue") return "NOT ADMINISTERED";
  if (row.displayStatus === "administered") return "ADMINISTERED";
  return "NEEDS MEDICATION";
}

function formatAdminTime(iso: string | null) {
  if (!iso) return null;
  try {
    return formatLaBoardClock(new Date(iso));
  } catch {
    return null;
  }
}

function MedicationRow({ row }: { row: TlBoardMedicationRow }) {
  const tone =
    row.displayStatus === "overdue"
      ? "tl-med-row--overdue"
      : row.displayStatus === "needs_medication"
        ? "tl-med-row--needs"
        : "tl-med-row--done";

  return (
    <article className={`tl-med-row ${tone}`}>
      <div className="tl-med-row__dog">
        {row.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photoUrl} alt="" className="tl-med-row__photo" />
        ) : (
          <div className="tl-med-row__photo tl-med-row__photo--placeholder" aria-hidden>
            {row.dogName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h3 className="tl-med-row__name">{row.dogName}</h3>
          <p className="tl-med-row__lodging">{row.lodgingLabel || "LODGING UNKNOWN"}</p>
        </div>
      </div>
      <div className="tl-med-row__meta">
        <span className="tl-med-row__schedule">{scheduleBadge(row)}</span>
        <strong className="tl-med-row__med">{row.medicationName}</strong>
        <span className="tl-med-row__dose">{row.dosage || "—"}</span>
        <span className="tl-med-row__instructions">{row.instructions || row.notes || "—"}</span>
      </div>
      <div className={`tl-med-row__status tl-med-row__status--${row.displayStatus}`}>
        <span className="tl-med-row__status-label">{statusLabel(row)}</span>
        {row.displayStatus === "administered" ? (
          <span className="tl-med-row__status-detail">
            {[formatAdminTime(row.administeredAt), row.administeredBy || "Recorded in Gingr"].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function BoardInner() {
  const castKeeper = useCastKeeperContext();
  const [snapshot, setSnapshot] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/boards/tl-alerts-reminders", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as BoardPayload;
      if (!res.ok) throw new Error(json.error || "Failed to load board.");
      setSnapshot(json);
      setError(null);
      castKeeper?.markDataFresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board.");
    }
  }, [castKeeper]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), POLL_MS);
    const clock = window.setInterval(() => setNow(new Date()), 15_000);

    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const title = snapshot?.config?.displayTitle || "TL Alerts + Reminders";
  const summary = snapshot?.summary;
  const meta = snapshot?.meta;
  const periodText = meta?.currentPeriod ? periodLabel(meta.currentPeriod) : "—";

  const syncClass =
    meta?.gingrSyncHealth === "live"
      ? "tl-sync--live"
      : meta?.gingrSyncHealth === "delayed"
        ? "tl-sync--delayed"
        : "tl-sync--issue";

  const syncLabel =
    meta?.gingrSyncHealth === "live"
      ? "GINGR ● LIVE"
      : meta?.gingrSyncHealth === "delayed"
        ? "GINGR ⚠ SYNC DELAYED"
        : "⚠ GINGR CONNECTION ISSUE";

  const lastSync = useMemo(() => {
    if (!meta?.lastSuccessfulSyncAt) return "—";
    try {
      return formatLaBoardClock(new Date(meta.lastSuccessfulSyncAt));
    } catch {
      return "—";
    }
  }, [meta?.lastSuccessfulSyncAt]);

  return (
    <main className="tl-board">
      <header className="tl-board__header">
        <div className="tl-board__brand">
          <p className="tl-board__eyebrow">RUFFOPS</p>
          <h1 className="tl-board__title">{title}</h1>
        </div>
        <div className="tl-board__clock">
          <p className="tl-board__date">{formatLaBoardDate(now)}</p>
          <p className="tl-board__time">{formatLaBoardClock(now)}</p>
        </div>
        <div className={`tl-board__sync ${syncClass}`}>
          <p className="tl-board__sync-label">{syncLabel}</p>
          <p className="tl-board__sync-meta">Last sync {lastSync}</p>
          <p className="tl-board__sync-meta">Period {periodText} · America/Los_Angeles</p>
        </div>
      </header>

      {meta && !meta.administrationStatusAvailable ? (
        <p className="tl-board__api-note" role="status">
          Medication schedules sync from Gingr. Administration status is not available via Gingr’s public API — record doses
          in Gingr’s Medication Report. This board will not mark ADMINISTERED until Gingr exposes that data.
        </p>
      ) : null}

      {meta?.isStale ? (
        <p className="tl-board__stale" role="alert">
          Showing last known medication data. Gingr sync may be out of date.
        </p>
      ) : null}

      {error ? <p className="tl-board__error">{error}</p> : null}

      {summary ? (
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

      {!snapshot && !error ? <p className="tl-board__loading">Loading board…</p> : null}

      {snapshot?.overdue.length ? (
        <section className="tl-section tl-section--overdue">
          <h2 className="tl-section__title">🚨 Overdue Medications</h2>
          <div className="tl-section__list">
            {snapshot.overdue.map((row) => (
              <MedicationRow key={`${row.gingrMedicationId}-${row.gingrScheduleLabel}`} row={row} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="tl-section">
        <h2 className="tl-section__title">
          {meta?.currentPeriod ? `${periodLabel(meta.currentPeriod)} Medications` : "Current Medications"}
        </h2>
        {snapshot?.meta.allClear ? (
          <div className="tl-all-clear">
            <p className="tl-all-clear__title">✓ All Clear</p>
            <p>No current medications due.</p>
            {meta?.nextPeriodStartsAt ? <p>Next medication period: {meta.nextPeriodStartsAt}</p> : null}
          </div>
        ) : snapshot?.current.length ? (
          <div className="tl-section__list">
            {snapshot.current.map((row) => (
              <MedicationRow key={`${row.gingrMedicationId}-${row.gingrScheduleLabel}`} row={row} />
            ))}
          </div>
        ) : (
          <p className="tl-section__empty">No medications in the current window.</p>
        )}
      </section>

      <section className="tl-section">
        <h2 className="tl-section__title">Daily Reminders</h2>
        {snapshot?.reminders?.length ? (
          <div className="tl-reminders">
            {snapshot.reminders.map((reminder) => (
              <article key={reminder.id} className="tl-reminder">
                <p className="tl-reminder__time">{reminder.scheduledTime}</p>
                <h3 className="tl-reminder__title">{reminder.title}</h3>
                <p className="tl-reminder__message">{reminder.message}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="tl-section__empty">No Team Lead daily reminders scheduled right now.</p>
        )}
      </section>
    </main>
  );
}

export function TlAlertsRemindersBoard() {
  return (
    <CastKeeperProvider displayType="tl_alerts_reminders" route="/boards/tl-alerts-reminders" enabled>
      <BoardInner />
    </CastKeeperProvider>
  );
}
