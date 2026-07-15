"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MonitorPlay,
  MonitorSmartphone,
  Moon,
  Pause,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Tv
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import {
  ADMIN_RECEIVERS_POLL_MS,
  screenLabel,
  type RemoteCastCommand,
  type RemoteCastReceiverPublic
} from "@/lib/remote-cast/types";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        online ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-300"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-slate-400"}`} aria-hidden />
      {online ? "Online" : "Offline"}
    </span>
  );
}

export function RemoteCastPanel() {
  const { showToast } = useToast();
  const [receivers, setReceivers] = useState<RemoteCastReceiverPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingName, setPairingName] = useState("");
  const [pairing, setPairing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/remote-cast/receivers", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load displays.");
      if (!mountedRef.current) return;
      setReceivers(body.receivers ?? []);
      setLoadError(null);
    } catch (error) {
      if (!mountedRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Unable to load displays.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const initialTimer = window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(() => void load(true), ADMIN_RECEIVERS_POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

  async function pairDisplay() {
    if (!pairingCode.trim()) {
      showToast("Enter a pairing code from the display.", "error");
      return;
    }
    setPairing(true);
    try {
      const response = await fetch("/api/remote-cast/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingCode: pairingCode.trim(), displayName: pairingName.trim() || undefined })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to pair display.");
      if (body.demo) {
        showToast(body.message ?? "Demo mode — not saved.", "info");
        return;
      }
      showToast(`Paired ${body.receiver?.displayName ?? "display"}.`, "success");
      setPairingCode("");
      setPairingName("");
      await load(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to pair display.", "error");
    } finally {
      setPairing(false);
    }
  }

  const sendCommand = useCallback(
    async (receiverId: string, command: RemoteCastCommand, extra?: { displayName?: string }) => {
      const response = await fetch("/api/remote-cast/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receiverId, command, ...extra })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to send command.");
      if (body.demo) throw new Error(body.message ?? "Demo mode — not saved.");
      return body.receiver as RemoteCastReceiverPublic | undefined;
    },
    []
  );

  async function runCommand(receiverId: string, command: RemoteCastCommand, extra?: { displayName?: string }) {
    setBusyId(receiverId);
    try {
      await sendCommand(receiverId, command, extra);
      showToast("Command sent.", "success");
      await load(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to send command.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function runBulk(command: RemoteCastCommand, label: string) {
    const targets = receivers.filter((r) => r.online && r.paired);
    if (!targets.length) {
      showToast("No online displays to control right now.", "info");
      return;
    }
    try {
      await Promise.all(targets.map((r) => sendCommand(r.id, command)));
      showToast(`${label} sent to ${targets.length} display${targets.length === 1 ? "" : "s"}.`, "success");
      await load(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Some displays did not respond.", "error");
    }
  }

  async function submitRename(receiverId: string) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    await runCommand(receiverId, "RENAME_DISPLAY", { displayName: renameValue.trim() });
    setRenamingId(null);
    setRenameValue("");
  }

  async function removeDisplay(receiverId: string) {
    setBusyId(receiverId);
    try {
      const response = await fetch(`/api/remote-cast/receivers?id=${encodeURIComponent(receiverId)}`, {
        method: "DELETE"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to remove display.");
      if (body.demo) {
        showToast(body.message ?? "Demo mode — not saved.", "info");
        return;
      }
      showToast("Display removed.", "success");
      setConfirmRemoveId(null);
      await load(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to remove display.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const onlineCount = receivers.filter((r) => r.online && r.paired).length;

  return (
    <div className="space-y-5">
      <header className="admin-card p-5">
        <h2 className="admin-page-title">Remote Whiteboard Cast</h2>
        <p className="admin-page-subtitle">Control Fitdog lobby and staff whiteboards from anywhere.</p>
        <p className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          Schedule: displays auto-wake 5:00 AM–10:00 PM Pacific, 7 days a week, and go to standby overnight.
          No manual refresh is required for the morning power-on (receiver page must stay open on the TV).
        </p>
        <p className="mt-3 admin-surface-inset p-3 text-sm text-admin-muted">
          Remote Cast works when the TV/display has the Fitdog receiver page open at{" "}
          <span className="font-mono admin-text-emphasis">/cast/receiver</span>. This does not require the admin to be on the
          same Wi-Fi.
        </p>
      </header>

      <section className="admin-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-fitdog-orange" />
          <h3 className="text-lg font-black admin-text-emphasis">Pair New Display</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="admin-label" htmlFor="pairing-code">
              Pairing code
            </label>
            <input
              id="pairing-code"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              placeholder="FITDOG-4821"
              className="admin-input font-mono"
              autoCapitalize="characters"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="pairing-name">
              Display name (optional)
            </label>
            <input
              id="pairing-name"
              value={pairingName}
              onChange={(e) => setPairingName(e.target.value)}
              placeholder="Lobby TV"
              className="admin-input"
            />
          </div>
          <button type="button" className="admin-btn-primary h-[46px] px-6" onClick={() => void pairDisplay()} disabled={pairing}>
            {pairing ? "Pairing…" : "Pair Display"}
          </button>
        </div>
      </section>

      <section className="admin-card p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-lg font-black admin-text-emphasis">Quick Actions</h3>
          <span className="text-sm text-admin-muted">{onlineCount} online</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" className="admin-btn-secondary flex h-14 items-center justify-center gap-2 text-base font-bold" onClick={() => void runBulk("CAST_LOBBY", "Lobby Whiteboard")}>
            <Tv className="h-5 w-5" /> Cast Lobby to All
          </button>
          <button type="button" className="admin-btn-secondary flex h-14 items-center justify-center gap-2 text-base font-bold" onClick={() => void runBulk("CAST_STAFF", "Staff Whiteboard")}>
            <MonitorPlay className="h-5 w-5" /> Cast Staff to All
          </button>
          <button type="button" className="admin-btn-secondary flex h-14 items-center justify-center gap-2 text-base font-bold" onClick={() => void runBulk("BLACKOUT", "Blackout")}>
            <Moon className="h-5 w-5" /> Blackout All
          </button>
          <button type="button" className="admin-btn-secondary flex h-14 items-center justify-center gap-2 text-base font-bold" onClick={() => void runBulk("REFRESH", "Refresh")}>
            <RefreshCw className="h-5 w-5" /> Refresh All
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black admin-text-emphasis">Paired Displays</h3>
          <button type="button" className="admin-btn-ghost text-sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 inline h-4 w-4" /> Refresh list
          </button>
        </div>

        {loadError ? <p className="admin-error">{loadError}</p> : null}
        {loading && !receivers.length ? <p className="text-admin-muted">Loading displays…</p> : null}
        {!loading && !receivers.length && !loadError ? (
          <div className="admin-card p-8 text-center">
            <MonitorSmartphone className="mx-auto h-10 w-10 text-admin-muted" />
            <p className="mt-3 admin-text-emphasis">No displays yet.</p>
            <p className="mt-1 text-sm text-admin-muted">
              Open <span className="font-mono">/cast/receiver</span> on a TV or mini-PC, then pair it with the code
              shown.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {receivers.map((receiver) => {
            const busy = busyId === receiver.id;
            return (
              <div key={receiver.id} className="admin-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {renamingId === receiver.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="admin-input"
                          placeholder={receiver.displayName ?? "Display name"}
                          autoFocus
                        />
                        <button type="button" className="admin-btn-primary px-3 py-2 text-sm" onClick={() => void submitRename(receiver.id)}>
                          Save
                        </button>
                        <button type="button" className="admin-btn-ghost px-3 py-2 text-sm" onClick={() => setRenamingId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="truncate text-xl font-black admin-text-emphasis">{receiver.displayName ?? "Unnamed Display"}</p>
                    )}
                    <p className="mt-1 text-sm text-admin-muted">
                      Showing: <span className="font-semibold admin-text-emphasis">{screenLabel(receiver.activeScreen)}</span>
                    </p>
                    <p className="text-xs text-admin-muted">Last seen {timeAgo(receiver.lastSeenAt)}</p>
                  </div>
                  <StatusPill online={receiver.online} />
                </div>

                {!receiver.paired ? (
                  <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    Waiting to pair — code <span className="font-mono font-bold">{receiver.pairingCode}</span>
                    {receiver.pairingExpired ? " (expired, refresh the display)" : ""}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button type="button" className="admin-btn-secondary flex h-12 items-center justify-center gap-1.5 font-bold" disabled={busy} onClick={() => void runCommand(receiver.id, "CAST_LOBBY")}>
                    <Tv className="h-4 w-4" /> Lobby
                  </button>
                  <button type="button" className="admin-btn-secondary flex h-12 items-center justify-center gap-1.5 font-bold" disabled={busy} onClick={() => void runCommand(receiver.id, "CAST_STAFF")}>
                    <MonitorPlay className="h-4 w-4" /> Staff
                  </button>
                  <button type="button" className="admin-btn-secondary flex h-12 items-center justify-center gap-1.5 font-bold" disabled={busy} onClick={() => void runCommand(receiver.id, "REFRESH")}>
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </button>
                  <button type="button" className="admin-btn-secondary flex h-12 items-center justify-center gap-1.5 font-bold" disabled={busy} onClick={() => void runCommand(receiver.id, "BLACKOUT")}>
                    <Moon className="h-4 w-4" /> Blackout
                  </button>
                  <button type="button" className="admin-btn-secondary flex h-12 items-center justify-center gap-1.5 font-bold" disabled={busy} onClick={() => void runCommand(receiver.id, "WAKE")}>
                    <Power className="h-4 w-4" /> Wake
                  </button>
                  <button type="button" className="admin-btn-secondary flex h-12 items-center justify-center gap-1.5 font-bold" disabled={busy} onClick={() => void runCommand(receiver.id, "STANDBY")}>
                    <Pause className="h-4 w-4" /> Standby
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="admin-btn-ghost flex items-center gap-1.5 text-sm"
                    disabled={busy}
                    onClick={() => {
                      setRenamingId(receiver.id);
                      setRenameValue(receiver.displayName ?? "");
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Rename
                  </button>
                  {confirmRemoveId === receiver.id ? (
                    <>
                      <button type="button" className="admin-btn-danger flex items-center gap-1.5 text-sm" disabled={busy} onClick={() => void removeDisplay(receiver.id)}>
                        <Trash2 className="h-4 w-4" /> Confirm remove
                      </button>
                      <button type="button" className="admin-btn-ghost text-sm" onClick={() => setConfirmRemoveId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="admin-btn-ghost flex items-center gap-1.5 text-sm text-red-300" disabled={busy} onClick={() => setConfirmRemoveId(receiver.id)}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
