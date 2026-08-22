"use client";

import { readResponseJson } from "@/lib/http/read-response-json";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
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
  latestGingrSync?: {
    started_at?: string;
    finished_at?: string | null;
    status?: string;
    message?: string | null;
    clients_confirmed?: number;
    clients_corrected?: number;
    clients_unmatched?: number;
  } | null;
};

function vipBookStatusLabel(status: string | null | undefined) {
  if (status === "gingr_confirmed" || status === "fitdog_confirmed") return "Confirmed";
  if (status === "gingr_corrected" || status === "fitdog_corrected") return "Corrected";
  if (status === "gingr_no_reservations") return "No Gingr match";
  if (status === "fitdog_no_bookings") return "No Fitdog match";
  return null;
}

function vipDaysLabel(row: VipAutoBookClient) {
  return (
    row.daysBookedLabel ||
    (row.cadence === "monthly"
      ? row.monthlyWeek
        ? `Week ${row.monthlyWeek}`
        : "Monthly"
      : formatDaysOfWeek(row.daysOfWeek))
  );
}

function vipLastBookedLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

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
  platform: "APP",
  pickupLocation: "",
  dropoffLocation: "",
  daysBookedLabel: "",
  status: "active" as VipClientStatus,
  notes: ""
};

function formFromRow(row: VipAutoBookClient): typeof emptyForm {
  return {
    ownerName: row.ownerName || "",
    dogName: row.dogName || "",
    ownerEmail: row.ownerEmail || "",
    ownerPhone: row.ownerPhone || "",
    dogBreed: row.dogBreed || "",
    fitdogOwnerId: row.fitdogOwnerId || "",
    fitdogDogId: row.fitdogDogId || "",
    serviceKind: row.serviceKind,
    serviceName: row.serviceName || "",
    cadence: row.cadence,
    daysOfWeek: [...(row.daysOfWeek || [])],
    monthlyWeek: row.monthlyWeek != null ? String(row.monthlyWeek) : "",
    preferredTime: row.preferredTime || "",
    platform: row.platform || "APP",
    pickupLocation: row.pickupLocation || "",
    dropoffLocation: row.dropoffLocation || "",
    daysBookedLabel: row.daysBookedLabel || "",
    status: row.status,
    notes: row.notes || ""
  };
}

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
  const [gingrSyncing, setGingrSyncing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VipAutoBookClient | null>(null);
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
      const json = (await readResponseJson(res)) as ListPayload & { error?: string };
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
        const json = (await readResponseJson(res)) as { hits?: VipDirectoryHit[]; error?: string };
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
  const canManage = Boolean(data?.canManage);
  const filteredHits = useMemo(() => {
    return hits.filter((hit) => {
      if (dogQuery.trim() && hit.dogName && !hit.dogName.toLowerCase().includes(dogQuery.trim().toLowerCase())) {
        // keep owner-only rows
        if (!hit.dogName) return true;
      }
      return true;
    });
  }, [hits, dogQuery]);

  function resetFormState() {
    setForm(emptyForm);
    setOwnerQuery("");
    setDogQuery("");
    setHits([]);
    setEditingId(null);
  }

  function openCreate() {
    resetFormState();
    setManualOpen(true);
  }

  function openEdit(row: VipAutoBookClient) {
    setEditingId(row.id);
    setForm(formFromRow(row));
    setOwnerQuery(row.ownerName || "");
    setDogQuery(row.dogName || "");
    setHits([]);
    setDrawer(null);
    setManualOpen(true);
  }

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

  async function saveClient() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        monthlyWeek: form.monthlyWeek ? Number(form.monthlyWeek) : null
      };
      const res = await fetch("/api/admin/vip-auto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { action: "update", id: editingId, ...payload }
            : { action: "create", ...payload }
        )
      });
      const json = (await readResponseJson(res)) as { error?: string };
      if (!res.ok) throw new Error(json.error || (editingId ? "Could not update VIP client." : "Could not save VIP client."));
      showToast(editingId ? "VIP client updated." : "VIP Auto Book client saved.", "success");
      setManualOpen(false);
      resetFormState();
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save VIP client.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function patchClient(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch("/api/admin/vip-auto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, ...patch })
      });
      const json = (await readResponseJson(res)) as { record?: VipAutoBookClient; error?: string };
      if (!res.ok) throw new Error(json.error || "Update failed.");
      if (json.record) setDrawer(json.record);
      await load();
      showToast("VIP client updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Update failed.", "error");
    }
  }

  async function deleteClient() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/vip-auto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deleteTarget.id })
      });
      const json = (await readResponseJson(res)) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not delete VIP client.");
      showToast("VIP client deleted.", "success");
      if (drawer?.id === deleteTarget.id) setDrawer(null);
      setDeleteTarget(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete VIP client.", "error");
    } finally {
      setDeleting(false);
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
      const json = (await readResponseJson(res)) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || json.message || "Directory sync failed.");
      showToast(json.message || "Fitdog directory synced.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Directory sync failed.", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function runGingrSync() {
    setGingrSyncing(true);
    try {
      const res = await fetch("/api/admin/vip-auto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_gingr" })
      });
      const json = (await readResponseJson(res)) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || json.message || "Gingr sync failed.");
      showToast(json.message || "Gingr last-day booked synced.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Gingr sync failed.", "error");
    } finally {
      setGingrSyncing(false);
    }
  }

  function RowActions({ row }: { row: VipAutoBookClient }) {
    if (!canManage) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="admin-icon-btn"
          aria-label={`Edit ${row.dogName}`}
          title="Edit"
          onClick={(event) => {
            event.stopPropagation();
            openEdit(row);
          }}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="admin-icon-btn"
          aria-label={`Delete ${row.dogName}`}
          title="Delete"
          onClick={(event) => {
            event.stopPropagation();
            setDeleteTarget(row);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
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
            disabled={syncing || gingrSyncing || !canManage}
            onClick={() => void runDirectorySync()}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync Fitdog Directory
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--secondary"
            disabled={syncing || gingrSyncing || !canManage}
            onClick={() => void runGingrSync()}
          >
            <RefreshCw className={`h-4 w-4 ${gingrSyncing ? "animate-spin" : ""}`} />
            Sync Gingr Bookings
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={!canManage}
            onClick={openCreate}
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

      <div className="space-y-2">
        <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-50">
          Fitdog directory / last-day sync:{" "}
          {formatWhen(data?.latestSync?.finished_at || data?.latestSync?.started_at)} ·{" "}
          {data?.latestSync?.message ||
            "Run Sync Fitdog Directory to pull app.fitdog.com names and confirm Last Day Booked (clears Re-book Needed when booked ahead)."}
        </div>
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
          Gingr last-day sync:{" "}
          {formatWhen(data?.latestGingrSync?.finished_at || data?.latestGingrSync?.started_at)} ·{" "}
          {data?.latestGingrSync?.message ||
            "Run Sync Gingr Bookings to confirm or correct Last Day Booked from Gingr reservations."}
        </div>
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

        {/* Mobile: stacked cards — never crush table columns on small screens */}
        <div className="vip-auto-book-mobile md:hidden">
          {(data?.rows ?? []).map((row) => {
            const gingrLabel = vipBookStatusLabel(row.lastBookStatus);
            return (
              <article
                key={row.id}
                className={`vip-auto-book-mobile__card ${row.needToRebook ? "vip-auto-book-mobile__card--alert" : ""}`}
                onClick={() => setDrawer(row)}
              >
                <div className="vip-auto-book-mobile__head">
                  <div className="min-w-0">
                    <h3 className="vip-auto-book-mobile__dog">{row.dogName}</h3>
                    <p className="vip-auto-book-mobile__owner">{row.ownerName}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      className={`crossover-btn vip-auto-book-table__rebook-btn ${
                        row.needToRebook
                          ? "crossover-btn--primary border-amber-400 bg-amber-500 text-black hover:bg-amber-400"
                          : "crossover-btn--secondary"
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void patchClient(row.id, { needToRebook: !row.needToRebook });
                      }}
                    >
                      {row.needToRebook ? "Re-book: Yes" : "Re-book: No"}
                    </button>
                    <RowActions row={row} />
                  </div>
                </div>

                <dl className="vip-auto-book-mobile__grid">
                  <div>
                    <dt>Service</dt>
                    <dd>{row.serviceName || serviceKindLabel(row.serviceKind)}</dd>
                  </div>
                  <div>
                    <dt>Platform</dt>
                    <dd>{row.platform || "APP"}</dd>
                  </div>
                  <div>
                    <dt>Schedule</dt>
                    <dd>
                      {vipDaysLabel(row)} · {cadenceLabel(row.cadence)}
                    </dd>
                  </div>
                  <div>
                    <dt>Last booked</dt>
                    <dd>
                      {vipLastBookedLabel(row.lastBookedFor)}
                      {gingrLabel ? ` · ${gingrLabel}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Pickup</dt>
                    <dd>{row.pickupLocation || "—"}</dd>
                  </div>
                  <div>
                    <dt>Drop-off</dt>
                    <dd>{row.dropoffLocation || "—"}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
          {!loading && !(data?.rows ?? []).length ? (
            <p className="py-8 text-center text-sm text-admin-muted">
              No VIP Auto Book clients yet. Add one and choose weekly/monthly class, hike, or excursion.
            </p>
          ) : null}
        </div>

        {/* Desktop / tablet: full table */}
        <div className="vip-auto-book-table-wrap hidden md:block">
          <table className="crossover-table vip-auto-book-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Service</th>
                <th>Schedule</th>
                <th>Last booked</th>
                <th>Re-book</th>
                <th>PU / DO</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => {
                const gingrLabel = vipBookStatusLabel(row.lastBookStatus);
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer ${row.needToRebook ? "vip-auto-book-table__row--alert" : ""}`}
                    onClick={() => setDrawer(row)}
                  >
                    <td>
                      <p
                        className={`vip-auto-book-table__dog ${
                          row.needToRebook ? "vip-auto-book-table__dog--alert" : ""
                        }`}
                      >
                        {row.dogName}
                      </p>
                      <p className="vip-auto-book-table__meta">{row.ownerName}</p>
                    </td>
                    <td>
                      <p className="vip-auto-book-table__primary">
                        {row.serviceName || serviceKindLabel(row.serviceKind)}
                      </p>
                      <p className="vip-auto-book-table__meta">{row.platform || "APP"}</p>
                    </td>
                    <td>
                      <p className="vip-auto-book-table__primary">{vipDaysLabel(row)}</p>
                      <p className="vip-auto-book-table__meta">{cadenceLabel(row.cadence)}</p>
                    </td>
                    <td>
                      <p className="vip-auto-book-table__primary">{vipLastBookedLabel(row.lastBookedFor)}</p>
                      {gingrLabel ? (
                        <p
                          className={`vip-auto-book-table__status ${
                            row.lastBookStatus === "gingr_confirmed" ||
                            row.lastBookStatus === "fitdog_confirmed"
                              ? "vip-auto-book-table__status--ok"
                              : row.lastBookStatus === "gingr_corrected" ||
                                  row.lastBookStatus === "fitdog_corrected"
                                ? "vip-auto-book-table__status--warn"
                                : "vip-auto-book-table__status--muted"
                          }`}
                        >
                          {gingrLabel}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`crossover-btn vip-auto-book-table__rebook-btn ${
                          row.needToRebook
                            ? "crossover-btn--primary border-amber-400 bg-amber-500 text-black hover:bg-amber-400"
                            : "crossover-btn--secondary"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void patchClient(row.id, { needToRebook: !row.needToRebook });
                        }}
                      >
                        {row.needToRebook ? "Yes" : "No"}
                      </button>
                    </td>
                    <td>
                      <p className="vip-auto-book-table__primary">{row.pickupLocation || "—"}</p>
                      <p className="vip-auto-book-table__meta">{row.dropoffLocation || "—"}</p>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <RowActions row={row} />
                    </td>
                  </tr>
                );
              })}
              {!loading && !(data?.rows ?? []).length ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-admin-muted">
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
        title={editingId ? "Edit VIP Auto Book client" : "Add VIP Auto Book client"}
        description={
          editingId
            ? "Update dog/owner details, service, cadence, pickup/drop-off, or notes for this VIP row."
            : "Type dog or owner — matches from the Fitdog Sports directory will appear. Then set class/hike/excursion and weekly or monthly cadence."
        }
        onClose={() => {
          if (saving) return;
          setManualOpen(false);
          resetFormState();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={saving}
              onClick={() => {
                setManualOpen(false);
                resetFormState();
              }}
            >
              Cancel
            </button>
            <button type="button" className="admin-btn-primary" disabled={saving || !canManage} onClick={() => void saveClient()}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Save VIP Client"}
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
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Owner phone</span>
              <input
                className="admin-input w-full"
                value={form.ownerPhone}
                onChange={(event) => setForm((prev) => ({ ...prev, ownerPhone: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Owner email</span>
              <input
                className="admin-input w-full"
                value={form.ownerEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, ownerEmail: event.target.value }))}
              />
            </label>
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
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Platform</span>
              <input
                className="admin-input w-full"
                value={form.platform}
                onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value }))}
                placeholder="APP, Gingr, or Gingr / APP"
              />
            </label>
            {editingId ? (
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Status</span>
                <select
                  className="admin-input w-full"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as VipClientStatus }))}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Pickup</span>
              <input
                className="admin-input w-full"
                value={form.pickupLocation}
                onChange={(event) => setForm((prev) => ({ ...prev, pickupLocation: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Drop-off</span>
              <input
                className="admin-input w-full"
                value={form.dropoffLocation}
                onChange={(event) => setForm((prev) => ({ ...prev, dropoffLocation: event.target.value }))}
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
            <span className="mb-1 block text-xs font-bold uppercase text-admin-muted">Days booked label (optional)</span>
            <input
              className="admin-input w-full"
              value={form.daysBookedLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, daysBookedLabel: event.target.value }))}
              placeholder="Override schedule display if needed"
            />
          </label>

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
              {canManage ? (
                <>
                  <button type="button" className="admin-btn-secondary" onClick={() => openEdit(drawer)}>
                    <Pencil className="mr-1 inline h-4 w-4" />
                    Edit
                  </button>
                  <button type="button" className="admin-btn-danger" onClick={() => setDeleteTarget(drawer)}>
                    <Trash2 className="mr-1 inline h-4 w-4" />
                    Delete
                  </button>
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
                </>
              ) : null}
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
              <span className="font-semibold text-white">Last booked:</span> {drawer.lastBookedFor || "—"}
              {vipBookStatusLabel(drawer.lastBookStatus)
                ? ` (${vipBookStatusLabel(drawer.lastBookStatus)})`
                : ""}{" "}
              · <span className="font-semibold text-white">Re-book:</span> {drawer.needToRebook ? "Yes" : "No"}
            </p>
            <p>
              <span className="font-semibold text-white">Gingr verified:</span> {formatWhen(drawer.lastVerifiedAt)}
              {drawer.lastBookError ? ` · ${drawer.lastBookError}` : ""}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete VIP client?"
        description={`This permanently removes ${deleteTarget?.dogName ?? "this dog"} (${deleteTarget?.ownerName ?? "owner"}) from VIP Auto Book. This cannot be undone.`}
        confirmLabel="Delete row"
        danger
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => {
          void deleteClient();
        }}
      />
    </div>
  );
}
