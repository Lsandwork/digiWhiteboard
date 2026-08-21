"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, BellRing, CheckCircle2, ChevronRight, X } from "lucide-react";
import { ADMIN_TABS, type AdminTab } from "@/lib/admin/types";
import { playStaffPushNoticeAlarm, unlockStaffPushNoticeAudio } from "@/lib/staff/push-notice-alarm";
import { startVisibilityAwareInterval } from "@/lib/visibility-poll";
import { useToast } from "@/components/admin/ui/ToastProvider";

type BellWalkAlert = {
  id: string;
  title: string;
  message: string;
  hourLabel: string;
  urgency: "alarm_due" | "overdue" | "due_soon";
  countdown: string;
  dueAt: string;
  version: number;
  checklist: string[];
};

type BellNotificationItem = {
  id: string;
  title: string;
  body: string | null;
  priority: string;
  sourceTab: string;
  sourceId: string;
  createdAt: string;
  isWalkAlert: boolean;
};

function tabForBellItem(item: BellNotificationItem): AdminTab {
  if (item.isWalkAlert) return "walks_board";
  if ((ADMIN_TABS as string[]).includes(item.sourceTab)) return item.sourceTab as AdminTab;
  return "notifications";
}

type BellPayload = {
  unreadCount: number;
  walkAlertCount: number;
  walkDueCount: number;
  walkOverdueCount: number;
  badgeCount: number;
  hasUrgent: boolean;
  recent: BellNotificationItem[];
  walkAlerts: BellWalkAlert[];
};

type NotificationBellProps = {
  onOpenTab: (tab: AdminTab) => void;
};

const POLL_MS = 20_000;

export function NotificationBell({ onOpenTab }: NotificationBellProps) {
  const { showToast } = useToast();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BellPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const lastWalkSignatureRef = useRef<string>("");
  const audioUnlockedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/notification-bell", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as BellPayload;
      setData(body);

      const signature = body.walkAlerts
        .map((alert) => `${alert.id}:${alert.urgency}:${alert.dueAt}`)
        .sort()
        .join("|");
      if (signature && signature !== lastWalkSignatureRef.current) {
        const isFirstLoad = lastWalkSignatureRef.current === "";
        lastWalkSignatureRef.current = signature;
        if (!isFirstLoad && body.walkAlertCount > 0) {
          void playStaffPushNoticeAlarm();
        }
      } else if (!signature) {
        lastWalkSignatureRef.current = "";
      }
    } catch {
      // Keep last good state.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const stop = startVisibilityAwareInterval(() => void load(), POLL_MS);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function unlockAudioOnce() {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    await unlockStaffPushNoticeAudio();
  }

  async function clearInbox() {
    if (clearing) return;
    setClearing(true);
    try {
      const response = await fetch("/api/admin/notification-bell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear_inbox" })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to clear inbox.");
      showToast("Inbox cleared. Assigned alerts stay open.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to clear inbox.", "error");
    } finally {
      setClearing(false);
    }
  }

  async function markWalkComplete(alert: BellWalkAlert) {
    setBusyId(alert.id);
    try {
      await unlockAudioOnce();
      const response = await fetch("/api/admin/walks-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", cycleId: alert.id, version: alert.version })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Walks Board action failed.");
      showToast("Walk check marked complete.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to complete walk check.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const badgeCount = data?.badgeCount ?? 0;
  const hasUrgent = Boolean(data?.hasUrgent);
  const walkAlerts = data?.walkAlerts ?? [];
  const recent = data?.recent ?? [];
  const BellIcon = hasUrgent ? BellRing : Bell;

  return (
    <div className="admin-notification-bell" ref={rootRef}>
      <button
        type="button"
        className={`admin-notification-bell__button ${hasUrgent ? "admin-notification-bell__button--urgent" : ""} ${
          badgeCount > 0 ? "admin-notification-bell__button--active" : ""
        }`}
        aria-label={
          badgeCount > 0
            ? `${badgeCount} notification${badgeCount === 1 ? "" : "s"}${hasUrgent ? ", including walk alerts" : ""}`
            : "Notifications"
        }
        aria-expanded={open}
        aria-controls={panelId}
        title={hasUrgent ? "Walk check alarm needs attention" : "Notifications"}
        onClick={() => {
          void unlockAudioOnce();
          setOpen((current) => !current);
          void load();
        }}
      >
        <BellIcon className="admin-notification-bell__icon" aria-hidden />
        {badgeCount > 0 ? (
          <span className={`admin-notification-bell__badge ${hasUrgent ? "admin-notification-bell__badge--urgent" : ""}`}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
        {hasUrgent ? <span className="admin-notification-bell__pulse" aria-hidden /> : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="admin-notification-bell__backdrop"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div id={panelId} className="admin-notification-bell__panel" role="dialog" aria-modal="true" aria-label="Notifications">
            <div className="admin-notification-bell__panel-head">
              <div>
                <p className="admin-notification-bell__kicker">Alerts</p>
                <h2 className="admin-notification-bell__title">Notifications</h2>
              </div>
              <button
                type="button"
                className="admin-notification-bell__close"
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {walkAlerts.length > 0 ? (
              <section className="admin-notification-bell__section">
                <div className="admin-notification-bell__section-head">
                  <h3>Walks Board alarm</h3>
                  <span className="admin-notification-bell__chip admin-notification-bell__chip--urgent">
                    Cannot snooze
                  </span>
                </div>
                <ul className="admin-notification-bell__list">
                  {walkAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className={`admin-notification-bell__walk-item admin-notification-bell__walk-item--${
                        alert.urgency === "overdue" ? "overdue" : "walk_due"
                      }`}
                    >
                      <div className="admin-notification-bell__walk-copy">
                        <p className="admin-notification-bell__walk-name">
                          {alert.title} · {alert.hourLabel}
                        </p>
                        <p className="admin-notification-bell__walk-meta">{alert.countdown}</p>
                        <p className="admin-notification-bell__walk-meta">{alert.message}</p>
                      </div>
                      <div className="admin-notification-bell__walk-actions">
                        <button
                          type="button"
                          className="crossover-btn crossover-btn--primary"
                          disabled={Boolean(busyId)}
                          onClick={() => void markWalkComplete(alert)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {busyId === alert.id ? "Saving…" : "Complete"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="admin-notification-bell__link"
                  onClick={() => {
                    setOpen(false);
                    onOpenTab("walks_board");
                  }}
                >
                  Open Walks Board
                </button>
              </section>
            ) : null}

            <section className="admin-notification-bell__section">
              <div className="admin-notification-bell__section-head">
                <h3>Inbox</h3>
                <div className="admin-notification-bell__section-actions">
                  {data?.unreadCount ? (
                    <span className="admin-notification-bell__chip">{data.unreadCount} unread</span>
                  ) : null}
                  <button
                    type="button"
                    className="admin-notification-bell__clear"
                    disabled={clearing || !data?.unreadCount}
                    title="Clear inbox notifications. Alerts assigned to you stay open."
                    onClick={() => void clearInbox()}
                  >
                    {clearing ? "Clearing…" : "Clear"}
                  </button>
                </div>
              </div>
              {recent.length === 0 ? (
                <p className="admin-notification-bell__empty">
                  {walkAlerts.length > 0 ? "No other unread notifications." : "You're all caught up."}
                </p>
              ) : (
                <ul className="admin-notification-bell__list">
                  {recent.map((item) => {
                    const destination = tabForBellItem(item);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`admin-notification-bell__item ${item.isWalkAlert ? "is-walk" : ""}`}
                          onClick={() => {
                            setOpen(false);
                            onOpenTab(destination);
                          }}
                        >
                          <p className="admin-notification-bell__item-title">{item.title}</p>
                          {item.body ? <p className="admin-notification-bell__item-body">{item.body}</p> : null}
                          <span className="admin-notification-bell__item-hint">
                            View details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                className="admin-notification-bell__link"
                onClick={() => {
                  setOpen(false);
                  onOpenTab("notifications");
                }}
              >
                View all notifications
              </button>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
