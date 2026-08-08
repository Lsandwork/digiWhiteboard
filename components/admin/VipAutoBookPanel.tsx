"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Plus, RefreshCw, Search } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import {
  cadenceLabel,
  DAY_OF_WEEK_LABELS,
  formatDaysOfWeek,
  serviceKindLabel,
  VIP_CADENCE_OPTIONS,
  VIP_SERVICE_KIND_OPTIONS,
  type VipAutoBookClient,
  type VipAutoBookSummary,
  type VipCadence,
  type VipClientStatus,
  type VipDirectoryHit,
  type VipServiceKind
} from "@/lib/staff/vip-auto-book/types";

type ListPayload = {
  rows: VipAutoBookClient[];
  total: number;
  summary: VipAutoBookSummary;
  canManage?: boolean;
  latestSync?: {
    started_at?: string;
    finished_at?: string | null;
    status?: string;
    message?: string | null;
    owners_upserted?: number;
    dogs_upserted?: number;
  } | null;
};

const emptyForm = {
  ownerName: "",
  dogName: "",
  ownerEmail: "",
  ownerPhone: "",
  dogBreed: "",
  fitdogOwnerId: "",
  fitdogDogId: "",
  serviceKind: "group_class" as VipServiceKind,
  serviceName: "",
  cadence: "weekly" as VipCadence,
  daysOfWeek: [] as number[],
  monthlyWeek: "",
  preferredTime: "",
  notes: ""
};

function formatWhen(value: string | null | undefined) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function VipAutoBookPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [drawer, setDrawer] = useState<VipAutoBookClient | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | VipClientStatus>("all");
  const [cadence, setCadence] = useState<"all" | VipCadence>("all");
  const [form, setForm] = useState(emptyForm);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [dogQuery, setDogQuery] = useState("");
  const [hits, setHits] = useState<VipDirectoryHit[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        status,
        cadence,
        pageSize: "75"
      });
      const res = await fetch(`/api/admin/vip-auto-book?${params}`, { cache: "no-store" });
      const json = (await res.json()) as ListPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load VIP Auto Book.");
      setData(json);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load VIP Auto Book.", "error");
    } finally {
      setLoading(false);
    }
  }, [q, status, cadence, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const term = (dogQuery || ownerQuery).trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/vip-auto-book?action=search&q=${encodeURIComponent(term)}`, {
          cache: "no-store"
        });
        const json = (await res.json()) as { hits?: VipDirectoryHit[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Search failed.");
        if (!cancelled) setHits(json.hits ?? []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dogQuery, ownerQuery]);

  const summary = data?.summary;
  const filteredHits = useMemo(() => {
    return hits.filter((hit) => {
      if (dogQuery.trim() && hit.dogName && !hit.dogName.toLowerCase().includes(dogQuery.trim().toLowerCase())) {
        // keep owner-only rows
        if (!hit.dogName) return true;
      }
      return true;
    });
  }, [hits, dogQuery]);

  function pickHit(hit: VipDirectoryHit) {
    setForm((prev) => ({
      ...prev,
      ownerName: hit.ownerName || prev.ownerName,
      dogName: hit.dogName || prev.dogName,
      ownerEmail: hit.ownerEmail || prev.ownerEmail,
      ownerPhone: hit.ownerPhone || prev.ownerPhone,
      dogBreed: hit.dogBreed || prev.dogBreed,
      fitdogOwnerId: hit.fitdogOwnerId || prev.fitdogOwnerId,
      fitdogDogId: hit.fitdogDogId || prev.fitdogDogId
    }));
    setOwnerQuery(hit.ownerName || ownerQuery);
    setDogQuery(hit.dogName || dogQuery);
    setHits([]);
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      const has = prev.daysOfWeek.includes(day);
      return {
        ...prev,
        daysOfWeek: has ? prev.daysOfWeek.filter((value) => value !== day) : [...prev.daysOfWeek, day].sort((a, b) => a - b)
      };
    });
  }

  async function createClient() {
    try {
      const res = await fetch("/api/admin/vip-auto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ...form,
          monthlyWeek: form.monthlyWeek ? Number(form.monthlyWeek) : null
        })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save VIP client.");
      showToast("VIP Auto Book client saved.", "success");
      setManualOpen(false);
      setForm(emptyForm);
      setOwnerQuery("");
      setDogQuery("");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save VIP client.", "error");
    }
  }

  async function patchClient(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch("/api/admin/vip-auto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, ...patch })
      });
      const json = (await res.json()) as { record?: VipAutoBookClient; error?: string };
      if (!res.ok) throw new Error(json.error || "Update failed.");
      if (json.record) setDrawer(json.record);
      await load();
      showToast("VIP client updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Update failed.", "error");
    }
  }

  async function runDirectorySync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/vip-auto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_directory" })
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || json.message || "Directory sync failed.");
      showToast(json.message || "Fitdog directory synced.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Directory sync failed.", "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black admin-text-emphasis">
            <Crown className="h-6 w-6 text-fitdog-orange" />
            VIP Auto Book
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-admin-muted">
            Track clients who always want their dogs booked on{" "}
            <a className="text-fitdog-orange underline" href="https://app.fitdog.com" target="_blank" rel="noreferrer">
              app.fitdog.com
            </a>{" "}
            for classes, hikes, and excursions (weekly or monthly). Type a dog or owner name to pick from the Fitdog
            directory (daily pull).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="crossover-btn crossover-btn--secondary"
            disabled={syncing || !data?.canManage}
            onClick={() => void runDirectorySync()}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync Fitdog Directory
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={!data?.canManage}
            onClick={() => {
              setForm(emptyForm);
              setOwnerQuery("");
              setDogQuery("");
              setManualOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add VIP Client
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total VIP Clients", value: summary?.total ?? "—" },
          { label: "Active", value: summary?.active ?? "—" },
          { label: "Paused", value: summary?.paused ?? "—" },
          { label: "Weekly Cadence", value: summary?.weekly ?? "—" },
          { label: "Monthly Cadence", value: summary?.monthly ?? "—" }
        ].map((card) => (
          <div key={card.label} className="crossover-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-black admin-text-emphasis">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-50">
        Directory last sync: {formatWhen(data?.latestSync?.finished_at || data?.latestSync?.started_at)} ·{" "}
        {data?.latestSync?.message || "Run Sync Fitdog Directory (or wait for the daily cron) so owner/dog names pop up while typing."}
      </div>

      <div className="crossover-card p-4">
        <div className="mb-4 grid gap-2 md:grid-cols-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
            <input
              className="admin-input w-full pl-9"
              placeholder="Search VIP list…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </label>
          <select className="admin-input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="admin-input" value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)}>
            <option value="all">All cadences</option>
            {VIP_CADENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="crossover-table w-full min-w-[1100px]">
            <thead>
              <tr>
                <th>Dog</th>
                <th>Owner</th>
                <th>Repeat Classes / Service</th>
                <th>Days Booked</th>
                <th>Platform</th>
                <th>Last Day Booked?</th>
                <th>Need to Re-Book?</th>
                <th>PU</th>
                <th>DO</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer ${
                    row.needToRebook
                      ? "bg-amber-500/20 ring-1 ring-inset ring-amber-400/50 [&_td]:bg-amber-500/10"
                      : ""
                  }`}
                  onClick={() => setDrawer(row)}
                >
                  <td className={row.needToRebook ? "text-base font-bold text-amber-100 sm:text-lg" : "font-semibold"}>
                    {row.dogName}
                  </td>
                  <td>{row.ownerName}</td>
                  <td>{row.serviceName || serviceKindLabel(row.serviceKind)}</td>
                  <td>
                    {row.daysBookedLabel ||
                      (row.cadence === "monthly"
                        ? row.monthlyWeek
                          ? `Week ${row.monthlyWeek}`
                          : "Monthly"
                        : formatDaysOfWeek(row.daysOfWeek))}
                  </td>
                  <td>{row.platform || "APP"}</td>
                  <td>
                    {row.lastBookedFor
                      ? new Date(`${row.lastBookedFor}T12:00:00`).toLocaleDateString("en-US", {
                          month: "2-digit",
                          day: "2-digit"
                        })
                      : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`crossover-btn px-3 py-1 text-xs ${
                        row.needToRebook
                          ? "crossover-btn--primary border-amber-400 bg-amber-500 text-black hover:bg-amber-400"
                          : "crossover-btn--secondary"
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void patchClient(row.id, { needToRebook: !row.needToRebook });
                      }}
                    >
                      {row.needToRebook ? "Yes" : "No"} ▾
                    </button>
                  </td>
                  <td>{row.pickupLocation || "—"}</td>
                  <td>{row.dropoffLocation || "—"}</td>
                </tr>
              ))}
              {!loading && !(data?.rows ?? []).length ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-admin-muted">
                    No VIP Auto Book clients yet. Add one and choose weekly/monthly class, hike, or excursion.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {loading ? <p className="mt-3 text-sm text-admin-muted">Loading…</p> : null}
      </div>

      <Modal
        open={manualOpen}
        title="Add VIP Auto Book client"
        description="Type dog or owner — matches from the Fitdog Sports directory will appear. Then set class/hike/excursion and weekly or monthly cadence."
        onClose={() => setManualOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </button>
            <button type="button" className="admin-btn-primary" onClick={() => void createClient()}>
              Save VIP Client
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Dog name</span>
              <input
                className="admin-input w-full"
                value={dogQuery || form.dogName}
                onChange={(event) => {
                  setDogQuery(event.target.value);
                  setForm((prev) => ({ ...prev, dogName: event.target.value, fitdogDogId: "" }));
                }}
                placeholder="Start typing dog name…"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Owner name</span>
              <input
                className="admin-input w-full"
                value={ownerQuery || form.ownerName}
                onChange={(event) => {
                  setOwnerQuery(event.target.value);
                  setForm((prev) => ({ ...prev, ownerName: event.target.value, fitdogOwnerId: "" }));
                }}
                placeholder="Start typing owner name…"
              />
            </label>
          </div>

          {searching || filteredHits.length ? (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-admin-border bg-black/20">
              {searching ? <p className="px-3 py-2 text-xs text-admin-muted">Searching Fitdog directory…</p> : null}
              {filteredHits.map((hit, index) => (
                <button
                  key={`${hit.fitdogDogId || "x"}-${hit.fitdogOwnerId || "y"}-${index}`}
                  type="button"
                  className="block w-full border-b border-admin-border/50 px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => pickHit(hit)}
                >
                  <p className="text-sm font-semibold text-white">
                    {hit.dogName || "Dog TBD"} <span className="text-admin-muted">·</span> {hit.ownerName || "Owner TBD"}
                  </p>
                  <p className="text-xs text-admin-muted">
                    {hit.source === "fitdog_directory" ? "From app.fitdog.com directory" : "Already on VIP list"}
                    {hit.ownerPhone ? ` · ${hit.ownerPhone}` : ""}
                  </p>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Service type</span>
              <select
                className="admin-input w-full"
                value={form.serviceKind}
                onChange={(event) => setForm((prev) => ({ ...prev, serviceKind: event.target.value as VipServiceKind }))}
              >
                {VIP_SERVICE_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Class / hike name</span>
              <input
                className="admin-input w-full"
                value={form.serviceName}
                onChange={(event) => setForm((prev) => ({ ...prev, serviceName: event.target.value }))}
                placeholder="e.g. Tuesday Adventure Hike"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Cadence</span>
              <select
                className="admin-input w-full"
                value={form.cadence}
                onChange={(event) => setForm((prev) => ({ ...prev, cadence: event.target.value as VipCadence }))}
              >
                {VIP_CADENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Preferred time</span>
              <input
                className="admin-input w-full"
                value={form.preferredTime}
                onChange={(event) => setForm((prev) => ({ ...prev, preferredTime: event.target.value }))}
                placeholder="e.g. 7:00 AM"
              />
            </label>
          </div>

          {form.cadence === "weekly" || form.cadence === "custom" ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-admin-muted">Days of week</p>
              <div className="flex flex-wrap gap-2">
                {DAY_OF_WEEK_LABELS.map((label, day) => {
                  const on = form.daysOfWeek.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`crossover-urgent-pill ${on ? "crossover-urgent-pill--on" : ""}`}
                      onClick={() => toggleDay(day)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <label className="block max-w-xs">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Week of month (1–4)</span>
              <input
                className="admin-input w-full"
                value={form.monthlyWeek}
                onChange={(event) => setForm((prev) => ({ ...prev, monthlyWeek: event.target.value }))}
                placeholder="1"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Notes</span>
            <textarea
              className="admin-input min-h-[90px] w-full"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Always book Indy for Tuesday hike unless owner texts otherwise…"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(drawer)}
        title={drawer ? `${drawer.dogName} · ${drawer.ownerName}` : "VIP client"}
        description={drawer ? `${serviceKindLabel(drawer.serviceKind)} · ${cadenceLabel(drawer.cadence)}` : undefined}
        onClose={() => setDrawer(null)}
        footer={
          drawer ? (
            <div className="flex flex-wrap justify-end gap-2">
              {drawer.status === "active" ? (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => void patchClient(drawer.id, { status: "paused" })}
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => void patchClient(drawer.id, { status: "active" })}
                >
                  Activate
                </button>
              )}
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => void patchClient(drawer.id, { status: "cancelled" })}
              >
                Cancel VIP
              </button>
              <button type="button" className="admin-btn-primary" onClick={() => setDrawer(null)}>
                Close
              </button>
            </div>
          ) : null
        }
      >
        {drawer ? (
          <div className="space-y-3 text-sm text-admin-muted">
            <p>
              <span className="font-semibold text-white">Service:</span> {drawer.serviceName || serviceKindLabel(drawer.serviceKind)}
            </p>
            <p>
              <span className="font-semibold text-white">Days booked:</span>{" "}
              {drawer.daysBookedLabel ||
                (drawer.cadence === "monthly"
                  ? `Monthly${drawer.monthlyWeek ? ` · week ${drawer.monthlyWeek}` : ""}`
                  : formatDaysOfWeek(drawer.daysOfWeek))}
              {drawer.preferredTime ? ` · ${drawer.preferredTime}` : ""}
            </p>
            <p>
              <span className="font-semibold text-white">Platform:</span> {drawer.platform || "APP"} ·{" "}
              <span className="font-semibold text-white">Last booked:</span> {drawer.lastBookedFor || "—"} ·{" "}
              <span className="font-semibold text-white">Re-book:</span> {drawer.needToRebook ? "Yes" : "No"}
            </p>
            <p>
              <span className="font-semibold text-white">PU / DO:</span> {drawer.pickupLocation || "—"} /{" "}
              {drawer.dropoffLocation || "—"}
            </p>
            <p>
              <span className="font-semibold text-white">Contact:</span> {drawer.ownerPhone || "—"} · {drawer.ownerEmail || "—"}
            </p>
            <p>
              <span className="font-semibold text-white">Fitdog IDs:</span> owner {drawer.fitdogOwnerId || "—"} · dog{" "}
              {drawer.fitdogDogId || "—"}
            </p>
            <p>
              <span className="font-semibold text-white">Notes:</span> {drawer.notes || "—"}
            </p>
            <p className="text-xs">Added {formatWhen(drawer.createdAt)} by {drawer.createdByName || "staff"}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
