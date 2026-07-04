"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CheckCheck, ExternalLink } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import {
  filterNotificationsForUser,
  notificationReaderKey,
  type StaffNotification
} from "@/lib/staff/notifications";
import type { StaffOpsState } from "@/lib/staff/admin-ops";

type NotificationsPayload = StaffOpsState & {
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

type NotificationsPanelProps = {
  onOpenTab?: (tab: AdminTab) => void;
};

function priorityClass(priority: StaffNotification["priority"]) {
  if (priority === "Critical" || priority === "High") return "admin-notif-priority--urgent";
  if (priority === "Medium") return "admin-notif-priority--medium";
  return "admin-notif-priority--low";
}

function targetLabel(notification: StaffNotification) {
  switch (notification.target.kind) {
    case "staff_name":
      return `Assigned to ${notification.target.name}`;
    case "staff_email":
      return `For ${notification.target.email}`;
    case "coordinator_pool":
      return "Coordinators & Team Lead";
    case "admin_pool":
      return "Admin alert";
    default:
      return "Notification";
  }
}

function typeLabel(type: StaffNotification["type"]) {
  switch (type) {
    case "assignment":
      return "Assignment";
    case "mention":
      return "Mention";
    case "reply":
      return "Reply";
    case "escalation":
      return "Escalation";
    case "auto_issue":
      return "Auto issue";
    default:
      return "Update";
  }
}

export function NotificationsPanel({ onOpenTab }: NotificationsPanelProps) {
  const [data, setData] = useState<NotificationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load notifications.");
      setData(body as NotificationsPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const readerKey = notificationReaderKey(data?.currentUser.email, data?.currentUser.adminUserId);

  const visible = useMemo(() => {
    if (!data) return [];
    const items = filterNotificationsForUser(data, data.currentUser);
    if (filter === "unread") {
      return items.filter((notification) => !notification.read_by.includes(readerKey));
    }
    return items;
  }, [data, filter, readerKey]);

  const unreadCount = useMemo(() => {
    if (!data) return 0;
    return filterNotificationsForUser(data, data.currentUser).filter((notification) => !notification.read_by.includes(readerKey)).length;
  }, [data, readerKey]);

  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/staff-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update notifications.");
      await load();
      return true;
    } catch (mutateError) {
      setError(mutateError instanceof Error ? mutateError.message : "Unable to update notifications.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openNotification(notification: StaffNotification) {
    await mutate("mark_notification_read", { notification_id: notification.id });
    if (onOpenTab && notification.source_tab !== "notifications") {
      onOpenTab(notification.source_tab);
    }
  }

  return (
    <div className="space-y-5">
      <header className="admin-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BellRing className="h-5 w-5 text-fitdog-orange" aria-hidden />
              <h2 className="admin-page-title">Notifications</h2>
              {unreadCount > 0 ? <span className="admin-notif-badge">{unreadCount} unread</span> : null}
            </div>
            <p className="admin-page-subtitle max-w-2xl">
              Alerts for crossover updates, assignments, @mentions, and urgent escalations. Front Desk Coordinators and Team Lead staff see all staff updates; High and Urgent items also alert Admins.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`admin-help-category ${filter === "all" ? "admin-help-category--active" : ""}`} onClick={() => setFilter("all")}>
              All
            </button>
            <button type="button" className={`admin-help-category ${filter === "unread" ? "admin-help-category--active" : ""}`} onClick={() => setFilter("unread")}>
              Unread
            </button>
            <button type="button" className="admin-btn-secondary" disabled={busy || unreadCount === 0} onClick={() => void mutate("mark_all_notifications_read")}>
              <CheckCheck className="mr-2 inline h-4 w-4" />
              Mark all read
            </button>
            <button type="button" className="admin-btn-secondary" disabled={loading} onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      {loading ? (
        <section className="admin-card p-5 text-admin-muted">Loading notifications…</section>
      ) : visible.length === 0 ? (
        <section className="admin-empty-state">
          <p className="admin-empty-state-title">No notifications</p>
          <p className="admin-empty-state-text">
            {filter === "unread" ? "You are all caught up." : "New crossover, follow-up, and issue activity will appear here."}
          </p>
        </section>
      ) : (
        <div className="admin-notif-list space-y-3">
          {visible.map((notification) => {
            const unread = !notification.read_by.includes(readerKey);
            return (
              <article
                key={notification.id}
                className={`admin-notif-card ${unread ? "admin-notif-card--unread" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`admin-notif-priority ${priorityClass(notification.priority)}`}>{notification.priority}</span>
                      <span className="admin-notif-type">{typeLabel(notification.type)}</span>
                      <span className="text-xs text-admin-muted">{targetLabel(notification)}</span>
                      {unread ? <span className="admin-notif-dot" aria-label="Unread" /> : null}
                    </div>
                    <h3 className="font-bold text-white">{notification.title}</h3>
                    {notification.body ? <p className="mt-1 text-sm text-admin-muted">{notification.body}</p> : null}
                    <p className="mt-2 text-xs text-admin-muted">
                      {new Date(notification.created_at).toLocaleString()}
                      {notification.created_by ? ` • from ${notification.created_by}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-btn-secondary inline-flex items-center gap-2"
                    disabled={busy}
                    onClick={() => void openNotification(notification)}
                  >
                    Open
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="admin-card p-5">
        <h3 className="admin-section-title">How tagging works</h3>
        <p className="admin-section-helper">
          Assign someone with the Assigned To field, or type <strong>@Name</strong> in a message (for example <strong>@Brian</strong>) to notify that staff member. Use priority Low through Critical — High and Urgent items also notify Admins automatically.
        </p>
      </section>
    </div>
  );
}
