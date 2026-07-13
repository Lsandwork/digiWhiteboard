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
import { CastDisplayPanel } from "@/components/admin/CastDisplayPanel";
import { CastVideosPanel } from "@/components/admin/CastVideosPanel";
import { EmergencyAlertsPanel } from "@/components/admin/EmergencyAlertsPanel";
import { GroomingPushPanel } from "@/components/admin/GroomingPushPanel";
import { TrainerPushPanel } from "@/components/admin/TrainerPushPanel";
import { TrainerEntryPanel } from "@/components/admin/TrainerEntryPanel";
import { PackageCommissionsPanel } from "@/components/admin/PackageCommissionsPanel";
import { StaffOperationsPanel } from "@/components/admin/StaffOperationsPanel";
import { StaffDirectoryPanel } from "@/components/admin/StaffDirectoryPanel";
import { StaffCreateUserPage } from "@/components/admin/StaffCreateUserPage";
import { IntegrationsPanel } from "@/components/admin/IntegrationsPanel";
import { NotificationsPanel } from "@/components/admin/NotificationsPanel";
import { AdminHelpCenter } from "@/components/admin/AdminHelpCenter";
import { YardLinksPanel } from "@/components/admin/YardLinksPanel";
import { YardPushNoticesPanel } from "@/components/admin/YardPushNoticesPanel";
import { ManagementSupportPanel } from "@/components/admin/ManagementSupportPanel";
import {
  AdminTrainerEntriesPanel,
  GroomerComplaintsAdminPanel,
  GroomerRequestsAdminPanel,
  ManagementSupportHubPanel,
  TrainerComplaintsAdminPanel,
  TrainerRequestsAdminPanel
} from "@/components/admin/ManagementSupportHubPanels";
import { HrConsultPanel } from "@/components/admin/HrConsultPanel";
import { HrHubPanel } from "@/components/admin/HrHubPanel";
import { AdminProfilePage } from "@/components/admin/AdminProfilePage";
import { PreviewModal } from "@/components/admin/PreviewModal";
import { ChangeHistoryModal } from "@/components/admin/ChangeHistoryModal";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/admin/settings";
import type { AdminBoardType, AdminTab, DashboardPayload, StaffBoardSettings } from "@/lib/admin/types";
import { parseAdminTab } from "@/lib/admin/types";
import { requestCastHardRefreshAllDisplays } from "@/lib/admin/cast-refresh-client";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  firstAccessibleAdminTab,
  hasPermission,
  isLobbyDigiBoardOnlyLegacyRole,
  isStaffDigiBoardOnlyLegacyRole,
  isSuperAdminLegacyRole,
  type UserAccess
} from "@/lib/admin/permissions";
import type { AdminUserRole } from "@/lib/admin/users";
import { isGroomerRole, isTeamLeaderRole, isTrainerRole, isMarketingRole, isFullAdminRole, isFrontDeskCoordinatorRole, isAdminOrManagementRole } from "@/lib/admin/users";
import { DemoPushPanel } from "@/components/demo/DemoPushPanel";
import { getEffectiveDemoRole } from "@/lib/demo/session";
import { BulkPhotoUploadPanel, HandlerChecklistPanel, HandlerShiftEntryPanel, HandlerWriteUpsPanel } from "@/components/admin/HandlerBasicPanels";
import { RemoteCastPanel } from "@/components/admin/RemoteCastPanel";
import { WalksBoardPanel } from "@/components/admin/WalksBoardPanel";
import { LobbySlideshowUploadPanel } from "@/components/admin/LobbySlideshowUploadPanel";

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
  const [castRefreshing, setCastRefreshing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmResetBoard, setConfirmResetBoard] = useState(false);

  const board = (searchParams.get("board") === "staff" ? "staff" : "lobby") as AdminBoardType;
  const tab = parseAdminTab(searchParams.get("tab"));
  const hrConsultRecordId = searchParams.get("record");

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
    const session = data?.session as { role?: string; isDemo?: boolean; demoRole?: string; access?: UserAccess | null; adminUserId?: string } | undefined;
    if (!session) return;

    const isDemo = Boolean(session.isDemo);
    const effectiveRole = isDemo ? getEffectiveDemoRole({ email: data?.username ?? "", ...session }) : session.role;
    const access = session.access
      ?? accessFromLegacyRole(session.adminUserId ?? null, data?.username ?? null, effectiveRole);
    const staffOnly = !isDemo && isStaffDigiBoardOnlyLegacyRole(effectiveRole);
    const lobbyOnly = !isDemo && isLobbyDigiBoardOnlyLegacyRole(effectiveRole);
    const effectiveBoard = staffOnly ? "staff" : lobbyOnly ? "lobby" : board;

    if (staffOnly && board !== "staff") {
      if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", "staff");
      router.replace(`/admin?board=staff&tab=${tab}`);
      return;
    }

    if (lobbyOnly && board !== "lobby") {
      if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", "lobby");
      router.replace(`/admin?board=lobby&tab=${tab}`);
      return;
    }

    if (!canAccessAdminTab(access, tab, effectiveRole, effectiveBoard, { isDemo })) {
      const fallbackTab = firstAccessibleAdminTab(access, effectiveRole, effectiveBoard, { isDemo }) as AdminTab;
      const fallbackBoard =
        effectiveBoard === "staff" && fallbackTab === "users"
          ? "lobby"
          : staffOnly
            ? "staff"
            : lobbyOnly
              ? "lobby"
              : effectiveBoard;
      if (typeof window !== "undefined" && fallbackBoard === "staff") {
        window.localStorage.setItem("fitdog_admin_board", "staff");
      }
      router.replace(`/admin?board=${fallbackBoard}&tab=${fallbackTab}`);
    }
  }, [board, data?.session, data?.username, router, tab]);

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

  function setActiveTab(nextTab: AdminTab, extraParams?: Record<string, string>) {
    if (board === "staff" && nextTab === "users") {
      router.replace("/admin?tab=users");
      return;
    }
    const params = new URLSearchParams({ board, tab: nextTab });
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value) params.set(key, value);
      }
    }
    router.replace(`/admin?${params.toString()}`);
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

  async function hardRefreshCastDisplays() {
    setCastRefreshing(true);
    try {
      const nonce = await requestCastHardRefreshAllDisplays();
      showToast(`Cast displays will hard refresh now (signal #${nonce}).`, "success");
    } catch (castError) {
      showToast(castError instanceof Error ? castError.message : "Cast refresh failed.", "error");
    } finally {
      setCastRefreshing(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function openBoard() {
    const isDemo = Boolean((data?.session as { isDemo?: boolean } | undefined)?.isDemo);
    const url = isDemo ? "/demo/board" : board === "staff" ? "/" : "/lobby/checkouts";
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
  const isDemo = Boolean((data.session as { isDemo?: boolean } | undefined)?.isDemo);
  const demoRole = (data.session as { demoRole?: string } | undefined)?.demoRole ?? null;
  const baseRole = (data.session?.role ?? "owner_admin") as AdminUserRole;
  const currentRole = (isDemo ? getEffectiveDemoRole(data.session ?? null) : baseRole) as AdminUserRole;
  const userAccess = (data.session as { access?: UserAccess | null } | undefined)?.access
    ?? accessFromLegacyRole(data.session?.adminUserId ?? null, data.username ?? null, currentRole);
  const displayLabel = isDemo ? `Demo — ${userAccess.displayLabel}` : userAccess.displayLabel;
  const showPreview = !["settings", "push_notices", "yard_push_notices", "emergency_alerts", "cast_videos", "grooming_push", "trainer_push", "trainer_entry", "crossover_communication", "owner_follow_up", "active_issues", "whiteboard_preview", "yard_links", "walks_board", "management_support", "ms_hub", "ms_groomer_complaints", "ms_groomer_requests", "ms_trainer_complaints", "ms_trainer_requests", "admin_trainer_entries", "package_commissions", "analytics", "templates", "notifications", "staff_directory", "staff_create_user", "users", "logs", "integrations", "help", "demo_push", "remote_cast"].includes(tab);
  const isTeamLeadPanel = !isDemo && isTeamLeaderRole(currentRole);
  const isGroomerPanel = !isDemo && isGroomerRole(currentRole);
  const isTrainerPanel = !isDemo && isTrainerRole(currentRole);
  const isHandlerPanel = !isDemo && currentRole === "daycare";
  const isCoordinatorPanel = !isDemo && isFrontDeskCoordinatorRole(currentRole);
  const isMarketingPanel = !isDemo && isMarketingRole(currentRole);
  const isLimitedStaffPanel =
    isTeamLeadPanel || isGroomerPanel || isTrainerPanel || isHandlerPanel || isCoordinatorPanel || isMarketingPanel;
  const canSeeAdminUtilities = isFullAdminRole(currentRole) || currentRole === "assistant_manager";
  const canViewUserGroupsPermissions =
    isSuperAdminLegacyRole(currentRole) || hasPermission(userAccess, "view_user_groups_permissions");

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
        role={baseRole}
        isDemo={isDemo}
        demoRole={demoRole}
        access={userAccess}
        displayLabel={displayLabel}
        savedLabel={isDemo ? "Demo mode — changes are preview-only" : savedLabel}
        refreshing={refreshing}
        castRefreshing={castRefreshing}
        onBoardChange={setBoard}
        onTabChange={setActiveTab}
        onRefresh={() => void refreshDashboard()}
        onCastRefresh={() => void hardRefreshCastDisplays()}
        onPreviewLive={() => setPreviewOpen(true)}
        onOpenBoard={openBoard}
        onLogout={() => void logout()}
        onOpenHelp={() => setActiveTab("help")}
        onDemoRoleSwitched={() => {
          void load(true);
          router.refresh();
        }}
        canSeeAdminUtilities={canSeeAdminUtilities}
        preview={preview}
        showPreview={showPreview && !isDemo && canSeeAdminUtilities}
      >
        {error ? <p className="admin-error">{error}</p> : null}

        {tab === "demo_push" ? <DemoPushPanel /> : null}
        {tab === "checklist" ? <HandlerChecklistPanel /> : null}

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
          <div className="space-y-4">
            <CastDisplayPanel board={board} onToast={showToast} />
            <BoardSettings
              board={board}
              lobbySettings={lobbySettings}
              staffSettings={staffSettings}
              onSaveLobby={(patch) => void saveBoardSettings(patch)}
              onSaveStaff={(patch) => void saveBoardSettings(patch)}
              onReset={() => setConfirmResetBoard(true)}
            />
          </div>
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

        {tab === "lobby_slideshow" && board === "lobby" ? (
          <LobbySlideshowUploadPanel onToast={showToast} />
        ) : null}

        {tab === "users" ? <AdminUsersPage /> : null}

        {tab === "push_notices" ? <PushNoticesPanel /> : null}

        {tab === "yard_push_notices" ? <YardPushNoticesPanel /> : null}

        {tab === "emergency_alerts" ? <EmergencyAlertsPanel /> : null}

        {tab === "cast_videos" ? <CastVideosPanel /> : null}

        {tab === "grooming_push" ? <GroomingPushPanel /> : null}

        {tab === "trainer_push" ? <TrainerPushPanel /> : null}

        {tab === "trainer_entry" ? <TrainerEntryPanel /> : null}

        {tab === "crossover_communication" ? <StaffOperationsPanel tab="crossover" /> : null}

        {tab === "owner_follow_up" ? <StaffOperationsPanel tab="follow_up" /> : null}

        {tab === "active_issues" ? <StaffOperationsPanel tab="issues" /> : null}

        {tab === "whiteboard_preview" ? (
          <div className="space-y-4">
            <CastDisplayPanel board={board} onToast={showToast} />
            <LivePreviewPanel
              board={board}
              lobbySettings={lobbySettings}
              staffSettings={staffSettings}
              promotions={data.promotions}
              staffDogs={data.staff_dogs}
              activeCheckouts={data.active_checkouts}
              onFullscreen={() => setPreviewOpen(true)}
            />
          </div>
        ) : null}

        {tab === "yard_links" ? <YardLinksPanel /> : null}
        {tab === "walks_board" ? <WalksBoardPanel /> : null}

        {tab === "management_support" ? (
          <ManagementSupportPanel
            mode={
              isHandlerPanel
                ? "handler"
                : isGroomerPanel
                  ? "groomer"
                  : isTrainerPanel
                    ? "trainer"
                    : isCoordinatorPanel
                      ? "coordinator"
                      : isAdminOrManagementRole(currentRole)
                        ? "admin"
                        : "team_leader"
            }
          />
        ) : null}

        {tab === "ms_hub" ? <ManagementSupportHubPanel /> : null}
        {tab === "ms_groomer_complaints" ? <GroomerComplaintsAdminPanel /> : null}
        {tab === "ms_groomer_requests" ? <GroomerRequestsAdminPanel /> : null}
        {tab === "ms_trainer_complaints" ? <TrainerComplaintsAdminPanel /> : null}
        {tab === "ms_trainer_requests" ? <TrainerRequestsAdminPanel /> : null}
        {tab === "admin_trainer_entries" ? <AdminTrainerEntriesPanel /> : null}

        {tab === "package_commissions" ? <PackageCommissionsPanel /> : null}

        {tab === "hr_hub" ? (
          isAdminOrManagementRole(currentRole) ? (
            <HrHubPanel onOpenConsult={(recordId) => setActiveTab("hr_consult", { record: recordId })} />
          ) : null
        ) : null}

        {tab === "hr_consult" ? (isAdminOrManagementRole(currentRole) ? <HrConsultPanel initialRecordId={hrConsultRecordId} /> : null) : null}
        {tab === "remote_cast" ? <RemoteCastPanel /> : null}
        {tab === "bulk_photo_upload" ? <BulkPhotoUploadPanel /> : null}
        {tab === "write_ups" ? (
          isHandlerPanel ? (
            <HandlerWriteUpsPanel />
          ) : isAdminOrManagementRole(currentRole) ? (
            <ManagementSupportPanel mode="admin" />
          ) : (
            <ManagementSupportPanel mode="team_leader" />
          )
        ) : null}
        {tab === "handler_shift_entry" ? <HandlerShiftEntryPanel /> : null}
        {tab === "hr_pip" ? (isAdminOrManagementRole(currentRole) ? <HrHubPanel /> : null) : null}

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
            <p className="admin-page-subtitle">Quick Log Templates for the Front Desk Tracking Log are available when adding a shift log entry.</p>
            <button type="button" className="admin-btn-primary mt-4" onClick={() => setActiveTab("crossover_communication")}>Open Front Desk Log</button>
          </section>
        ) : null}

        {tab === "notifications" ? (
          <NotificationsPanel personalOnly={isLimitedStaffPanel} onOpenTab={(nextTab) => setActiveTab(nextTab)} />
        ) : null}

        {tab === "staff_directory" ? (
          <StaffDirectoryPanel />
        ) : null}

        {tab === "staff_create_user" ? (
          <StaffCreateUserPage />
        ) : null}

        {tab === "settings" ? (
          isLimitedStaffPanel ? (
            <AdminProfilePage username={data.username} role={currentRole} displayLabel={displayLabel} />
          ) : (
            <AdminSettingsPage
              settings={adminSettings}
              lastSyncedAt={data.last_synced_at}
              dataSource={data.data_source}
              onSaved={(settings) => setData({ ...data, admin_settings: settings })}
              onRefresh={() => load(true)}
              onResetBoard={() => resetSettings()}
              canViewUserGroupsPermissions={canViewUserGroupsPermissions}
            />
          )
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
