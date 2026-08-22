"use client";

import { readResponseJson } from "@/lib/http/read-response-json";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, MessageSquare, RefreshCw, ShieldOff } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { OwnerSmsEventRow, OwnerTrackingRow } from "@/lib/route-generator/owner-tracking-admin";

type Summary = {
  total: number;
  smsEnabled: number;
  linkSent: number;
  missingPhone: number;
  notified30: number;
  notified15: number;
  notifiedPullup: number;
  active: number;
};

type Props = {
  operatingDate: string;
  planId?: string | null;
  busy?: boolean;
  onBusy?: (busy: boolean) => void;
};

function formatPt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function stampBadge(label: string, at: string | null) {
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
        at ? "bg-emerald-500/15 text-emerald-200" : "bg-white/5 text-admin-muted"
      }`}
      title={at ? formatPt(at) : "Not sent"}
    >
      {label}
      {at ? " ✓" : ""}
    </span>
  );
}

function kindLabel(kind: string) {
  switch (kind) {
    case "link":
      return "Track link";
    case "resend_link":
      return "Resend link";
    case "eta_30":
      return "ETA ~30m";
    case "eta_15":
      return "ETA ~15m";
    case "pullup":
      return "Pulling up";
    case "enable_alerts":
      return "Alerts on";
    case "disable_alerts":
      return "Alerts off";
    case "clear_notified":
      return "Cleared stamp";
    case "cancel":
      return "Cancelled";
    default:
      return kind;
  }
}

export function RouteGeneratorTrackingTab({ operatingDate, planId, busy, onBusy }: Props) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OwnerTrackingRow[]>([]);
  const [events, setEvents] = useState<OwnerSmsEventRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [van, setVan] = useState("");
  const [direction, setDirection] = useState("");
  const [status, setStatus] = useState("");
  const [sms, setSms] = useState<"all" | "enabled" | "disabled">("all");
  const [link, setLink] = useState<"all" | "sent" | "not_sent" | "missing_phone">("all");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: "tracking", date: operatingDate });
      if (planId) params.set("planId", planId);
      if (van) params.set("van", van);
      if (direction) params.set("direction", direction);
      if (status) params.set("status", status);
      if (sms !== "all") params.set("sms", sms);
      if (link !== "all") params.set("link", link);
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/admin/route-generator?${params}`, { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Unable to load tracking.");
      setRows(body.rows ?? []);
      setEvents(body.events ?? []);
      setSummary(body.summary ?? null);
      if (selectedId && !(body.rows ?? []).some((r: OwnerTrackingRow) => r.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load tracking.", "error");
    } finally {
      setLoading(false);
    }
  }, [operatingDate, planId, van, direction, status, sms, link, q, selectedId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId]
  );

  async function postAction(action: string, payload: Record<string, unknown>) {
    onBusy?.(true);
    try {
      const response = await fetch("/api/admin/route-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Request failed.");
      showToast(body.message || "Updated.", "success");
      await load();
      return body;
    } catch (error) {
      // Toast once here; callers may inspect the error for quiet-hours force-send.
      if (!(error instanceof Error && /already toasted/i.test(error.message))) {
        showToast(error instanceof Error ? error.message : "Request failed.", "error");
      }
      throw error;
    } finally {
      onBusy?.(false);
    }
  }

  async function resendTrackingLink(row: OwnerTrackingRow, forceQuietHours = false) {
    if (
      !window.confirm(
        "Resend tracking text?\n\nThis will send another SMS to the client and may incur Twilio charges.\n\nContinue?"
      )
    ) {
      return;
    }
    setResendingId(row.id);
    try {
      await postAction("tracking_resend_link", {
        trackingId: row.id,
        forceQuietHours
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!forceQuietHours && /8:00 PM|quiet|overnight|6:00 AM/i.test(message)) {
        if (
          window.confirm(
            `${message}\n\nForce-send anyway? This will bill another SMS. Only use in a real emergency.`
          )
        ) {
          await resendTrackingLink(row, true);
        }
      }
    } finally {
      setResendingId(null);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Track link copied.", "success");
    } catch {
      showToast("Could not copy link.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <section className="admin-card space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <MessageSquare className="h-4 w-4" aria-hidden />
              Owner SMS & live tracking
            </h3>
            <p className="mt-1 max-w-3xl text-xs text-admin-muted">
              Monitor every stop for {operatingDate}: track links, ETA SMS stamps (30 / 15 / pull-up), alert
              opt-in, and recent Twilio send history. Real owner SMS respects 6 AM–8 PM PT and moving-van
              gates — Jasper demo SMS is permanently disabled.
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost inline-flex items-center gap-2"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {summary ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryChip label="Stops" value={summary.total} />
            <SummaryChip label="SMS alerts on" value={summary.smsEnabled} />
            <SummaryChip label="Links sent" value={summary.linkSent} />
            <SummaryChip label="Missing phone" value={summary.missingPhone} warn={summary.missingPhone > 0} />
            <SummaryChip label="ETA 30 sent" value={summary.notified30} />
            <SummaryChip label="ETA 15 sent" value={summary.notified15} />
            <SummaryChip label="Pull-up sent" value={summary.notifiedPullup} />
            <SummaryChip label="Still active" value={summary.active} />
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs text-admin-muted xl:col-span-2">
            Search
            <input
              className="admin-input mt-1 w-full"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Owner, dog, phone, address…"
            />
          </label>
          <label className="text-xs text-admin-muted">
            Van
            <select className="admin-input mt-1 w-full" value={van} onChange={(e) => setVan(e.target.value)}>
              <option value="">All</option>
              {["van_1", "van_2", "van_3", "van_5", "van_6"].map((key) => (
                <option key={key} value={key}>
                  {key.replace("van_", "Van ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-admin-muted">
            Direction
            <select
              className="admin-input mt-1 w-full"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="">All</option>
              <option value="pickup">Pickup</option>
              <option value="dropoff">Drop-off</option>
            </select>
          </label>
          <label className="text-xs text-admin-muted">
            SMS alerts
            <select
              className="admin-input mt-1 w-full"
              value={sms}
              onChange={(e) => setSms(e.target.value as typeof sms)}
            >
              <option value="all">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <label className="text-xs text-admin-muted">
            Link SMS
            <select
              className="admin-input mt-1 w-full"
              value={link}
              onChange={(e) => setLink(e.target.value as typeof link)}
            >
              <option value="all">All</option>
              <option value="sent">Sent</option>
              <option value="not_sent">Not sent</option>
              <option value="missing_phone">Missing phone</option>
            </select>
          </label>
        </div>
        <label className="block max-w-xs text-xs text-admin-muted">
          Status
          <select className="admin-input mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {["pending", "en_route", "arriving_15", "pulling_up", "arrived", "completed", "cancelled"].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              )
            )}
          </select>
        </label>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <section className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-black/30 text-admin-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Van / Dir</th>
                  <th className="px-3 py-2 font-medium">Owner / Dogs</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">SMS</th>
                  <th className="px-3 py-2 font-medium">Stamps</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && !rows.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-admin-muted">
                      Loading tracking…
                    </td>
                  </tr>
                ) : null}
                {!loading && !rows.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-admin-muted">
                      No tracking rows for this date yet. Approve a plan (optionally with owner SMS) to create
                      them.
                    </td>
                  </tr>
                ) : null}
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-admin-border/60 ${
                      selectedId === row.id ? "bg-sky-500/10" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <td className="px-3 py-2 align-top text-white">
                      <div>{row.van_key.replace("van_", "Van ")}</div>
                      <div className="text-admin-muted">{row.direction === "pickup" ? "Pickup" : "Drop-off"}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        className="text-left text-white underline-offset-2 hover:underline"
                        onClick={() => setSelectedId(row.id)}
                      >
                        {row.owner_name || "Owner"}
                      </button>
                      <div className="text-admin-muted">{row.dog_names.join(", ") || "—"}</div>
                      <div className="text-admin-muted">{row.owner_phone_e164 || "No phone"}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-white">
                      <div>{row.status}</div>
                      <div className="text-admin-muted">
                        {row.last_eta_minutes != null ? `ETA ${row.last_eta_minutes}m` : "No live ETA"}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          row.sms_alerts_enabled
                            ? "bg-sky-500/15 text-sky-200"
                            : "bg-white/5 text-admin-muted"
                        }`}
                      >
                        {row.sms_alerts_enabled ? "Alerts on" : "Alerts off"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {stampBadge("Link", row.link_sent_at)}
                        {stampBadge("30", row.notified_30_at)}
                        {stampBadge("15", row.notified_15_at)}
                        {stampBadge("Pull", row.notified_pullup_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        <a
                          className="admin-btn admin-btn--ghost !px-2 !py-1"
                          href={row.trackUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open live track"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost !px-2 !py-1"
                          title="Copy track link"
                          onClick={() => void copyLink(row.trackUrl)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost !px-2 !py-1 text-[10px]"
                          disabled={busy || resendingId === row.id || !row.owner_phone_e164}
                          onClick={() => void resendTrackingLink(row)}
                        >
                          {resendingId === row.id ? "Sending…" : "Resend SMS"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="admin-card space-y-3 p-4">
          <h4 className="text-sm font-semibold text-white">Stop detail</h4>
          {!selected ? (
            <p className="text-xs text-admin-muted">Select a stop to manage SMS alerts and review send history.</p>
          ) : (
            <>
              <div className="space-y-1 text-xs text-admin-muted">
                <p className="text-sm text-white">{selected.owner_name || "Owner"}</p>
                <p>{selected.dog_names.join(", ")}</p>
                <p>{selected.stop_address || "No address"}</p>
                <p>{selected.owner_phone_e164 || "No phone"}</p>
                <p>
                  Planned arrival: {formatPt(selected.planned_arrival_at)} · Last GPS:{" "}
                  {formatPt(selected.last_vehicle_at)}
                </p>
                <a className="inline-flex items-center gap-1 text-sky-300 underline" href={selected.trackUrl} target="_blank" rel="noreferrer">
                  Open live map <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn admin-btn--primary !text-xs"
                  disabled={busy}
                  onClick={() =>
                    void postAction("tracking_set_sms_alerts", {
                      trackingId: selected.id,
                      enabled: !selected.sms_alerts_enabled
                    })
                  }
                >
                  {selected.sms_alerts_enabled ? "Disable ETA alerts" : "Enable ETA alerts"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost !text-xs"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Clear all SMS stamps so cron can re-send when gates pass?")) return;
                    void postAction("tracking_clear_notified", { trackingId: selected.id, stage: "all" });
                  }}
                >
                  Clear SMS stamps
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost !text-xs inline-flex items-center gap-1"
                  disabled={busy || selected.status === "cancelled"}
                  onClick={() => {
                    if (!window.confirm("Cancel tracking and disable SMS for this stop?")) return;
                    void postAction("tracking_cancel", { trackingId: selected.id });
                  }}
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  Cancel stop
                </button>
              </div>

              <div>
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">
                  Recent SMS for this stop
                </h5>
                <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
                  {(selected.recentSms.length ? selected.recentSms : []).map((event) => (
                    <li
                      key={event.id}
                      className={`rounded-lg border px-2 py-1.5 ${
                        event.ok
                          ? "border-admin-border bg-black/20 text-admin-muted"
                          : "border-rose-500/40 bg-rose-500/10 text-rose-100"
                      }`}
                    >
                      <div className="flex justify-between gap-2 text-white">
                        <span>{kindLabel(event.kind)}</span>
                        <span>{formatPt(event.created_at)}</span>
                      </div>
                      <div>{event.to_e164 || "—"}</div>
                      <div className="line-clamp-2">{event.body_preview || event.error || "—"}</div>
                    </li>
                  ))}
                  {!selected.recentSms.length ? (
                    <li className="text-admin-muted">No SMS events logged yet for this stop.</li>
                  ) : null}
                </ul>
              </div>
            </>
          )}

          <div>
            <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Day SMS activity
            </h5>
            <ul className="max-h-56 space-y-2 overflow-y-auto text-xs text-admin-muted">
              {events.slice(0, 40).map((event) => (
                <li key={event.id} className="rounded-lg border border-admin-border/70 bg-black/15 px-2 py-1.5">
                  <div className="flex justify-between gap-2 text-white">
                    <span>
                      {kindLabel(event.kind)} {event.ok ? "" : "· failed"}
                    </span>
                    <span>{formatPt(event.created_at)}</span>
                  </div>
                  <div>{event.to_e164 || "—"}</div>
                </li>
              ))}
              {!events.length ? <li>No SMS activity for this date yet.</li> : null}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryChip({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? "border-amber-400/40 bg-amber-500/10" : "border-admin-border bg-black/20"}`}>
      <div className="text-[10px] uppercase tracking-wide text-admin-muted">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
