"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { StatusCards } from "@/components/admin/StatusCards";
import { BoardSettings } from "@/components/admin/BoardSettings";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { PromotionsManager } from "@/components/admin/PromotionsManager";
import { ClassScheduleEditor } from "@/components/admin/ClassScheduleEditor";
import { LivePreviewPanel } from "@/components/admin/LivePreviewPanel";
import { PublishPanel } from "@/components/admin/PublishPanel";
import { SystemInfoPanel } from "@/components/admin/SystemInfoPanel";
import { AdminLogsPanel } from "@/components/admin/AdminLogsPanel";
import { AdminSettingsPage } from "@/components/admin/AdminSettingsPage";
import { AdminUsersPage } from "@/components/admin/AdminUsersPage";
import { PushNoticesPanel } from "@/components/admin/PushNoticesPanel";
import { StaffOperationsPanel } from "@/components/admin/StaffOperationsPanel";
import { StaffDirectoryPanel } from "@/components/admin/StaffDirectoryPanel";
import { IntegrationsPanel } from "@/components/admin/IntegrationsPanel";
import { AdminHelpCenter } from "@/components/admin/AdminHelpCenter";
import { PreviewModal } from "@/components/admin/PreviewModal";
import { ChangeHistoryModal } from "@/components/admin/ChangeHistoryModal";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/admin/settings";
import type { AdminBoardType, AdminTab, DashboardPayload } from "@/lib/admin/types";
import { parseAdminTab } from "@/lib/admin/types";
import { isStaffOpsLimitedRole, isFullAdminRole, type AdminUserRole } from "@/lib/admin/users";
import type { StaffBoardSettings } from "@/lib/admin/types";

const defaultStaff: StaffBoardSettings = {
  refresh_interval_ms: 2000,
  team_reminder: "",
  important_notice: "",
  show_team_reminders: true,
  footer_message: null,
  published_version: "v1.0.0",
  published_at: null,
  published_by: null
};

export function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmResetBoard, setConfirmResetBoard] = useState(false);

  const board = (searchParams.get("board") === "staff" ? "staff" : "lobby") as AdminBoardType;
  const tab = parseAdminTab(searchParams.get("tab"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("fitdog_admin_board");
    if (!searchParams.get("board") && stored === "staff") {
      router.replace("/admin?board=staff");
    }
  }, [router, searchParams]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    else setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/dashboard?board=${board}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load admin dashboard.");
      setData(body as DashboardPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load admin dashboard.");
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, [board]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const initial = window.setTimeout(() => setCurrentTimeMs(Date.now()), 0);
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const role = data?.session?.role;
    const coordinatorTabs: AdminTab[] = ["push_notices", "crossover_communication", "owner_follow_up", "active_issues", "whiteboard_preview", "analytics", "templates", "help"];
    if (isStaffOpsLimitedRole(role) && (board !== "staff" || !coordinatorTabs.includes(tab))) {
      router.replace("/admin?board=staff&tab=push_notices");
    }
    if (!isFullAdminRole(role) && tab === "staff_directory") {
      router.replace(isStaffOpsLimitedRole(role) ? "/admin?board=staff&tab=push_notices" : "/admin?tab=help");
    }
  }, [board, data?.session?.role, router, tab]);

  useEffect(() => {
    if (board === "staff" && tab === "users") {
      router.replace("/admin?tab=users");
    }
  }, [board, router, tab]);

  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return "All changes saved";
    const seconds = Math.max(1, Math.round(((currentTimeMs || lastSavedAt.getTime()) - lastSavedAt.getTime()) / 1000));
    return `All changes saved • Last saved ${seconds}s ago`;
  }, [currentTimeMs, lastSavedAt]);

  function setBoard(nextBoard: AdminBoardType) {
    if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", nextBoard);
    router.replace(`/admin?board=${nextBoard}&tab=${tab}`);
  }

  function setActiveTab(nextTab: AdminTab) {
    if (board === "staff" && nextTab === "users") {
      router.replace("/admin?tab=users");
      return;
    }
    router.replace(`/admin?board=${board}&tab=${nextTab}`);
  }

  async function saveBoardSettings(patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/board-settings?board=${board}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to save settings.");
    setLastSavedAt(new Date());
    showToast("Settings saved.", "success");
    await load(true);
  }

  async function resetSettings() {
    const response = await fetch(`/api/admin/board-settings?board=${board}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Unable to reset settings.");
    showToast("Settings reset to defaults.", "success");
    await load(true);
  }

  async function publishChanges() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ board })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Publish failed.");
      showToast(`Publish successful — ${body.version}`, "success");
      await load(true);
    } catch (publishError) {
      showToast(publishError instanceof Error ? publishError.message : "Publish failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDashboard() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/refresh", { method: "POST" });
      if (!response.ok) throw new Error("Refresh failed.");
      await load(true);
      showToast("Refresh complete.", "success");
    } catch {
      showToast("Refresh failed.", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function openBoard() {
    const url = board === "staff" ? "/" : "/lobby/checkouts";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!data) {
    return (
      <main className="admin-theme grid min-h-screen place-items-center p-6 text-white">
        {error ? <p className="admin-error">{error}</p> : <p>Loading admin dashboard…</p>}
      </main>
    );
  }

  const lobbySettings = data.lobby_settings;
  const staffSettings = data.staff_settings ?? defaultStaff;
  const adminSettings = data.admin_settings ?? DEFAULT_ADMIN_SETTINGS;
  const schedule = lobbySettings.class_schedule ?? LOBBY_CLASS_SCHEDULE;
  const publishMeta = board === "staff" ? staffSettings : lobbySettings;
  const currentRole = (data.session?.role ?? "owner_admin") as AdminUserRole;
  const showPreview = !["settings", "push_notices", "crossover_communication", "owner_follow_up", "active_issues", "whiteboard_preview", "analytics", "templates", "staff_directory", "users", "logs", "integrations", "help"].includes(tab);

  const preview = (
    <div className="space-y-4">
      <LivePreviewPanel
        board={board}
        lobbySettings={lobbySettings}
        staffSettings={staffSettings}
        promotions={data.promotions}
        staffDogs={data.staff_dogs}
        activeCheckouts={data.active_checkouts}
        onFullscreen={() => setPreviewOpen(true)}
      />
      <PublishPanel
        board={board}
        version={publishMeta.published_version ?? "v1.0.0"}
        publishedAt={publishMeta.published_at ?? null}
        publishedBy={publishMeta.published_by ?? null}
        onPublish={() => void publishChanges()}
        onViewHistory={() => setHistoryOpen(true)}
        busy={busy}
      />
      <SystemInfoPanel board={board} dataSource={data.data_source} />
    </div>
  );

  return (
    <>
      <AdminShell
        board={board}
        tab={tab}
        username={data.username ?? "admin"}
        role={currentRole}
        savedLabel={savedLabel}
        refreshing={refreshing}
        onBoardChange={setBoard}
        onTabChange={setActiveTab}
        onRefresh={() => void refreshDashboard()}
        onPreviewLive={() => setPreviewOpen(true)}
        onOpenBoard={openBoard}
        onLogout={() => void logout()}
        onOpenHelp={() => setActiveTab("help")}
        preview={preview}
        showPreview={showPreview}
      >
        {error ? <p className="admin-error">{error}</p> : null}

        {tab === "overview" ? (
          <>
            <StatusCards
              syncStatus={data.sync_status}
              lastSynced={data.last_synced_at}
              activeCheckouts={data.active_checkouts}
              dataSource={data.data_source}
            />
            <BoardSettings
              board={board}
              lobbySettings={lobbySettings}
              staffSettings={staffSettings}
              onSaveLobby={(patch) => void saveBoardSettings(patch)}
              onSaveStaff={(patch) => void saveBoardSettings(patch)}
              onReset={() => setConfirmResetBoard(true)}
            />
          </>
        ) : null}

        {tab === "content" ? (
          <ContentEditor
            board={board}
            lobbySettings={lobbySettings}
            staffSettings={staffSettings}
            onSaveLobby={(patch) => void saveBoardSettings(patch)}
            onSaveStaff={(patch) => void saveBoardSettings(patch)}
          />
        ) : null}

        {tab === "display" ? (
          <BoardSettings
            board={board}
            lobbySettings={lobbySettings}
            staffSettings={staffSettings}
            onSaveLobby={(patch) => void saveBoardSettings(patch)}
            onSaveStaff={(patch) => void saveBoardSettings(patch)}
            onReset={() => setConfirmResetBoard(true)}
          />
        ) : null}

        {tab === "promotions" && board === "lobby" ? (
          <PromotionsManager promotions={data.promotions} onRefresh={() => load(true)} onToast={showToast} />
        ) : null}

        {tab === "schedule" && board === "lobby" ? (
          <ClassScheduleEditor
            schedule={schedule}
            onChange={(next) => void saveBoardSettings({ class_schedule: next })}
            onReset={() => showToast("Schedule reset to defaults.", "success")}
          />
        ) : null}

        {tab === "users" ? <AdminUsersPage /> : null}

        {tab === "push_notices" ? <PushNoticesPanel /> : null}

        {tab === "crossover_communication" ? <StaffOperationsPanel tab="crossover" /> : null}

        {tab === "owner_follow_up" ? <StaffOperationsPanel tab="follow_up" /> : null}

        {tab === "active_issues" ? <StaffOperationsPanel tab="issues" /> : null}

        {tab === "whiteboard_preview" ? (
          <div className="space-y-4">
            <LivePreviewPanel
              board="staff"
              lobbySettings={lobbySettings}
              staffSettings={staffSettings}
              promotions={data.promotions}
              staffDogs={data.staff_dogs}
              activeCheckouts={data.active_checkouts}
              onFullscreen={() => setPreviewOpen(true)}
            />
          </div>
        ) : null}

        {tab === "analytics" ? (
          <section className="admin-card p-5">
            <h2 className="admin-page-title">Analytics</h2>
            <p className="admin-page-subtitle mb-5">Operational summary for the Staff Digital Whiteboard Admin.</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-admin-border p-4"><p className="text-2xl font-black text-white">{data.staff_dogs.length}</p><p className="text-sm text-admin-muted">Staff board dogs loaded</p></div>
              <div className="rounded-2xl border border-admin-border p-4"><p className="text-2xl font-black text-white">{data.active_checkouts}</p><p className="text-sm text-admin-muted">Active checkouts</p></div>
              <div className="rounded-2xl border border-admin-border p-4"><p className="text-2xl font-black text-white">{data.failed_events.length}</p><p className="text-sm text-admin-muted">Failed webhook events</p></div>
            </div>
          </section>
        ) : null}

        {tab === "templates" ? (
          <section className="admin-card p-5">
            <h2 className="admin-page-title">Templates</h2>
            <p className="admin-page-subtitle">Reusable communication templates are available inside Crossover Communication when composing a new message.</p>
            <button type="button" className="admin-btn-primary mt-4" onClick={() => setActiveTab("crossover_communication")}>Open Crossover Templates</button>
          </section>
        ) : null}

        {tab === "staff_directory" ? (
          <StaffDirectoryPanel />
        ) : null}

        {tab === "settings" ? (
          <AdminSettingsPage
            settings={adminSettings}
            lastSyncedAt={data.last_synced_at}
            dataSource={data.data_source}
            onSaved={(settings) => setData({ ...data, admin_settings: settings })}
            onRefresh={() => load(true)}
            onResetBoard={() => resetSettings()}
          />
        ) : null}

        {tab === "logs" ? (
          <AdminLogsPanel webhookUrl={data.webhook_url} events={data.events} failedEvents={data.failed_events} board={board} />
        ) : null}

        {tab === "integrations" ? (
          <IntegrationsPanel
            dataSource={data.data_source}
            lastSyncedAt={data.last_synced_at}
            webhookUrl={data.webhook_url}
            syncStatus={data.sync_status}
            failedEventsCount={data.failed_events.length}
          />
        ) : null}

        {tab === "help" ? (
          <AdminHelpCenter
            role={currentRole}
            onGoToTab={(nextTab, nextBoard) => {
              if (nextBoard) setBoard(nextBoard);
              setActiveTab(nextTab);
            }}
          />
        ) : null}
      </AdminShell>

      <PreviewModal
        open={previewOpen}
        board={board}
        lobbySettings={lobbySettings}
        staffSettings={staffSettings}
        promotions={data.promotions}
        staffDogs={data.staff_dogs}
        activeCheckouts={data.active_checkouts}
        onClose={() => setPreviewOpen(false)}
        onOpenLive={() => {
          setPreviewOpen(false);
          openBoard();
        }}
      />

      <ChangeHistoryModal open={historyOpen} board={board} onClose={() => setHistoryOpen(false)} />

      <ConfirmDialog
        open={confirmResetBoard}
        title="Reset board settings?"
        description={`This restores the ${board === "staff" ? "staff" : "lobby"} board to factory defaults.`}
        confirmLabel="Reset settings"
        danger
        busy={busy}
        onCancel={() => setConfirmResetBoard(false)}
        onConfirm={() => {
          setConfirmResetBoard(false);
          void resetSettings();
        }}
      />
    </>
  );
}
