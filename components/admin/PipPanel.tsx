"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { PipPlan, PipStatus } from "@/lib/hr/pip";

const emptyForm = {
  employee_name: "",
  employee_role: "",
  manager_name: "",
  focus_area: "",
  start_date: new Date().toISOString().slice(0, 10),
  next_review_date: "",
  progress_percent: 0,
  status: "Active" as PipStatus,
  notes: ""
};

export function PipPanel() {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<PipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/hr/pip", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load PIP plans.");
      setPlans(body.plans ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load PIP plans.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startEdit(plan: PipPlan) {
    setEditingId(plan.id);
    setForm({
      employee_name: plan.employee_name,
      employee_role: plan.employee_role || "",
      manager_name: plan.manager_name || "",
      focus_area: plan.focus_area,
      start_date: plan.start_date,
      next_review_date: plan.next_review_date || "",
      progress_percent: plan.progress_percent,
      status: plan.status,
      notes: plan.notes || ""
    });
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        ...form,
        employee_role: form.employee_role || null,
        manager_name: form.manager_name || null,
        next_review_date: form.next_review_date || null,
        notes: form.notes || null,
        progress_percent: Number(form.progress_percent) || 0
      };
      const response = await fetch("/api/admin/hr/pip", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save PIP plan.");
      showToast(editingId ? "PIP plan updated." : "PIP plan created.", "success");
      setEditingId(null);
      setForm(emptyForm);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save PIP plan.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="admin-page-title">Performance Improvement Plans</h2>
          <p className="admin-page-subtitle mt-1 max-w-2xl">
            Track active PIPs, review dates, and progress. These plans also power the Overview dashboard.
          </p>
        </div>
        <button type="button" className="admin-btn-secondary min-h-11" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="admin-card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{editingId ? "Edit PIP plan" : "Add PIP plan"}</h3>
          {editingId ? (
            <button
              type="button"
              className="admin-btn-ghost text-xs"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="admin-label">
            Employee name
            <input
              className="admin-input mt-1"
              value={form.employee_name}
              onChange={(e) => setForm((prev) => ({ ...prev, employee_name: e.target.value }))}
            />
          </label>
          <label className="admin-label">
            Role
            <input
              className="admin-input mt-1"
              value={form.employee_role}
              onChange={(e) => setForm((prev) => ({ ...prev, employee_role: e.target.value }))}
            />
          </label>
          <label className="admin-label">
            Manager
            <input
              className="admin-input mt-1"
              value={form.manager_name}
              onChange={(e) => setForm((prev) => ({ ...prev, manager_name: e.target.value }))}
            />
          </label>
          <label className="admin-label md:col-span-2">
            Focus area
            <input
              className="admin-input mt-1"
              value={form.focus_area}
              onChange={(e) => setForm((prev) => ({ ...prev, focus_area: e.target.value }))}
            />
          </label>
          <label className="admin-label">
            Status
            <select
              className="admin-input mt-1"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as PipStatus }))}
            >
              <option value="Active">Active</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>
          <label className="admin-label">
            Start date
            <input
              type="date"
              className="admin-input mt-1"
              value={form.start_date}
              onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
            />
          </label>
          <label className="admin-label">
            Next review
            <input
              type="date"
              className="admin-input mt-1"
              value={form.next_review_date}
              onChange={(e) => setForm((prev) => ({ ...prev, next_review_date: e.target.value }))}
            />
          </label>
          <label className="admin-label">
            Progress %
            <input
              type="number"
              min={0}
              max={100}
              className="admin-input mt-1"
              value={form.progress_percent}
              onChange={(e) => setForm((prev) => ({ ...prev, progress_percent: Number(e.target.value) }))}
            />
          </label>
          <label className="admin-label md:col-span-2 xl:col-span-3">
            Notes
            <textarea
              className="admin-input mt-1 min-h-[80px]"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>
        </div>
        <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void save()}>
          <Plus className="h-4 w-4" />
          {editingId ? "Save changes" : "Create PIP plan"}
        </button>
      </div>

      <div className="admin-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-wide text-admin-muted">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Focus</th>
                <th className="px-3 py-2">Next review</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-admin-muted">
                    Loading…
                  </td>
                </tr>
              ) : plans.length ? (
                plans.map((plan) => (
                  <tr key={plan.id} className="border-t border-admin-border/70">
                    <td className="px-3 py-2.5 font-medium text-white">{plan.employee_name}</td>
                    <td className="px-3 py-2.5 text-admin-muted">{plan.employee_role || "—"}</td>
                    <td className="px-3 py-2.5 text-admin-muted">{plan.focus_area}</td>
                    <td className="px-3 py-2.5 text-admin-muted">{plan.next_review_date || "—"}</td>
                    <td className="px-3 py-2.5 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-fitdog-orange" style={{ width: `${plan.progress_percent}%` }} />
                        </div>
                        <span className="text-xs text-admin-muted">{plan.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-admin-muted">{plan.status}</td>
                    <td className="px-3 py-2.5">
                      <button type="button" className="admin-btn-secondary min-h-9" onClick={() => startEdit(plan)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-admin-muted">
                    No PIP plans yet. Create the first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
