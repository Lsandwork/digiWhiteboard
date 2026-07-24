"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Stethoscope } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { SortableTh } from "@/components/admin/ui/sortable-table";
import { centsToDisplay } from "@/lib/staff/vet-visits/money";
import type { VetVisit, VetVisitSummary } from "@/lib/staff/vet-visits/types";

type ListPayload = {
  rows: VetVisit[];
  total: number;
  summary: VetVisitSummary;
  canManage?: boolean;
};

function formatWhen(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function VetVisitsPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [drawer, setDrawer] = useState<VetVisit | null>(null);
  const [q, setQ] = useState("");
  const [managementStatus, setManagementStatus] = useState("all");
  const [ownerFollowUp, setOwnerFollowUp] = useState("all");
  const [sortBy, setSortBy] = useState("occurred_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [form, setForm] = useState({
    dog_name: "",
    dog_breed: "",
    owner_name: "",
    reason: "",
    vet_clinic: "",
    reported_by: "",
    bill_total: "",
    paid_by: "fitdog",
    receipt_url: "",
    assigned_to_name: "Management",
    notes: "",
    occurred_at: ""
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        managementStatus,
        ownerFollowUp,
        sortBy,
        sortDir,
        pageSize: "50"
      });
      const res = await fetch(`/api/admin/vet-visits?${params}`, { cache: "no-store" });
      const json = (await res.json()) as ListPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load vet visits.");
      setData(json);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load vet visits.", "error");
    } finally {
      setLoading(false);
    }
  }, [q, managementStatus, ownerFollowUp, sortBy, sortDir, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSort(column: string) {
    if (sortBy === column) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(column);
      setSortDir(column.includes("at") || column.includes("cents") ? "desc" : "asc");
    }
  }

  async function createVisit() {
    try {
      const res = await fetch("/api/admin/vet-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Create failed.");
      showToast("Vet visit logged. Admin and management were alerted.", "success");
      setManualOpen(false);
      setForm({
        dog_name: "",
        dog_breed: "",
        owner_name: "",
        reason: "",
        vet_clinic: "",
        reported_by: "",
        bill_total: "",
        paid_by: "fitdog",
        receipt_url: "",
        assigned_to_name: "Management",
        notes: "",
        occurred_at: ""
      });
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Create failed.", "error");
    }
  }

  async function patchVisit(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch("/api/admin/vet-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, ...patch })
      });
      const json = (await res.json()) as { record?: VetVisit; error?: string };
      if (!res.ok) throw new Error(json.error || "Update failed.");
      if (json.record) setDrawer(json.record);
      await load();
      showToast("Vet visit updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Update failed.", "error");
    }
  }

  const summary = data?.summary;
  const inProgressPct =
    summary && summary.total > 0 ? ((summary.inProgress / summary.total) * 100).toFixed(1) : "0.0";
  const resolvedPct =
    summary && summary.total > 0 ? ((summary.resolved / summary.total) * 100).toFixed(1) : "0.0";
  const followPct =
    summary && summary.total > 0 ? ((summary.followUpRequired / summary.total) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black admin-text-emphasis">
            <Stethoscope className="h-6 w-6 text-fitdog-orange" />
            Vet Visits
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-admin-muted">
            Track every reported vet visit. New entries alert Admin and Management immediately.
            Management must complete owner follow-up after each visit.
          </p>
        </div>
        <button
          type="button"
          className="crossover-btn crossover-btn--primary"
          disabled={!data?.canManage}
          onClick={() => setManualOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Vet Visit
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total Vet Visits", value: summary?.total ?? "—", hint: "All time" },
          { label: "In Progress", value: summary?.inProgress ?? "—", hint: `${inProgressPct}% of total` },
          { label: "Resolved", value: summary?.resolved ?? "—", hint: `${resolvedPct}% of total` },
          {
            label: "Follow-Up Required",
            value: summary?.followUpRequired ?? "—",
            hint: `${followPct}% of total`
          },
          { label: "Alert Status", value: "Active", hint: "Admin + Management notified" }
        ].map((card) => (
          <div key={card.label} className="crossover-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-black admin-text-emphasis">{card.value}</p>
            <p className="mt-1 text-xs text-admin-muted">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
        All vet visit entries trigger immediate in-app alerts to Admin and Management. Management
        follow-up with the pet owner is required after every vet visit.
      </div>

      <div className="crossover-card p-4">
        <div className="mb-4 grid gap-2 md:grid-cols-3">
          <input
            className="admin-input"
            placeholder="Search vet visits..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="admin-input"
            value={managementStatus}
            onChange={(e) => setManagementStatus(e.target.value)}
          >
            <option value="all">All management statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <select
            className="admin-input"
            value={ownerFollowUp}
            onChange={(e) => setOwnerFollowUp(e.target.value)}
          >
            <option value="all">All owner follow-ups</option>
            <option value="pending">Pending</option>
            <option value="due">Due</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr className="text-left text-admin-muted">
                <SortableTh label="Visit ID" column="visit_number" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Date / Time" column="occurred_at" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Dog(s)" column="dog_name" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Reason" column="reason" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Vet Clinic" column="vet_clinic" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Bill" column="bill_total_cents" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Paid By" column="paid_by" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Owner Follow-Up" column="owner_follow_up_status" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Management Status" column="management_status" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <th className="px-3 py-3">Latest Update</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-admin-muted">
                    Loading vet visits…
                  </td>
                </tr>
              ) : (data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-admin-muted">
                    No vet visits yet. Click Add Vet Visit to log the first one.
                  </td>
                </tr>
              ) : (
                (data?.rows ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-[var(--border)] hover:bg-white/5"
                    onClick={() => setDrawer(row)}
                  >
                    <td className="px-3 py-3 font-semibold admin-text-emphasis">{row.visit_number}</td>
                    <td className="px-3 py-3">{formatWhen(row.occurred_at)}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold admin-text-emphasis">
                        {row.dog_name}
                        {row.dog_breed ? ` (${row.dog_breed})` : ""}
                      </div>
                      <div className="text-xs text-admin-muted">{row.owner_name}</div>
                    </td>
                    <td className="px-3 py-3">{row.reason}</td>
                    <td className="px-3 py-3">{row.vet_clinic || "—"}</td>
                    <td className="px-3 py-3">{centsToDisplay(row.bill_total_cents)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          row.paid_by === "fitdog"
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                            : "border-sky-400/40 bg-sky-500/15 text-sky-100"
                        }`}
                      >
                        {row.paid_by === "fitdog" ? "Fitdog" : "Owner"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.owner_follow_up_status === "completed" ? (
                        <span className="text-emerald-200">
                          Done {row.owner_follow_up_completed_at ? formatWhen(row.owner_follow_up_completed_at) : ""}
                        </span>
                      ) : (
                        <span className="text-orange-200">
                          Due {row.owner_follow_up_due_at ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          row.management_status === "resolved"
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                            : "border-orange-400/40 bg-orange-500/15 text-orange-100"
                        }`}
                      >
                        {row.management_status === "resolved" ? "Resolved" : "In Progress"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-admin-muted">{row.latest_update || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={manualOpen} title="Add vet visit" onClose={() => setManualOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["dog_name", "Dog name"],
              ["dog_breed", "Breed"],
              ["owner_name", "Owner"],
              ["reason", "Reason"],
              ["vet_clinic", "Vet clinic"],
              ["reported_by", "Reported by"],
              ["bill_total", "Bill total"],
              ["receipt_url", "Receipt / PDF URL"],
              ["assigned_to_name", "Assigned to"]
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm">
              <span className="admin-label">{label}</span>
              <input
                className="admin-input"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            <span className="admin-label">Paid by</span>
            <select
              className="admin-input"
              value={form.paid_by}
              onChange={(e) => setForm((f) => ({ ...f, paid_by: e.target.value }))}
            >
              <option value="fitdog">Fitdog</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="admin-label">Date / time</span>
            <input
              type="datetime-local"
              className="admin-input"
              value={form.occurred_at}
              onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="admin-label">Notes</span>
            <textarea
              className="crossover-input min-h-24"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setManualOpen(false)}>
            Cancel
          </button>
          <button type="button" className="crossover-btn crossover-btn--primary" onClick={() => void createVisit()}>
            Save & alert management
          </button>
        </div>
      </Modal>

      {drawer ? (
        <div className="admin-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-lg font-black admin-text-emphasis">{drawer.visit_number}</h3>
              <p className="text-sm text-admin-muted">
                {drawer.dog_name} · {drawer.reason}
              </p>
            </div>
            <div className="mb-4 grid gap-2 text-sm">
              <p>
                <span className="text-admin-muted">Owner:</span> {drawer.owner_name}
              </p>
              <p>
                <span className="text-admin-muted">When:</span> {formatWhen(drawer.occurred_at)}
              </p>
              <p>
                <span className="text-admin-muted">Clinic:</span> {drawer.vet_clinic || "—"}
              </p>
              <p>
                <span className="text-admin-muted">Reported by:</span> {drawer.reported_by}
              </p>
              <p>
                <span className="text-admin-muted">Bill:</span> {centsToDisplay(drawer.bill_total_cents)} (
                {drawer.paid_by})
              </p>
              {drawer.receipt_url ? (
                <p>
                  <a
                    href={drawer.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sky-300 underline"
                  >
                    {drawer.receipt_label || "View receipt"}
                  </a>
                </p>
              ) : null}
              <p>
                <span className="text-admin-muted">Notes:</span> {drawer.notes || "—"}
              </p>
            </div>
            {data?.canManage ? (
              <div className="grid gap-2">
                <label className="grid gap-1 text-sm">
                  <span className="admin-label">Management status</span>
                  <select
                    className="admin-input"
                    value={drawer.management_status}
                    onChange={(e) => void patchVisit(drawer.id, { management_status: e.target.value })}
                  >
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="admin-label">Owner follow-up</span>
                  <select
                    className="admin-input"
                    value={drawer.owner_follow_up_status}
                    onChange={(e) => void patchVisit(drawer.id, { owner_follow_up_status: e.target.value })}
                  >
                    <option value="pending">Pending</option>
                    <option value="due">Due</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="admin-label">Assigned to</span>
                  <input
                    className="admin-input"
                    defaultValue={drawer.assigned_to_name ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (drawer.assigned_to_name ?? "")) {
                        void patchVisit(drawer.id, { assigned_to_name: e.target.value });
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}
            <button type="button" className="crossover-btn crossover-btn--ghost mt-4" onClick={() => setDrawer(null)}>
              Close
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
