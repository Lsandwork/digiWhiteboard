"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/ui/ToastProvider";

export function MarketingNotificationsPanel() {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/marketing/notifications", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Unable to load notifications.", "error");
    else setNotifications(body.notifications ?? []);
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function markAllRead() {
    await fetch("/api/marketing/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" })
    });
    await load();
  }

  return (
    <div className="marketing-card">
      <div className="marketing-card__header">
        <h2 className="marketing-card__title">Marketing Notifications</h2>
        <button type="button" className="marketing-btn marketing-btn--secondary" onClick={() => void markAllRead()}>Mark all read</button>
      </div>
      <div className="space-y-3">
        {notifications.map((note) => (
          <article key={String(note.id)} className={`rounded-xl border p-3 ${note.is_read ? "opacity-70" : ""}`}>
            <strong>{String(note.title)}</strong>
            <p className="text-sm text-slate-600">{String(note.body ?? "")}</p>
            {note.link_path ? <Link href={String(note.link_path)} className="text-sm text-violet-700">Open</Link> : null}
          </article>
        ))}
        {!notifications.length ? <div className="marketing-empty">No notifications.</div> : null}
      </div>
    </div>
  );
}
