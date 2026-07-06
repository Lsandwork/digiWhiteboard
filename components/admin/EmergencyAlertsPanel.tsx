"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Send, ShieldAlert, XCircle } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { canAccessPushNotices } from "@/lib/admin/users";
import type { StaffPushNotice } from "@/lib/staff/push-notices";

type PushNoticesPayload = {
  activeNotice: StaffPushNotice | null;
  notices: StaffPushNotice[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

const QUICK_ALERTS = [
  {
    title: "Emergency Yard Alert",
    message: "Stop all yard activity immediately and report to the front desk lead.",
    priority: "urgent" as const,
    display_mode: "urgent" as const
  },
  {
    title: "Weather Emergency",
    message: "Bring all dogs inside now. Follow the emergency weather protocol.",
    priority: "urgent" as const,
    display_mode: "urgent" as const
  },
  {
    title: "Facility Emergency",
    message: "Facility emergency in progress. Follow management instructions on the whiteboard.",
    priority: "urgent" as const,
    display_mode: "urgent" as const
  }
];

export function EmergencyAlertsPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<PushNoticesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [displayDurationMinutes, setDisplayDurationMinutes] = useState("10");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/push-notices", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load emergency alerts.");
      setData(body as PushNoticesPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load emergency alerts.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const canPush = useMemo(() => {
    if (!data) return false;
    return canAccessPushNotices(data.currentUser.role);
  }, [data]);

  const urgentNotices = useMemo(
    () => (data?.notices ?? []).filter((notice) => notice.priority === "urgent" || notice.display_mode === "urgent"),
    [data?.notices]
  );

  async function pushEmergency(payload: { title: string; message: string }) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_and_push",
          title: payload.title,
          message: payload.message,
          priority: "urgent",
          display_mode: "urgent",
          display_duration_minutes: Number(displayDurationMinutes) || 10
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to push emergency alert.");
      showToast("Emergency alert pushed.", "success");
      setTitle("");
      setMessage("");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to push emergency alert.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearActive() {
    if (!data?.activeNotice) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to clear emergency alert.");
      showToast("Emergency alert cleared.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to clear emergency alert.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crossover-dashboard space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Emergency Alerts</h2>
          <p className="admin-page-subtitle">
            Push urgent full-screen handler alerts to the Staff Digital Whiteboard. These take priority over grooming and standard notices.
          </p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {data?.activeNotice && (data.activeNotice.priority === "urgent" || data.activeNotice.display_mode === "urgent") ? (
        <section className="crossover-card crossover-card--conversations border-red-500/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-red-300">Active emergency</p>
              <h3 className="text-xl font-bold text-white">{data.activeNotice.title}</h3>
              <p className="text-sm text-admin-muted">{data.activeNotice.message}</p>
            </div>
            {canPush ? (
              <button type="button" className="crossover-btn crossover-btn--danger" disabled={busy} onClick={() => void clearActive()}>
                <XCircle className="h-4 w-4" />
                Clear Alert
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="crossover-card crossover-card--conversations p-5">
          <h3 className="crossover-card__title">Custom Emergency Alert</h3>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-admin-muted">Title</span>
              <input className="admin-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Emergency alert title" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-admin-muted">Message</span>
              <textarea className="admin-input min-h-[120px]" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Urgent instructions for staff." />
            </label>
            <label className="grid gap-2 md:max-w-xs">
              <span className="text-sm font-medium text-admin-muted">Display duration (minutes)</span>
              <input className="admin-input" value={displayDurationMinutes} onChange={(event) => setDisplayDurationMinutes(event.target.value)} />
            </label>
            <button
              type="button"
              className="crossover-btn crossover-btn--primary w-fit"
              disabled={!canPush || busy || !title.trim() || !message.trim()}
              onClick={() => void pushEmergency({ title: title.trim(), message: message.trim() })}
            >
              <Send className="h-4 w-4" />
              Push Emergency Alert
            </button>
          </div>
        </div>

        <aside className="crossover-card crossover-card--conversations p-5">
          <h3 className="crossover-card__title">Quick Emergency Alerts</h3>
          <div className="mt-4 space-y-3">
            {QUICK_ALERTS.map((alert) => (
              <button
                key={alert.title}
                type="button"
                className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-left transition hover:bg-red-500/15"
                disabled={!canPush || busy}
                onClick={() => void pushEmergency(alert)}
              >
                <div className="flex items-center gap-2 text-red-200">
                  <ShieldAlert className="h-4 w-4" />
                  <span className="font-semibold">{alert.title}</span>
                </div>
                <p className="mt-2 text-sm text-admin-muted">{alert.message}</p>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="crossover-card crossover-card--conversations p-5">
        <h3 className="crossover-card__title">Recent Emergency Alerts</h3>
        <div className="mt-4 space-y-3">
          {urgentNotices.length ? urgentNotices.slice(0, 12).map((notice) => (
            <article key={notice.id} className="rounded-xl border border-admin-border p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <p className="font-semibold text-white">{notice.title}</p>
              </div>
              <p className="mt-2 text-sm text-admin-muted">{notice.message}</p>
            </article>
          )) : (
            <p className="text-sm text-admin-muted">No emergency alerts have been pushed yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
