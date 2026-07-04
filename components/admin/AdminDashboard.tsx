"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { StatusCards } from "@/components/admin/StatusCards";
import { BoardSettings } from "@/components/admin/BoardSettings";
import { PromotionsManager } from "@/components/admin/PromotionsManager";
import { ClassScheduleEditor } from "@/components/admin/ClassScheduleEditor";
import { LivePreviewPanel } from "@/components/admin/LivePreviewPanel";
import { PublishPanel } from "@/components/admin/PublishPanel";
import { SystemInfoPanel } from "@/components/admin/SystemInfoPanel";
import { AdminLogsPanel } from "@/components/admin/AdminLogsPanel";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import type { AdminBoardType, AdminTab } from "@/lib/admin/types";
import type { LobbyPromotion, LobbySettings } from "@/lib/lobby/types";
import type { StaffBoardSettings } from "@/lib/admin/types";
import type { LiveDog, WebhookEvent } from "@/lib/types";

type DashboardPayload = {
  username: string;
  lobby_settings: LobbySettings;
  staff_settings: StaffBoardSettings;
  promotions: LobbyPromotion[];
  active_checkouts: number;
  sync_status: string;
  last_synced_at: string | null;
  data_source: string;
  webhook_url: string;
  events: WebhookEvent[];
  failed_events: WebhookEvent[];
  staff_dogs: LiveDog[];
};

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
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const board = (searchParams.get("board") === "staff" ? "staff" : "lobby") as AdminBoardType;
  const tab = (searchParams.get("tab") as AdminTab) || "overview";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("fitdog_admin_board");
    if (!searchParams.get("board") && stored === "staff") {
      router.replace("/admin?board=staff");
    }
  }, [router, searchParams]);

  const load = useCallback(async () => {
    setBusy(true);
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
    }
  }, [board]);

  useEffect(() => {
    void load();
  }, [load]);

  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return "All changes saved";
    const seconds = Math.max(1, Math.round((Date.now() - lastSavedAt.getTime()) / 1000));
    return `All changes saved • Last saved ${seconds}s ago`;
  }, [lastSavedAt, data]);

  function setBoard(nextBoard: AdminBoardType) {
    if (typeof window !== "undefined") window.localStorage.setItem("fitdog_admin_board", nextBoard);
    router.replace(`/admin?board=${nextBoard}&tab=${tab}`);
  }

  function setActiveTab(nextTab: AdminTab) {
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
    setToast("Settings saved.");
    await load();
  }

  async function resetSettings() {
    const response = await fetch(`/api/admin/board-settings?board=${board}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Unable to reset settings.");
    setToast("Settings reset to defaults.");
    await load();
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
      setToast(`Published ${body.version}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function togglePromotion(promotion: LobbyPromotion) {
    const response = await fetch(`/api/lobby/promotions/${promotion.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !promotion.active })
    });
    if (!response.ok) throw new Error("Unable to update promotion.");
    await load();
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
  const schedule = lobbySettings.class_schedule ?? LOBBY_CLASS_SCHEDULE;
  const publishMeta = board === "staff" ? staffSettings : lobbySettings;

  const preview = (
    <div className="space-y-4">
      <LivePreviewPanel
        board={board}
        lobbySettings={lobbySettings}
        staffSettings={staffSettings}
        promotions={data.promotions}
        staffDogs={data.staff_dogs}
        activeCheckouts={data.active_checkouts}
      />
      <PublishPanel
        board={board}
        version={publishMeta.published_version ?? "v1.0.0"}
        publishedAt={publishMeta.published_at ?? null}
        publishedBy={publishMeta.published_by ?? null}
        onPublish={() => void publishChanges()}
        busy={busy}
      />
      <SystemInfoPanel board={board} dataSource={data.data_source} />
    </div>
  );

  return (
    <>
      {toast ? (
        <div className="admin-toast" role="status">{toast}</div>
      ) : null}

      <AdminShell
        board={board}
        tab={tab}
        username={data.username ?? "admin"}
        savedLabel={savedLabel}
        onBoardChange={setBoard}
        onTabChange={setActiveTab}
        onRefresh={() => void load()}
        onOpenBoard={openBoard}
        onLogout={() => void logout()}
        preview={preview}
      >
        {error ? <p className="admin-error">{error}</p> : null}

        {(tab === "overview" || tab === "content" || tab === "display") && (
          <StatusCards
            syncStatus={data.sync_status}
            lastSynced={data.last_synced_at}
            activeCheckouts={data.active_checkouts}
            dataSource={data.data_source}
          />
        )}

        {(tab === "overview" || tab === "content" || tab === "display") && (
          <BoardSettings
            board={board}
            lobbySettings={lobbySettings}
            staffSettings={staffSettings}
            onSaveLobby={(patch) => void saveBoardSettings(patch)}
            onSaveStaff={(patch) => void saveBoardSettings(patch)}
            onReset={() => void resetSettings()}
          />
        )}

        {(tab === "overview" || tab === "promotions" || tab === "content") && board === "lobby" ? (
          <PromotionsManager promotions={data.promotions} onToggle={(p) => void togglePromotion(p)} />
        ) : null}

        {(tab === "overview" || tab === "schedule" || tab === "content") && board === "lobby" ? (
          <ClassScheduleEditor
            schedule={schedule}
            onChange={(next) => void saveBoardSettings({ class_schedule: next })}
          />
        ) : null}

        {tab === "logs" ? (
          <AdminLogsPanel webhookUrl={data.webhook_url} events={data.events} failedEvents={data.failed_events} />
        ) : null}
      </AdminShell>
    </>
  );
}
