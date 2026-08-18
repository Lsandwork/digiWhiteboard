"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { StatusCards } from "@/components/admin/StatusCards";
import { BoardSettings } from "@/components/admin/BoardSettings";
import { OverviewPanel } from "@/components/admin/OverviewPanel";
import { PipPanel } from "@/components/admin/PipPanel";
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
import { TrackIncidentsPanel } from "@/components/admin/TrackIncidentsPanel";
import { FitdogAlertsPanel } from "@/components/admin/FitdogAlertsPanel";
import { VetVisitsPanel } from "@/components/admin/VetVisitsPanel";
import { VipAutoBookPanel } from "@/components/admin/VipAutoBookPanel";
import { RouteGeneratorPanel } from "@/components/admin/RouteGeneratorPanel";
import { LiveFleetPanel } from "@/components/admin/live-fleet/LiveFleetPanel";
import { OpsCommandCenterPanel } from "@/components/admin/ops-command-center/OpsCommandCenterPanel";
import {
  DriverModePanel,
  FrontDeskCommandPanel,
  OvernightCommandPanel,
  ShiftHandoffPanel,
  TrainerOpsPanel,
  YardCommandPanel
} from "@/components/admin/ops-command-center/RoleWorkspaces";
import { SystemHealthDebuggingApp } from "@/components/admin/system-health/SystemHealthDebuggingApp";
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
  ManagementSupportInboxPanel,
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
import { humanizeUnknownError } from "@/lib/safe-url";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/admin/settings";
import type { AdminBoardType, AdminTab, DashboardPayload, StaffBoardSettings } from "@/lib/admin/types";
import { ADMIN_TABS } from "@/lib/admin/types";
import { navigateAdminDashboard, useAdminDashboardLocation } from "@/lib/admin/dashboard-nav";
import { requestCastHardRefreshAllDisplays } from "@/lib/admin/cast-refresh-client";
import { broadcastCastHardReload } from "@/lib/lobby/google-cast";
import {
  accessFromLegacyRole,
  accessibleAdminBoards,
  canAccessAdminBoard,
  canAccessAdminTab,
  canAccessHrPanelsForUser,
  canReviewManagementSupportForUser,
  canReviewWriteUpsForUser,
  canSubmitWriteUpForUser,
  firstAccessibleAdminTab,
  hasPermission,
  isLobbyDigiBoardOnlyLegacyRole,
  isStaffDigiBoardOnlyLegacyRole,
  isSuperAdminLegacyRole,
  canUseAdminBoardSwitcher,
  type UserAccess
} from "@/lib/admin/permissions";
import type { AdminUserRole } from "@/lib/admin/users";
import { isGroomerRole, isTeamLeaderRole, isTrainerRole, isMarketingRole, isFullAdminRole, isFrontDeskCoordinatorRole, isAdminOrManagementRole } from "@/lib/admin/users";
import { isFrontDeskCoordinatorLoginEmail } from "@/lib/admin/team-lead-profile";
import { DemoPushPanel } from "@/components/demo/DemoPushPanel";
import { getEffectiveDemoRole } from "@/lib/demo/session";
import { BulkPhotoUploadPanel, HandlerChecklistPanel, HandlerShiftEntryPanel, HandlerWriteUpsPanel } from "@/components/admin/HandlerBasicPanels";
import { MediaLibraryPanel } from "@/components/admin/media-library/MediaLibrary";
import { RemoteCastPanel } from "@/components/admin/RemoteCastPanel";
import { WalksBoardPanel } from "@/components/admin/WalksBoardPanel";
import { TlDigiBoardPanel } from "@/components/admin/TlDigiBoardPanel";
import { LobbySlideshowUploadPanel } from "@/components/admin/LobbySlideshowUploadPanel";
import { CastTvPanel } from "@/components/admin/CastTvPanel";
import { SuperAdminHubPanel, SuperAdminNestedReturnBar } from "@/components/admin/SuperAdminHubPanel";
import { isHubNavRole, isSuperAdminHubTab } from "@/lib/admin/role-hub-nav";

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
  const location = useAdminDashboardLocation();
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
  const [navOverride, setNavOverride] = useState<{ board: AdminBoardType; tab: AdminTab } | null>(null);

  const board = navOverride?.board ?? location.board;
  const tab = navOverride?.tab ?? location.tab ?? "my_shift";
  const hrConsultRecordId = location.extra.record ?? null;

  useEffect(() => {
    if (!navOverride) return;
    if (location.board === navOverride.board && location.tab === navOverride.tab) {
      setNavOverride(null);
    }
  }, [location.board, location.tab, navOverride]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only fill in a missing board. Rewriting an explicit board here fights the
    // role-based board redirects below and ping-pongs the router forever.
    if (location.rawBoard) return;
    if (location.tab === "users") return;
    const stored = window.localStorage.getItem("fitdog_admin_board");
    if (stored === "staff" || stored === "lobby" || stored === "marketing") {
      navigateAdminDashboard(stored, location.tab ?? "my_shift", location.extra);
    }
  }, [location.rawBoard, location.tab]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    else setRefreshing(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`/api/admin/dashboard?board=${board}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load admin dashboard.");
      setData(body as DashboardPayload);
    } catch (loadError) {
      const aborted = loadError instanceof DOMException && loadError.name === "AbortError";
      setError(
        aborted
          ? "The dashboard is taking too long to load. Check your connection and tap Retry."
          : humanizeUnknownError(loadError, "Unable to load admin dashboard. Reload and try again.")
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
      setRefreshing(false);
    }
  }, [board]);

  function goToBoardTab(nextBoard: AdminBoardType, nextTab: AdminTab, extra?: Record<string, string>) {
    setNavOverride({ board: nextBoard, tab: nextTab });
    if (typeof window !== "undefined") {
      window.localStorage.setItem("fitdog_admin_board", nextBoard);
    }
    navigateAdminDashboard(nextBoard, nextTab, extra ?? location.extra);
  }

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
    const marketingAccount = !isDemo && isLobbyDigiBoardOnlyLegacyRole(effectiveRole);
    const effectiveBoard = staffOnly ? "staff" : board;

    if (staffOnly && board !== "staff") {
      if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", "staff");
      goToBoardTab("staff", tab);
      return;
    }

    if (marketingAccount && board === "staff") {
      if (tab === "crossover_communication" || tab === "bulk_photo_upload" || tab === "media_library" || tab === "help") return;
      if (tab === "sa_apps_hub") {
        if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", "marketing");
        goToBoardTab("marketing", "sa_apps_hub");
        return;
      }
      const fallbackBoard = accessibleAdminBoards(access, effectiveRole).includes("marketing") ? "marketing" : "lobby";
      const fallbackTab = firstAccessibleAdminTab(access, effectiveRole, fallbackBoard, { isDemo }) as AdminTab;
      if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", fallbackBoard);
      goToBoardTab(fallbackBoard, fallbackTab);
      return;
    }

    if (!canAccessAdminBoard(effectiveBoard, access, effectiveRole)) {
      const allowedBoards = accessibleAdminBoards(access, effectiveRole);
      const fallbackBoard = allowedBoards[0] ?? "lobby";
      const fallbackTab = firstAccessibleAdminTab(access, effectiveRole, fallbackBoard, { isDemo }) as AdminTab;
      if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", fallbackBoard);
      goToBoardTab(fallbackBoard, fallbackTab);
      return;
    }

    if ((tab === "route_generator" || tab === "live_fleet" || tab === "package_commissions" || tab === "ops_system_health") && board !== "staff") {
      if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", "staff");
      goToBoardTab("staff", tab);
      return;
    }

    if (board === "marketing" && !["cast_tv", "sa_apps_hub", "bulk_photo_upload", "settings", "help"].includes(tab)) {
      goToBoardTab("marketing", "cast_tv");
      return;
    }

    if (!location.tab && !navOverride) {
      const fallbackTab = firstAccessibleAdminTab(access, effectiveRole, effectiveBoard, { isDemo }) as AdminTab;
      goToBoardTab(effectiveBoard, fallbackTab);
    }
    // Do not bounce known tabs to My Shift. A false-negative permission check
    // was sending every role there after a click; forbidden tools fail at the API.
  }, [board, data?.session, data?.username, location.tab, navOverride, tab]);

  useEffect(() => {
    if (board === "staff" && tab === "users") {
      goToBoardTab("lobby", "users");
    }
  }, [board, tab]);

  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return "All changes saved";
    const seconds = Math.max(1, Math.round(((currentTimeMs || lastSavedAt.getTime()) - lastSavedAt.getTime()) / 1000));
    return `All changes saved • Last saved ${seconds}s ago`;
  }, [currentTimeMs, lastSavedAt]);

  function setBoard(nextBoard: AdminBoardType) {
    let nextTab: AdminTab = tab;
    if (nextBoard === "marketing") {
      nextTab = "cast_tv";
    } else if (tab === "cast_tv") {
      nextTab = nextBoard === "staff" ? "overview" : "content";
    }
    goToBoardTab(nextBoard, nextTab);
  }

  function setActiveTab(nextTab: AdminTab, extraParams?: Record<string, string>) {
    if (nextTab === "users") {
      goToBoardTab("lobby", "users", extraParams);
      return;
    }
    // These tabs only exist on the staff board — force board so the click
    // never lands on lobby/marketing where the tab is inaccessible / empty.
    const forceStaffBoard =
      nextTab === "route_generator" ||
      nextTab === "live_fleet" ||
      nextTab === "package_commissions" ||
      nextTab === "ops_system_health";
    const nextBoard = forceStaffBoard ? "staff" : board;
    goToBoardTab(nextBoard, nextTab, extraParams);
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
      showToast(humanizeUnknownError(publishError, "Publish failed."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDashboard() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/refresh", { method: "POST" });
      if (!response.ok) throw new Error("Refresh failed.");
      await broadcastCastHardReload();
      await load(true);
      showToast("Refresh complete. Staff whiteboard TVs were signaled to reload.", "success");
    } catch (refreshError) {
      showToast(humanizeUnknownError(refreshError, "Refresh failed."), "error");
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
      showToast(humanizeUnknownError(castError, "Cast refresh failed."), "error");
    } finally {
      setCastRefreshing(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } catch {
      // Still leave the app UI even if the network call fails.
    }
    window.location.assign("/admin/login");
  }

  function openBoard() {
    const isDemo = Boolean((data?.session as { isDemo?: boolean } | undefined)?.isDemo);
    const url = isDemo
      ? "/demo/board"
      : board === "marketing"
        ? "https://casttv.ruffops.com"
        : board === "staff"
          ? "/"
          : "/lobby/checkouts";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!data) {
    return (
      <main className="admin-theme grid min-h-screen place-items-center p-6 text-white">
        {error ? (
          <div className="max-w-md space-y-4 text-center">
            <p className="admin-error">{error}</p>
            <button type="button" className="admin-btn-primary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <p>Loading admin dashboard…</p>
        )}
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
  const currentRole = (isDemo
    ? getEffectiveDemoRole(data.session ?? null)
    : isFrontDeskCoordinatorLoginEmail(data.username)
      ? "front_desk_coordinator"
      : baseRole) as AdminUserRole;
  const userAccess = (data.session as { access?: UserAccess | null } | undefined)?.access
    ?? accessFromLegacyRole(data.session?.adminUserId ?? null, data.username ?? null, currentRole);
  const displayLabel = isDemo
    ? `Demo — ${userAccess.displayLabel}`
    : isFrontDeskCoordinatorLoginEmail(data.username)
      ? "Front Desk Coordinator"
      : userAccess.displayLabel;
  const showPreview = !["settings", "push_notices", "yard_push_notices", "emergency_alerts", "cast_videos", "cast_tv", "grooming_push", "trainer_push", "trainer_entry", "crossover_communication", "owner_follow_up", "active_issues", "fitdog_alerts", "vip_auto_book", "whiteboard_preview", "yard_links", "walks_board", "tl_digi_board", "management_support", "ms_hub", "ms_groomer_complaints", "ms_groomer_requests", "ms_trainer_complaints", "ms_trainer_requests", "admin_trainer_entries", "package_commissions", "track_incidents", "vet_visits", "route_generator", "live_fleet", "my_shift", "ops_command_center", "front_desk_command", "yard_command", "driver_mode", "overnight_command", "trainer_ops", "ops_system_health", "shift_handoff", "sa_floor_hub", "sa_whiteboard_hub", "sa_people_hub", "sa_apps_hub", "sa_admin_hub", "analytics", "templates", "notifications", "staff_directory", "staff_create_user", "users", "logs", "integrations", "help", "demo_push", "remote_cast", "write_ups", "write_up_review", "complaint_review", "hr_hub", "hr_consult", "hr_pip", "bulk_photo_upload", "media_library", "handler_shift_entry"].includes(tab);
  const hubNavRole = currentRole;
  const showRoleHubNav = isHubNavRole(hubNavRole) && board === "staff";
  // Plain filter (not useMemo): this block runs only after the `if (!data)` early return.
  const hubVisibleTabs = ADMIN_TABS.filter((item) =>
    canAccessAdminTab(userAccess, item, hubNavRole, "staff", { isDemo })
  );
  const isTeamLeadPanel = !isDemo && isTeamLeaderRole(currentRole);
  const isGroomerPanel = !isDemo && isGroomerRole(currentRole);
  const isTrainerPanel = !isDemo && isTrainerRole(currentRole);
  const isHandlerPanel =
    !isDemo && (currentRole === "daycare" || currentRole === "driver" || currentRole === "hiker");
  const isCoordinatorPanel = !isDemo && isFrontDeskCoordinatorRole(currentRole);
  const isMarketingPanel = !isDemo && isMarketingRole(currentRole);
  const isLimitedStaffPanel =
    isTeamLeadPanel || isGroomerPanel || isTrainerPanel || isHandlerPanel || isCoordinatorPanel || isMarketingPanel;
  const canSeeAdminUtilities = isFullAdminRole(currentRole) || currentRole === "assistant_manager";
  const accessibleBoards = accessibleAdminBoards(userAccess, currentRole);
  const canUseBoardSwitcher = canUseAdminBoardSwitcher(userAccess, currentRole);
  const canViewUserGroupsPermissions =
    isSuperAdminLegacyRole(currentRole) || hasPermission(userAccess, "view_user_groups_permissions");
  const canAccessHrPanels = canAccessHrPanelsForUser(userAccess, currentRole);
  const canSubmitWriteUps = canSubmitWriteUpForUser(userAccess, currentRole);
  const canReviewWriteUps = canReviewWriteUpsForUser(userAccess, currentRole);
  const canReviewComplaints = canReviewManagementSupportForUser(userAccess, currentRole);

  const isStaffOverview = tab === "overview" && board !== "lobby";
  const publishPanel = (
    <PublishPanel
      board={board}
      version={publishMeta.published_version ?? "v1.0.0"}
      publishedAt={publishMeta.published_at ?? null}
      publishedBy={publishMeta.published_by ?? null}
      onPublish={() => void publishChanges()}
      onViewHistory={() => setHistoryOpen(true)}
      busy={busy}
    />
  );
  const systemInfoPanel = <SystemInfoPanel board={board} dataSource={data.data_source} />;
  const livePreviewPanel = (
    <LivePreviewPanel
      board={board}
      lobbySettings={lobbySettings}
      staffSettings={staffSettings}
      promotions={data.promotions}
      staffDogs={data.staff_dogs}
      activeCheckouts={data.active_checkouts}
      onFullscreen={() => setPreviewOpen(true)}
      compact={isStaffOverview}
    />
  );
  const preview = (
    <div className="space-y-4">
      {livePreviewPanel}
      {/* On staff Overview these sit under Whiteboard & Gingr Health with Live Preview in-row. */}
      {!isStaffOverview ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {publishPanel}
          {systemInfoPanel}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <AdminShell
        board={board}
        tab={tab}
        username={data.username ?? "admin"}
        displayName={typeof data.fullName === "string" ? data.fullName : null}
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
        }}
        canSeeAdminUtilities={canSeeAdminUtilities}
        canUseBoardSwitcher={canUseBoardSwitcher}
        accessibleBoards={accessibleBoards}
        preview={preview}
        showPreview={showPreview && !isStaffOverview && !isDemo && canSeeAdminUtilities && board !== "marketing"}
      >
        {error ? <p className="admin-error">{error}</p> : null}

        {showRoleHubNav ? (
          <SuperAdminNestedReturnBar tab={tab} onNavigate={(nextTab) => setActiveTab(nextTab)} />
        ) : null}

        {(showRoleHubNav || (board === "marketing" && tab === "sa_apps_hub")) && isSuperAdminHubTab(tab) ? (
          <SuperAdminHubPanel
            hubTab={tab}
            onNavigate={(nextTab) => setActiveTab(nextTab)}
            visibleTabs={hubVisibleTabs}
            role={hubNavRole}
            email={data.username ?? null}
            name={typeof data.fullName === "string" ? data.fullName : null}
            marketingAppsOnly={board === "marketing"}
          />
        ) : null}

        {tab === "demo_push" ? <DemoPushPanel /> : null}
        {tab === "checklist" ? <HandlerChecklistPanel /> : null}

        {tab === "overview" ? (
          board === "lobby" ? (
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
          ) : (
            <OverviewPanel
              onNavigate={(nextTab) => setActiveTab(nextTab)}
              boardMetaPanels={
                <>
                  {publishPanel}
                  {systemInfoPanel}
                  {livePreviewPanel}
                </>
              }
            />
          )
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

        {board === "marketing" && tab === "cast_tv" ? <CastTvPanel onToast={showToast} /> : null}

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
        {tab === "tl_digi_board" ? <TlDigiBoardPanel /> : null}

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

        {tab === "ms_hub" ? <ManagementSupportHubPanel onNavigate={(nextTab) => setActiveTab(nextTab)} /> : null}
        {tab === "ms_groomer_complaints" ? <GroomerComplaintsAdminPanel /> : null}
        {tab === "ms_groomer_requests" ? <GroomerRequestsAdminPanel /> : null}
        {tab === "ms_trainer_complaints" ? <TrainerComplaintsAdminPanel /> : null}
        {tab === "ms_trainer_requests" ? <TrainerRequestsAdminPanel /> : null}
        {tab === "admin_trainer_entries" ? <AdminTrainerEntriesPanel /> : null}

        {tab === "package_commissions" ? <PackageCommissionsPanel /> : null}
        {tab === "track_incidents" ? <TrackIncidentsPanel /> : null}
        {tab === "fitdog_alerts" ? <FitdogAlertsPanel /> : null}
        {tab === "vet_visits" ? <VetVisitsPanel /> : null}
        {tab === "vip_auto_book" ? <VipAutoBookPanel /> : null}
        {tab === "route_generator" ? <RouteGeneratorPanel /> : null}
        {tab === "live_fleet" ? <LiveFleetPanel /> : null}
        {tab === "my_shift" ? (
          <OpsCommandCenterPanel mode="my_shift" onNavigate={(nextTab) => setActiveTab(nextTab as AdminTab)} />
        ) : null}
        {tab === "ops_command_center" ? (
          <OpsCommandCenterPanel
            mode="ops_command_center"
            onNavigate={(nextTab) => setActiveTab(nextTab as AdminTab)}
          />
        ) : null}
        {tab === "front_desk_command" ? (
          <FrontDeskCommandPanel onNavigate={(nextTab) => setActiveTab(nextTab as AdminTab)} />
        ) : null}
        {tab === "yard_command" ? (
          <YardCommandPanel onNavigate={(nextTab) => setActiveTab(nextTab as AdminTab)} />
        ) : null}
        {tab === "driver_mode" ? <DriverModePanel /> : null}
        {tab === "overnight_command" ? <OvernightCommandPanel /> : null}
        {tab === "trainer_ops" ? (
          <TrainerOpsPanel onNavigate={(nextTab) => setActiveTab(nextTab as AdminTab)} />
        ) : null}
        {tab === "ops_system_health" ? <SystemHealthDebuggingApp /> : null}
        {tab === "shift_handoff" ? <ShiftHandoffPanel /> : null}

        {tab === "hr_hub" ? (
          canAccessHrPanels ? (
            <HrHubPanel
              onOpenConsult={(recordId) => setActiveTab("hr_consult", { record: recordId })}
              onOpenPip={() => setActiveTab("hr_pip")}
            />
          ) : null
        ) : null}

        {tab === "hr_consult" ? (canAccessHrPanels ? <HrConsultPanel initialRecordId={hrConsultRecordId} /> : null) : null}
        {tab === "remote_cast" ? <RemoteCastPanel /> : null}
        {tab === "bulk_photo_upload" ? <BulkPhotoUploadPanel onOpenMediaLibrary={() => setActiveTab("media_library")} /> : null}
        {tab === "media_library" ? <MediaLibraryPanel /> : null}
        {tab === "write_ups" ? (
          isHandlerPanel ? (
            <HandlerWriteUpsPanel />
          ) : canReviewWriteUps ? (
            <ManagementSupportPanel mode="admin" />
          ) : canSubmitWriteUps ? (
            <ManagementSupportPanel mode="team_leader" />
          ) : null
        ) : null}
        {tab === "write_up_review" ? (
          canReviewWriteUps ? <ManagementSupportPanel mode="admin" initialSubTab="review" /> : null
        ) : null}
        {tab === "complaint_review" ? (canReviewComplaints ? <ManagementSupportInboxPanel /> : null) : null}
        {tab === "handler_shift_entry" ? <HandlerShiftEntryPanel /> : null}
        {tab === "hr_pip" ? (canAccessHrPanels ? <PipPanel /> : null) : null}

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
            <button type="button" className="admin-btn-primary mt-4" onClick={() => setActiveTab("crossover_communication")}>Open Team Log</button>
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
