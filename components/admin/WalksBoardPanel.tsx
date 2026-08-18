"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Circle,
  Clock3,
  Moon
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { playStaffPushNoticeAlarm, unlockStaffPushNoticeAudio } from "@/lib/staff/push-notice-alarm";
import { WALK_BOARD_ALARM_HOURS } from "@/lib/walks-board/constants";
import {
  formatWalkBoardClock,
  formatWalkBoardCountdown,
  formatWalkBoardDateTime,
  getWalkBoardUrgency
} from "@/lib/walks-board/display";
import { formatWalkBoardHourLabel, walkBoardClockParts, walkBoardSlotKey } from "@/lib/walks-board/schedule";
import type {
  WalkBoardCycleView,
  WalkBoardPermissions,
  WalkBoardPublicState,
  WalkBoardSummary
} from "@/lib/walks-board/types";

function displayUserName(user: { display_name?: string | null; email?: string | null } | null | undefined) {
  return user?.display_name ?? user?.email ?? "Staff";
}

function urgencyClass(urgency: ReturnType<typeof getWalkBoardUrgency>) {
  switch (urgency) {
    case "overdue":
      return "walks-board-card--overdue";
    case "alarm_due":
      return "walks-board-card--due";
    case "due_soon":
      return "walks-board-card--soon";
    case "completed":
      return "walks-board-card--complete";
    default:
      return "walks-board-card--on-track";
  }
}

function pacificClockLabel(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(new Date(iso));
}

export function WalksBoardPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<WalkBoardPublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hasLoaded, setHasLoaded] = useState(false);
  const lastAlertSignatureRef = useRef<string>("");

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoading(!hasLoaded);
      try {
        const response = await fetch("/api/admin/walks-board", { cache: "no-store" });
        const body = (await response.json()) as WalkBoardPublicState & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load Walks Board.");
        setData(body);
        setHasLoaded(true);
        setReconnecting(false);
      } catch (error) {
        if (!hasLoaded) {
          showToast(error instanceof Error ? error.message : "Unable to load Walks Board.", "error");
        } else {
          setReconnecting(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [hasLoaded, showToast]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unlock = () => {
      void unlockStaffPushNoticeAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const cycle = data?.currentCycle;
    if (!cycle || cycle.status !== "pending") {
      lastAlertSignatureRef.current = "";
      return;
    }
    const urgency = getWalkBoardUrgency(cycle, nowMs);
    if (urgency !== "alarm_due" && urgency !== "overdue" && urgency !== "due_soon") return;
    const signature = `${cycle.id}:${urgency}:${cycle.due_at}`;
    if (signature === lastAlertSignatureRef.current) return;
    const isFirst = lastAlertSignatureRef.current === "";
    lastAlertSignatureRef.current = signature;
    if (!isFirst) void playStaffPushNoticeAlarm();
  }, [data?.currentCycle, nowMs]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`walk-board-cycles-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "walk_board_cycles" }, () => {
        void load({ silent: true });
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") setReconnecting(true);
        if (status === "SUBSCRIBED") setReconnecting(false);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  async function handleComplete(cycle: WalkBoardCycleView) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/walks-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", cycleId: cycle.id, version: cycle.version })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to mark complete.");
      showToast("Walk check marked complete. Thank you.", "success");
      await load({ silent: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to mark complete.", "error");
    } finally {
      setBusy(false);
    }
  }

  const summary: WalkBoardSummary | undefined = data?.summary;
  const permissions: WalkBoardPermissions | undefined = data?.permissions;
  const timezone = data?.timezone ?? "America/Los_Angeles";
  const cycle = data?.currentCycle ?? null;
  const urgency = cycle ? getWalkBoardUrgency(cycle, nowMs) : data?.operatingWindow ? "upcoming" : "closed";
  const alarmActive = cycle?.status === "pending";
  const parts = walkBoardClockParts(new Date(nowMs), timezone);
  const dateKey = cycle?.shift_date ?? data?.todayCycles[0]?.shift_date ?? parts.dateKey;

  const slots = useMemo(() => {
    return WALK_BOARD_ALARM_HOURS.map((hour) => {
      const slotKey = walkBoardSlotKey(dateKey, hour);
      const row = data?.todayCycles.find((item) => item.slot_key === slotKey) ?? null;
      let state: "completed" | "missed" | "current" | "upcoming" | "idle" = "upcoming";
      if (row?.status === "completed") state = "completed";
      else if (row?.status === "missed") state = "missed";
      else if (row?.status === "pending") state = "current";
      else if (data?.operatingWindow && hour < parts.hour) state = "missed";
      else if (!data?.operatingWindow && hour < 8) state = "idle";
      else if (hour === data?.currentCycle?.scheduled_hour) state = "current";
      return { hour, slotKey, label: formatWalkBoardHourLabel(hour), row, state };
    });
  }, [data?.currentCycle?.scheduled_hour, data?.operatingWindow, data?.todayCycles, dateKey, parts.hour]);

  return (
    <section className="walks-board-page">
      {alarmActive ? (
        <div className="walks-board-alert-banner" role="alert" aria-live="assertive">
          <div className="walks-board-alert-banner__icon" aria-hidden="true">
            <AlarmClock className="h-6 w-6" />
          </div>
          <div className="walks-board-alert-banner__copy">
            <p className="walks-board-alert-banner__title">{data?.title ?? "Physical Whiteboard Walk Check"}</p>
            <p className="walks-board-alert-banner__detail">
              {cycle ? formatWalkBoardCountdown(cycle, nowMs) : "Alarm due"} · This alarm cannot be snoozed. Mark
              complete after the physical board is updated.
            </p>
          </div>
        </div>
      ) : null}

      <header className="walks-board-header admin-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="walks-board-header__icon" aria-hidden="true">
              <AlarmClock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black admin-text-emphasis sm:text-3xl">Walks Board</h1>
              <p className="mt-1 max-w-2xl text-sm text-admin-muted sm:text-base">
                Alarm-clock reminder to update the No Plays, Grooming, and Walks Board physical whiteboard — not the
                digital board. Every 2 hours, 8:00 AM–7:00 PM Pacific, 7 days a week.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {reconnecting ? <span className="admin-badge admin-badge--amber">Reconnecting…</span> : null}
            <div className="walks-board-live-clock" aria-live="polite">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <span>{pacificClockLabel(new Date(nowMs).toISOString(), timezone)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`walks-board-stat ${alarmActive ? "walks-board-stat--alert" : ""}`}>
            <span className="walks-board-stat__label">Current Alarm</span>
            <strong>
              {cycle ? formatWalkBoardHourLabel(cycle.scheduled_hour) : data?.operatingWindow ? "—" : "Closed"}
            </strong>
          </div>
          <div className={`walks-board-stat ${(summary?.overdueCount ?? 0) > 0 ? "walks-board-stat--overdue" : ""}`}>
            <span className="walks-board-stat__label">Open Checks</span>
            <strong>{summary?.pendingCount ?? 0}</strong>
          </div>
          <div className="walks-board-stat">
            <span className="walks-board-stat__label">Completed Today</span>
            <strong>{summary?.completedCount ?? 0}</strong>
          </div>
          <div className="walks-board-stat">
            <span className="walks-board-stat__label">Next Alarm</span>
            <strong>{data?.nextAlarmAt ? formatWalkBoardClock(data.nextAlarmAt, timezone) : "—"}</strong>
          </div>
        </div>
      </header>

      {loading && !hasLoaded ? (
        <div className="admin-card p-8 text-center text-slate-400">Loading Walks Board…</div>
      ) : (
        <article className={`walks-board-card admin-card ${urgencyClass(urgency)}`}>
          <div className="walks-board-card__grid">
            <div className="walks-board-card__main">
              {data?.operatingWindow ? (
                <>
                  <p className={`walks-board-card__status walks-board-card__status--${urgency}`}>
                    {(urgency === "alarm_due" || urgency === "overdue") && (
                      <AlertTriangle className="walks-board-card__alert-icon" aria-hidden="true" />
                    )}
                    {cycle ? formatWalkBoardCountdown(cycle, nowMs) : "Waiting for this cycle"}
                  </p>
                  <h2 className="walks-board-card__name">{data.title}</h2>
                  <p className="walks-board-card__meta">{data.message}</p>
                  {cycle?.status === "completed" ? (
                    <p className="walks-board-card__meta">
                      Completed {cycle.completed_at ? formatWalkBoardDateTime(cycle.completed_at, timezone) : ""}
                      {cycle.completed_by_user ? ` by ${displayUserName(cycle.completed_by_user)}` : ""}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="walks-board-closed">
                    <Moon className="h-8 w-8" aria-hidden="true" />
                    <h2 className="walks-board-card__name">Alarms resume at 8:00 AM</h2>
                    <p className="walks-board-card__meta">
                      Next check {data?.nextAlarmAt ? formatWalkBoardDateTime(data.nextAlarmAt, timezone) : "tomorrow at 8:00 AM"} Pacific.
                    </p>
                  </div>
                </>
              )}

              <ul className="walks-board-checklist">
                {(data?.checklist ?? []).map((item) => (
                  <li key={item}>
                    {cycle?.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Circle className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="walks-board-no-snooze">This alarm cannot be snoozed. Mark complete after the physical board is updated.</p>
            </div>

            <div className="walks-board-card__actions">
              {alarmActive && permissions?.canComplete ? (
                <button
                  type="button"
                  className="crossover-btn crossover-btn--primary"
                  disabled={busy}
                  onClick={() => cycle && void handleComplete(cycle)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {busy ? "Saving…" : "Mark Complete"}
                </button>
              ) : null}
              <a className="crossover-btn crossover-btn--outline" href="/admin?board=staff&tab=bulk_photo_upload">
                <Camera className="h-4 w-4" />
                Upload pictures
              </a>
            </div>
          </div>
        </article>
      )}

      <section className="walks-board-slots admin-card p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-black admin-text-emphasis">Today’s 2-hour checks</h2>
          <p className="mt-1 text-sm text-admin-muted">8:00 AM through 6:00 PM Pacific. Window closes at 7:00 PM.</p>
        </div>
        <ol className="walks-board-slot-grid">
          {slots.map((slot) => (
            <li key={slot.slotKey} className={`walks-board-slot walks-board-slot--${slot.state}`}>
              <strong>{slot.label}</strong>
              <span>
                {slot.state === "completed"
                  ? "Complete"
                  : slot.state === "missed"
                    ? "Missed"
                    : slot.state === "current"
                      ? "Due now"
                      : "Scheduled"}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
