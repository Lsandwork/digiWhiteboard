"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CheckCheck, RefreshCw } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import { canReviewManagementSupport } from "@/lib/admin/users";
import type { StaffOpsState } from "@/lib/staff/admin-ops";
import type { ManagementReport } from "@/lib/staff/management-reports";
import type { NotificationDetailPayload } from "@/lib/staff/notification-detail";
import {
  countUnreadByCategory,
  enrichNotifications,
  filterNotificationsList,
  linkedEntityId,
  linkedEntityTable,
  type EnrichedNotification,
  type NotificationSidebarFilter,
  type NotificationTopFilter
} from "@/lib/staff/notification-hub";
import { notificationReaderKey } from "@/lib/staff/notifications";
import { NotificationResponseModal } from "@/components/admin/notifications/NotificationResponseModal";
import { NotificationSidebar, NotificationToolbar } from "@/components/admin/notifications/NotificationFilters";
import { NotificationTable } from "@/components/admin/notifications/NotificationTable";
import { NotificationsPageLayout } from "@/components/admin/notifications/NotificationsPageLayout";

type NotificationsPayload = StaffOpsState & {
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

type NotificationsPanelProps = {
  onOpenTab?: (tab: AdminTab) => void;
  personalOnly?: boolean;
};

async function fetchLinkedReports(ids: string[]): Promise<Map<string, ManagementReport>> {
  const map = new Map<string, ManagementReport>();
  const unique = [...new Set(ids)].slice(0, 40);
  await Promise.all(
    unique.map(async (id) => {
      try {
        const response = await fetch(`/api/admin/notifications?report_id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (body.report) map.set(id, body.report as ManagementReport);
      } catch {
        // skip inaccessible linked reports
      }
    })
  );
  return map;
}

export function NotificationsPanel({ onOpenTab, personalOnly = false }: NotificationsPanelProps) {
  const [data, setData] = useState<NotificationsPayload | null>(null);
  const [reportsById, setReportsById] = useState<Map<string, ManagementReport>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);
  const [modalDetail, setModalDetail] = useState<NotificationDetailPayload | null>(null);
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sidebar, setSidebar] = useState<NotificationSidebarFilter>("all");
  const [topFilter, setTopFilter] = useState<NotificationTopFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "priority">("newest");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const lastSelectedRowIndexRef = useRef<number | null>(null);

  const session = useMemo(
    () => ({
      email: data?.currentUser.email ?? null,
      adminUserId: data?.currentUser.adminUserId ?? null,
      role: data?.currentUser.role ?? null
    }),
    [data]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load notifications.");
      const payload = body as NotificationsPayload;
      setData(payload);

      const reportIds = (payload.notifications ?? [])
        .filter((n) => linkedEntityTable(n) === "management_reports")
        .map((n) => linkedEntityId(n));
      const reports = await fetchLinkedReports(reportIds);
      setReportsById(reports);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const enriched = useMemo(() => {
    if (!data) return [];
    return enrichNotifications(data, session, reportsById, { personalOnly });
  }, [data, session, reportsById, personalOnly]);

  const filtered = useMemo(
    () =>
      filterNotificationsList(enriched, {
        sidebar,
        top: topFilter,
        query,
        status: statusFilter === "all" ? "all" : (statusFilter as EnrichedNotification["displayStatus"]),
        assignedTo: assignedFilter || undefined,
        sort
      }),
    [enriched, sidebar, topFilter, query, statusFilter, assignedFilter, sort]
  );

  const unreadCount = useMemo(() => enriched.filter((item) => item.isUnread).length, [enriched]);
  const categoryCounts = useMemo(() => countUnreadByCategory(enriched), [enriched]);

  const staffNames = useMemo(
    () => (data?.staff_directory ?? []).filter((m) => m.status === "Active").map((m) => m.name),
    [data]
  );

  const canManage = canReviewManagementSupport(session.role);

  const pageRowIds = useMemo(() => filtered.map((item) => item.id), [filtered]);

  const toggleRowSelection = useCallback(
    (rowId: string, rowIndex: number, checked: boolean, shiftKey: boolean) => {
      setSelected((current) => {
        if (shiftKey && lastSelectedRowIndexRef.current !== null) {
          const anchor = lastSelectedRowIndexRef.current;
          const start = Math.min(anchor, rowIndex);
          const end = Math.max(anchor, rowIndex);
          const rangeIds = pageRowIds.slice(start, end + 1);
          return [...new Set([...current, ...rangeIds])];
        }
        lastSelectedRowIndexRef.current = rowIndex;
        return checked ? [...new Set([...current, rowId])] : current.filter((id) => id !== rowId);
      });
    },
    [pageRowIds]
  );

  const toggleSelectAllOnPage = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelected((current) => current.filter((id) => !pageRowIds.includes(id)));
        return;
      }
      setSelected((current) => [...new Set([...current, ...pageRowIds])]);
    },
    [pageRowIds]
  );

  useEffect(() => {
    setSelected((current) => current.filter((id) => pageRowIds.includes(id)));
  }, [pageRowIds]);

  const loadModalDetail = useCallback(async (notificationId: string, markRead = true) => {
    setModalLoading(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      if (markRead) {
        const readRes = await fetch(`/api/admin/notifications/${encodeURIComponent(notificationId)}`, { method: "POST" });
        if (readRes.ok) {
          setData((prev) => {
            if (!prev) return prev;
            const readerKey = notificationReaderKey(prev.currentUser.email, prev.currentUser.adminUserId);
            return {
              ...prev,
              notifications: prev.notifications.map((item) =>
                item.id === notificationId && !item.read_by.includes(readerKey)
                  ? { ...item, read_by: [...item.read_by, readerKey] }
                  : item
              )
            };
          });
        }
      }
      const response = await fetch(`/api/admin/notifications/${encodeURIComponent(notificationId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "This notification could not be loaded.");
      setModalDetail(body as NotificationDetailPayload);
      if (body.report) {
        setReportsById((prev) => new Map(prev).set(body.report.id, body.report));
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "This notification could not be loaded.");
      setModalDetail(null);
    } finally {
      setModalLoading(false);
    }
  }, []);

  async function handleOpen(notification: EnrichedNotification) {
    setActiveNotificationId(notification.id);
    setReplyText("");
    setModalOpen(true);
    await loadModalDetail(notification.id);
  }

  function handleCloseModal() {
    if (busy) return;
    setModalOpen(false);
    setActiveNotificationId(null);
    setModalDetail(null);
    setModalError(null);
    setModalSuccess(null);
    setReplyText("");
  }

  async function handleMarkAllRead() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/staff-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_all_notifications_read" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to mark all read.");
      setSelected([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark all read.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkSelectedRead() {
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        selected.map(async (notificationId) => {
          const response = await fetch("/api/admin/staff-operations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "mark_notification_read", notification_id: notificationId })
          });
          if (!response.ok) {
            const body = await response.json();
            throw new Error(body.error ?? "Unable to mark notification read.");
          }
        })
      );
      setSelected([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark selected notifications read.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReply(options: { internalNote: boolean; markResolved: boolean }) {
    if (!activeNotificationId) return;
    const message = replyText.trim();
    if (!message) return;
    setBusy(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      const response = await fetch(`/api/admin/notifications/${encodeURIComponent(activeNotificationId)}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, internal_note: options.internalNote, mark_resolved: options.markResolved })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Response didn't send. Try again.");
      setReplyText("");
      setModalSuccess(body.message ?? "Response sent.");
      if (body.detail) setModalDetail(body.detail as NotificationDetailPayload);
      await load();
      if (activeNotificationId) await loadModalDetail(activeNotificationId, false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Response didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function patchModal(payload: Record<string, unknown>) {
    if (!activeNotificationId) return;
    setBusy(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      const response = await fetch(`/api/admin/notifications/${encodeURIComponent(activeNotificationId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update.");
      if (body.detail) setModalDetail(body.detail as NotificationDetailPayload);
      setModalSuccess("Updated.");
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Unable to update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NotificationsPageLayout
        header={
          <header className="notif-hub-header crossover-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-[var(--crossover-gold)]" aria-hidden />
                  <h2 className="crossover-dashboard__page-title">Notifications</h2>
                  {unreadCount > 0 ? <span className="crossover-badge crossover-badge--urgent">{unreadCount} unread</span> : null}
                </div>
                <p className="crossover-dashboard__page-subtitle max-w-2xl">
                  Click <strong>Open</strong> on any notification to view the full submission and respond in a wide response window.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy || unreadCount === 0} onClick={() => void handleMarkAllRead()}>
                  <CheckCheck className="mr-2 inline h-4 w-4" />
                  Mark all read
                </button>
                <button type="button" className="crossover-btn crossover-btn--outline" disabled={loading} onClick={() => void load()}>
                  <RefreshCw className="mr-2 inline h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>
            {error ? <p className="admin-error mt-3">{error}</p> : null}
          </header>
        }
        sidebar={
          <NotificationSidebar
            sidebar={sidebar}
            counts={categoryCounts}
            mobileOpen={mobileFiltersOpen}
            onSidebarChange={setSidebar}
            onMobileToggle={() => setMobileFiltersOpen((open) => !open)}
          />
        }
        toolbar={
          <NotificationToolbar
            top={topFilter}
            query={query}
            sort={sort}
            statusFilter={statusFilter}
            assignedFilter={assignedFilter}
            showAssignedFilter={canManage}
            staffNames={staffNames}
            onTopChange={setTopFilter}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onStatusFilterChange={setStatusFilter}
            onAssignedFilterChange={setAssignedFilter}
            onMobileToggle={() => setMobileFiltersOpen((open) => !open)}
          />
        }
        list={
          loading ? (
            <div className="notif-hub-list__empty">
              <p className="notif-hub-list__empty-text">Loading notifications…</p>
            </div>
          ) : (
            <>
              {filtered.length > 0 ? (
                <div className="admin-ledger-bulk-bar sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 p-3">
                  <span className="text-sm admin-text-emphasis">
                    {selected.length > 0
                      ? `${selected.length} selected`
                      : "Select rows · Shift+click a second row to select the range"}
                  </span>
                  <button
                    type="button"
                    className="crossover-btn crossover-btn--ghost"
                    disabled={busy || selected.length === 0}
                    onClick={() => void handleMarkSelectedRead()}
                  >
                    Mark selected read
                  </button>
                  {selected.length > 0 ? (
                    <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setSelected([])}>
                      Clear selection
                    </button>
                  ) : null}
                </div>
              ) : null}
              <NotificationTable
                items={filtered}
                selected={selected}
                onToggleRow={toggleRowSelection}
                onToggleAll={toggleSelectAllOnPage}
                onOpen={(item) => void handleOpen(item)}
              />
            </>
          )
        }
      />

      <NotificationResponseModal
        open={modalOpen}
        loading={modalLoading}
        busy={busy}
        error={modalError}
        success={modalSuccess}
        detail={modalDetail}
        replyText={replyText}
        staffNames={staffNames}
        onClose={handleCloseModal}
        onReplyTextChange={setReplyText}
        onSendReply={(options) => void handleSendReply(options)}
        onStatusChange={(status) => void patchModal({ status })}
        onAssign={(name) => void patchModal({ assigned_to: name })}
        onSupportAction={(action) => void patchModal({ support_action: action })}
        onOpenTab={(tab) => {
          handleCloseModal();
          onOpenTab?.(tab);
        }}
      />
    </>
  );
}
