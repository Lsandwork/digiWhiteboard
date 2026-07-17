"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, MonitorPlay, RefreshCw } from "lucide-react";
import type { AdminBoardType } from "@/lib/admin/types";
import {
  buildLobbyCastUrl,
  buildStaffCastUrl
} from "@/lib/whiteboard/cast-options";
import {
  buildCastDisplayUrl,
  displayTypeLabel,
  isDisplayDeviceOnline,
  type DisplayDevice,
  type DisplayType
} from "@/lib/display-keeper";
import { requestCastHardRefreshAllDisplays } from "@/lib/admin/cast-refresh-client";
import { formatBoardDateTime } from "@/lib/board-utils";

type CastDisplayPanelProps = {
  board: AdminBoardType;
  onToast?: (message: string, tone?: "success" | "error") => void;
};

const SETUP_CHECKLIST = [
  "Turn off computer sleep",
  "Turn off display sleep if possible",
  "Keep Chrome open",
  "Keep Wi-Fi connected",
  "Do not close laptop lid unless external display/power settings allow it",
  "Plug computer into power",
  "Use dedicated display URL",
  "Use Google TV browser/kiosk mode for best reliability"
] as const;

function boardToDisplayType(board: AdminBoardType): DisplayType {
  return board === "lobby" ? "lobby_whiteboard" : "staff_whiteboard";
}

function formatSeen(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return formatBoardDateTime(date).time;
}

export function CastDisplayPanel({ board, onToast }: CastDisplayPanelProps) {
  const displayType = boardToDisplayType(board);
  const legacyCastUrl = useMemo(() => buildCastDisplayUrl(displayType), [displayType]);
  const castLiteUrl = useMemo(
    () => (board === "lobby" ? buildLobbyCastUrl() : buildStaffCastUrl()),
    [board]
  );
  const [devices, setDevices] = useState<DisplayDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/displays?displayType=${displayType}`, { cache: "no-store" });
      const body = (await response.json()) as { devices?: DisplayDevice[] };
      if (response.ok) {
        setDevices(body.devices ?? []);
      }
    } catch {
      // Keep the last known device list when polling fails.
    } finally {
      setLoading(false);
    }
  }, [displayType]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadDevices(), 0);
    const timer = window.setInterval(() => void loadDevices(), 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadDevices]);

  const openCastDisplay = () => {
    window.open(castLiteUrl, "_blank", "noopener,noreferrer");
  };

  const openLegacyCastDisplay = () => {
    window.open(legacyCastUrl, "_blank", "noopener,noreferrer");
  };

  const copyCastLink = async () => {
    try {
      await navigator.clipboard.writeText(castLiteUrl);
      onToast?.("Cast Mode URL copied.", "success");
    } catch {
      onToast?.("Unable to copy link.", "error");
    }
  };

  const hardRefresh = async () => {
    setRefreshing(true);
    try {
      await requestCastHardRefreshAllDisplays();
      onToast?.("Hard refresh sent to cast displays.", "success");
      await loadDevices();
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : "Unable to refresh cast displays.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="admin-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="admin-page-title">Cast Display</h2>
            <p className="admin-page-subtitle mt-1 max-w-2xl">
              Use Cast Mode URLs for Chromecast and Google TV Streamer. These lightweight pages stay smooth for long
              sessions. Open directly on the TV browser for best reliability.
            </p>
            <p className="admin-callout--success mt-3 max-w-2xl rounded-xl border border-emerald-600/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-100">
              Auto schedule: boards soft-refresh around 5:00 AM Pacific so overnight freezes clear without a manual Hard
              Refresh. Keep the cast URL open on each TV.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn-primary inline-flex items-center gap-2" onClick={openCastDisplay}>
              <ExternalLink className="h-4 w-4" />
              {board === "lobby" ? "Open Lobby Cast Mode" : "Open Staff Cast Mode"}
            </button>
            <button type="button" className="admin-btn-secondary inline-flex items-center gap-2" onClick={() => void copyCastLink()}>
              <Copy className="h-4 w-4" />
              {board === "lobby" ? "Copy Lobby Cast URL" : "Copy Staff Cast URL"}
            </button>
            <button
              type="button"
              className="admin-btn-secondary inline-flex items-center gap-2"
              onClick={openLegacyCastDisplay}
            >
              <MonitorPlay className="h-4 w-4" />
              Open Legacy Display
            </button>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-admin-border bg-[var(--surface-hover)] px-4 py-3 text-sm text-admin-muted">
          <span className="font-semibold admin-text-emphasis">{displayTypeLabel(displayType)} — Cast Mode</span>
          <span className="mx-2 text-admin-muted">·</span>
          <code className="break-all text-xs font-semibold text-emerald-300">{castLiteUrl}</code>
        </p>
        <p className="mt-2 text-xs text-admin-muted">
          Legacy display URL:{" "}
          <code className="break-all font-semibold text-emerald-300/80">{legacyCastUrl}</code>
        </p>
      </section>

      <section className="admin-card p-5">
        <h3 className="text-lg font-black admin-text-emphasis">Keep Cast From Disconnecting</h3>
        <p className="mt-2 text-sm text-admin-muted">
          To prevent disconnection, keep the casting computer awake, keep Chrome open, keep this tab active when
          possible, and use strong Wi-Fi. For best reliability, open the display URL directly on the Google TV
          Streamer.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {SETUP_CHECKLIST.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <span className="mt-0.5 text-fitdog-orange" aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black admin-text-emphasis">Connected Displays</h3>
            <p className="text-sm text-admin-muted">Cast Keeper heartbeat status for {displayTypeLabel(displayType)}.</p>
          </div>
          <button
            type="button"
            className="admin-btn-secondary inline-flex items-center gap-2"
            onClick={() => void hardRefresh()}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing TVs…" : "Hard Refresh Cast TVs"}
          </button>
        </div>

        {devices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-border px-4 py-6 text-sm text-admin-muted">
            {loading ? "Loading display devices…" : "No cast displays have checked in yet. Open the cast display URL on a TV or casting computer."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-admin-muted">
                <tr>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last seen</th>
                  <th className="px-3 py-2">Last data</th>
                  <th className="px-3 py-2">Wake lock</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => {
                  const online = isDisplayDeviceOnline(device.last_seen_at);
                  return (
                    <tr key={device.id} className="border-t border-admin-border/70">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <MonitorPlay className="h-4 w-4 text-fitdog-orange" />
                          <div>
                            <p className="font-semibold admin-text-emphasis">{device.name ?? "Cast display"}</p>
                            <p className="text-xs text-admin-muted">{device.current_route ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`admin-badge ${online ? "admin-badge--green" : "admin-badge--amber"}`}>
                          {online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-admin-muted">{formatSeen(device.last_seen_at)}</td>
                      <td className="px-3 py-3 text-admin-muted">{formatSeen(device.last_data_at)}</td>
                      <td className="px-3 py-3 text-admin-muted">{device.wake_lock_status ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
