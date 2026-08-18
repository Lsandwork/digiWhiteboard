"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CastKeeperProvider, useCastKeeperContext } from "@/hooks/useCastKeeper";
import { TlBoardClock } from "@/components/boards/TlBoardClock";
import {
  formatLaBoardClock,
  periodLabel
} from "@/lib/tl-digi-board/medication-windows";
import { tlBoardAnimalPhotoProxyUrl } from "@/lib/tl-digi-board/animal-photos";
import { splitMedicationDisplayNotes } from "@/lib/tl-digi-board/medication-notes";
import type {
  TlBoardAdditionalServiceRow,
  TlBoardMedicationRow,
  TlDigiBoardSnapshot
} from "@/lib/tl-digi-board/types";
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
const FITDOG_LOGO = "/assets/fitdog/fitdog-logo-white.svg";

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
  if (row.displayStatus === "overdue") return "NOT ADMINISTERED";
  if (row.displayStatus === "administered") return "ADMINISTERED";
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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const candidates = useMemo(() => {
    const urls: string[] = [];
    if (photoUrl?.trim()) urls.push(photoUrl.trim());
    urls.push(tlBoardAnimalPhotoProxyUrl(animalId));
    return urls;
  }, [animalId, photoUrl]);

  const src = candidates.find((url) => url !== failedSrc) ?? null;

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
      onError={() => setFailedSrc(src)}
    />
  );
}

function MedicationTableRow({ row }: { row: TlBoardMedicationRow }) {
  const tone =
    row.displayStatus === "overdue"
      ? "tl-table__row--overdue"
      : row.displayStatus === "needs_medication"
        ? "tl-table__row--needs"
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
        {row.displayStatus === "administered" ? (
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
  const [snapshot, setSnapshot] = useState<BoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const title = snapshot?.config?.displayTitle || "Team Lead Alerts + Reminders";
  const summary = snapshot?.summary;
  const servicesSummary = snapshot?.servicesSummary;
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
      ? "GINGR • LIVE"
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

  const medicationRows = useMemo(() => {
    if (!snapshot) return [];
    const overdue = snapshot.overdue.filter((row) => row.displayStatus !== "administered");
    const current = snapshot.current.filter(
      (row) => row.displayStatus === "needs_medication" || row.displayStatus === "overdue"
    );
    return [...overdue, ...current];
  }, [snapshot]);

  const serviceRows = snapshot?.additionalServices ?? [];

  return (
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
        <TlBoardClock />
        <div className={`tl-board__sync ${syncClass}`}>
          <p className="tl-board__sync-label">{syncLabel}</p>
          <p className="tl-board__sync-meta">Last sync {lastSync}</p>
          <p className="tl-board__sync-meta">Period {periodText} · America/Los_Angeles</p>
        </div>
      </header>

      {meta && !meta.servicesCompletionStatusAvailable ? (
        <p className="tl-board__api-note" role="status">
          One or more additional services could not read completion status from Gingr reservation rows (missing{" "}
          <code>complete</code> field). Those rows show COMPLETION UNKNOWN and are not treated as incomplete. See{" "}
          {meta.servicesCompletionAudit?.documentationPath || "docs/tl-digi-board/ADDITIONAL_SERVICES_GINGR.md"}.
        </p>
      ) : null}

      {meta && !meta.administrationStatusAvailable ? (
        <p className="tl-board__api-note" role="status">
          Medication schedules are syncing from Gingr, but administration status could not be loaded from Gingr’s
          Medication Report yet. Doses still must be recorded in Gingr — this board will show ADMINISTERED once report
          history syncs.
        </p>
      ) : null}

      {meta?.isStale ? (
        <p className="tl-board__stale" role="alert">
          Showing last known data. Gingr sync may be out of date.
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

      <section className="tl-board__split">
        <div className="tl-panel">
          <div className="tl-panel__head">
            <h2 className="tl-panel__title">Medication Reminders</h2>
            <p className="tl-panel__sub">Only shows items not yet completed in Gingr.</p>
          </div>
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
          ) : (
            <div className="tl-all-clear">
              <p className="tl-all-clear__title">✓ All Clear</p>
              <p>No medications currently due.</p>
            </div>
          )}
        </div>

        <div className="tl-panel">
          <div className="tl-panel__head">
            <h2 className="tl-panel__title">Additional Services</h2>
            <p className="tl-panel__sub">Only shows services not marked completed in Gingr.</p>
          </div>
          {serviceRows.length ? (
            <div className="tl-table-wrap">
              <table className="tl-table tl-table--services">
                <thead>
                  <tr>
                    <th>Dog</th>
                    <th>Service</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceRows.map((row) => (
                    <ServiceTableRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tl-all-clear tl-all-clear--services">
              <p className="tl-all-clear__title">✓ All Clear</p>
              <p>No additional services need completion.</p>
              {servicesSummary?.completed ? (
                <p className="tl-panel__sub">{servicesSummary.completed} completed in Gingr today.</p>
              ) : null}
            </div>
          )}
        </div>
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
