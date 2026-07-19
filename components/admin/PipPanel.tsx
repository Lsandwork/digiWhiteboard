"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HeartHandshake,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { PipPlan, PipStatus } from "@/lib/hr/pip";

type AiMode =
  | "draft_plan"
  | "employee_summary"
  | "check_in_coach"
  | "manager_talking_points"
  | "ca_documentation"
  | "chat";

const emptyForm = {
  employee_name: "",
  employee_role: "",
  manager_name: "",
  focus_area: "",
  goals_text: "",
  success_metrics: "",
  support_offered: "",
  employee_facing_summary: "",
  manager_notes: "",
  start_date: new Date().toISOString().slice(0, 10),
  next_review_date: "",
  target_end_date: "",
  progress_percent: 0,
  status: "Active" as PipStatus
};

function statusTone(status: PipStatus) {
  if (status === "Completed") return "text-emerald-300";
  if (status === "On Hold") return "text-amber-300";
  if (status === "Cancelled") return "text-admin-muted";
  return "text-sky-300";
}

export function PipPanel() {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<PipPlan[]>([]);
  const [reviewsThisWeek, setReviewsThisWeek] = useState<PipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkInNote, setCheckInNote] = useState("");
  const [aiReady, setAiReady] = useState(false);
  const [aiLocation, setAiLocation] = useState("California");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>("draft_plan");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/hr/pip", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load PIP plans.");
      setPlans(body.plans ?? []);
      setReviewsThisWeek(body.reviews_this_week ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load PIP plans.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadAiMeta = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/hr/pip/ai", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) return;
      setAiReady(Boolean(body.gemini_configured && body.hr_consult_enabled));
      if (body.location) setAiLocation(String(body.location));
    } catch {
      setAiReady(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadAiMeta();
  }, [refresh, loadAiMeta]);

  const selected = useMemo(() => plans.find((plan) => plan.id === selectedId) ?? null, [plans, selectedId]);
  const activeCount = plans.filter((plan) => plan.status === "Active" || plan.status === "On Hold").length;

  function startEdit(plan: PipPlan) {
    setEditingId(plan.id);
    setSelectedId(plan.id);
    setShowComposer(true);
    setForm({
      employee_name: plan.employee_name,
      employee_role: plan.employee_role || "",
      manager_name: plan.manager_name || "",
      focus_area: plan.focus_area,
      goals_text: (plan.goals || []).join("\n"),
      success_metrics: plan.success_metrics || "",
      support_offered: plan.support_offered || "",
      employee_facing_summary: plan.employee_facing_summary || "",
      manager_notes: plan.manager_notes || plan.notes || "",
      start_date: plan.start_date,
      next_review_date: plan.next_review_date || "",
      target_end_date: plan.target_end_date || "",
      progress_percent: plan.progress_percent,
      status: plan.status
    });
  }

  function startCreate() {
    setEditingId(null);
    setShowComposer(true);
    setForm(emptyForm);
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        employee_name: form.employee_name,
        employee_role: form.employee_role || null,
        manager_name: form.manager_name || null,
        focus_area: form.focus_area,
        goals: form.goals_text
          .split(/\n+/)
          .map((g) => g.trim())
          .filter(Boolean),
        success_metrics: form.success_metrics || null,
        support_offered: form.support_offered || null,
        employee_facing_summary: form.employee_facing_summary || null,
        manager_notes: form.manager_notes || null,
        start_date: form.start_date,
        next_review_date: form.next_review_date || null,
        target_end_date: form.target_end_date || null,
        progress_percent: Number(form.progress_percent) || 0,
        status: form.status
      };
      const response = await fetch("/api/admin/hr/pip", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save PIP plan.");
      showToast(editingId ? "Growth plan updated." : "Growth plan created.", "success");
      setEditingId(null);
      setShowComposer(false);
      setForm(emptyForm);
      if (body.plan?.id) setSelectedId(body.plan.id);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save PIP plan.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(id: string) {
    if (!window.confirm("Remove this PIP from the active workspace? Underlying HR records are kept.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/hr/pip?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to remove PIP.");
      showToast("PIP removed from workspace.", "success");
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to remove PIP.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addCheckIn() {
    if (!selectedId || !checkInNote.trim()) {
      showToast("Add a short check-in note first.", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/hr/pip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_check_in",
          id: selectedId,
          note: checkInNote,
          progress_percent: selected?.progress_percent ?? 0
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save check-in.");
      showToast("Check-in saved.", "success");
      setCheckInNote("");
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save check-in.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function runAi(mode: AiMode, prompt?: string) {
    setAiBusy(true);
    setAiMode(mode);
    try {
      const response = await fetch("/api/admin/hr/pip/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          message:
            prompt?.trim() ||
            aiPrompt.trim() ||
            (selected
              ? `Help with ${selected.employee_name}'s growth plan focused on ${selected.focus_area}.`
              : "Help me build a supportive PIP that protects the employer and supports the employee."),
          plan_id: selectedId,
          record_ids: selected?.source_record_ids ?? []
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "PIP AI unavailable.");
      setAiReply(String(body.reply || ""));
      const draft = body.draft_fields as Partial<{
        focus_area: string;
        goals: string[];
        success_metrics: string;
        support_offered: string;
        employee_facing_summary: string;
        manager_notes: string;
      }> | null;
      if (draft && (mode === "draft_plan" || mode === "employee_summary")) {
        setShowComposer(true);
        setForm((prev) => ({
          ...prev,
          focus_area: draft.focus_area || prev.focus_area,
          goals_text: draft.goals?.length ? draft.goals.join("\n") : prev.goals_text,
          success_metrics: draft.success_metrics || prev.success_metrics,
          support_offered: draft.support_offered || prev.support_offered,
          employee_facing_summary: draft.employee_facing_summary || prev.employee_facing_summary,
          manager_notes: draft.manager_notes || prev.manager_notes
        }));
        showToast("AI draft applied to the editor — review before saving.", "success");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "PIP AI unavailable.", "error");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a2a24] via-[#152018] to-[#0f1412] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">Growth Path · Performance Improvement Plan</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Support people. Protect the company. Document with care.</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              This workspace is built so employees feel coached — not cornered — and so managers, admins, and super admins have California-aware guidance that keeps expectations clear and the employer protected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-btn-secondary min-h-11" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button type="button" className="admin-btn-primary min-h-11" onClick={startCreate}>
              <Plus className="h-4 w-4" />
              New growth plan
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-white/55">Active paths</p>
            <p className="mt-1 text-3xl font-black text-white">{activeCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-white/55">Reviews this week</p>
            <p className="mt-1 text-3xl font-black text-emerald-300">{reviewsThisWeek.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wide text-white/55">AI coach</p>
            <p className="mt-1 text-sm font-semibold text-white">{aiReady ? `Ready · ${aiLocation}` : "Unavailable"}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="admin-card flex gap-3 p-4">
          <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <h3 className="font-semibold text-white">For the employee</h3>
            <p className="mt-1 text-sm text-admin-muted">Clear goals, real support, and a fair runway — framed as belief in their ability to succeed.</p>
          </div>
        </div>
        <div className="admin-card flex gap-3 p-4">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <h3 className="font-semibold text-white">For managers & admins</h3>
            <p className="mt-1 text-sm text-admin-muted">Talking points, check-in structure, and AI coaching so you never walk into a hard conversation alone.</p>
          </div>
        </div>
        <div className="admin-card flex gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--crossover-gold)]" />
          <div>
            <h3 className="font-semibold text-white">California-aware</h3>
            <p className="mt-1 text-sm text-admin-muted">Documentation hygiene and consistency tips that keep Fitdog’s interests protected. Not a substitute for counsel.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <div className="admin-card overflow-hidden p-0">
            <div className="border-b border-admin-border/70 px-4 py-3">
              <h3 className="text-base font-semibold text-white">Active growth plans</h3>
              <p className="text-xs text-admin-muted">Select a plan to coach, check in, or edit.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/20 text-xs uppercase tracking-wide text-admin-muted">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
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
                      <td colSpan={6} className="px-4 py-8 text-center text-admin-muted">
                        Loading…
                      </td>
                    </tr>
                  ) : plans.length ? (
                    plans.map((plan) => (
                      <tr
                        key={plan.id}
                        className={`cursor-pointer border-t border-admin-border/70 ${selectedId === plan.id ? "bg-white/5" : ""}`}
                        onClick={() => setSelectedId(plan.id)}
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-white">{plan.employee_name}</p>
                          <p className="text-xs text-admin-muted">{plan.employee_role || "—"}</p>
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5 text-admin-muted">
                          <span className="line-clamp-2">{plan.focus_area}</span>
                        </td>
                        <td className="px-3 py-2.5 text-admin-muted">{plan.next_review_date || "—"}</td>
                        <td className="min-w-[140px] px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${plan.progress_percent}%` }} />
                            </div>
                            <span className="text-xs text-admin-muted">{plan.progress_percent}%</span>
                          </div>
                        </td>
                        <td className={`px-3 py-2.5 ${statusTone(plan.status)}`}>{plan.status}</td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            <button type="button" className="admin-btn-secondary min-h-9" onClick={() => startEdit(plan)}>
                              Edit
                            </button>
                            <button type="button" className="admin-btn-ghost min-h-9" onClick={() => void removePlan(plan.id)} disabled={busy}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-admin-muted">
                        No growth plans yet. Create one here, or select HR Records and use Create PIP.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selected ? (
            <div className="admin-card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selected.employee_name}</h3>
                  <p className="mt-1 text-sm text-admin-muted">{selected.focus_area}</p>
                </div>
                <span className={`text-sm font-semibold ${statusTone(selected.status)}`}>{selected.status}</span>
              </div>

              {selected.employee_facing_summary ? (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Employee-facing summary</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/90">{selected.employee_facing_summary}</p>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-admin-muted">Goals</p>
                  <ul className="mt-2 space-y-1 text-sm text-white/85">
                    {(selected.goals.length ? selected.goals : ["Goals will appear once drafted."]).map((goal) => (
                      <li key={goal}>• {goal}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-admin-muted">Support offered</p>
                  <p className="mt-2 text-sm text-white/85">{selected.support_offered || "Add coaching, training, or schedule clarity."}</p>
                  <p className="mt-3 text-xs uppercase tracking-wide text-admin-muted">Success looks like</p>
                  <p className="mt-1 text-sm text-white/85">{selected.success_metrics || "Define measurable success before the next review."}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">Log a supportive check-in</p>
                <textarea
                  className="admin-input min-h-[90px]"
                  placeholder="What went well, what was coached, what support was offered, and what’s next…"
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                />
                <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void addCheckIn()}>
                  Save check-in
                </button>
              </div>

              {selected.check_ins.length ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">Recent check-ins</p>
                  {selected.check_ins.slice(0, 5).map((checkIn) => (
                    <div key={checkIn.id} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm">
                      <div className="flex justify-between gap-2 text-xs text-admin-muted">
                        <span>{checkIn.date}</span>
                        <span>{checkIn.progress_percent}%</span>
                      </div>
                      <p className="mt-1 text-white/85">{checkIn.note}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {showComposer ? (
            <div className="admin-card space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-white">{editingId ? "Edit growth plan" : "Create growth plan"}</h3>
                <button
                  type="button"
                  className="admin-btn-ghost text-xs"
                  onClick={() => {
                    setShowComposer(false);
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Close
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="admin-label">
                  Employee name
                  <input className="admin-input mt-1" value={form.employee_name} onChange={(e) => setForm((p) => ({ ...p, employee_name: e.target.value }))} />
                </label>
                <label className="admin-label">
                  Role / department
                  <input className="admin-input mt-1" value={form.employee_role} onChange={(e) => setForm((p) => ({ ...p, employee_role: e.target.value }))} />
                </label>
                <label className="admin-label">
                  Manager
                  <input className="admin-input mt-1" value={form.manager_name} onChange={(e) => setForm((p) => ({ ...p, manager_name: e.target.value }))} />
                </label>
                <label className="admin-label md:col-span-2 xl:col-span-3">
                  Focus area
                  <input className="admin-input mt-1" value={form.focus_area} onChange={(e) => setForm((p) => ({ ...p, focus_area: e.target.value }))} />
                </label>
                <label className="admin-label md:col-span-2 xl:col-span-3">
                  Goals (one per line)
                  <textarea className="admin-input mt-1 min-h-[90px]" value={form.goals_text} onChange={(e) => setForm((p) => ({ ...p, goals_text: e.target.value }))} />
                </label>
                <label className="admin-label md:col-span-2">
                  Success metrics
                  <textarea className="admin-input mt-1 min-h-[70px]" value={form.success_metrics} onChange={(e) => setForm((p) => ({ ...p, success_metrics: e.target.value }))} />
                </label>
                <label className="admin-label">
                  Status
                  <select className="admin-input mt-1" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as PipStatus }))}>
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </label>
                <label className="admin-label md:col-span-2 xl:col-span-3">
                  Support we will provide
                  <textarea className="admin-input mt-1 min-h-[70px]" value={form.support_offered} onChange={(e) => setForm((p) => ({ ...p, support_offered: e.target.value }))} />
                </label>
                <label className="admin-label md:col-span-2 xl:col-span-3">
                  Employee-facing summary
                  <textarea className="admin-input mt-1 min-h-[80px]" value={form.employee_facing_summary} onChange={(e) => setForm((p) => ({ ...p, employee_facing_summary: e.target.value }))} />
                </label>
                <label className="admin-label">
                  Start date
                  <input type="date" className="admin-input mt-1" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
                </label>
                <label className="admin-label">
                  Next review
                  <input type="date" className="admin-input mt-1" value={form.next_review_date} onChange={(e) => setForm((p) => ({ ...p, next_review_date: e.target.value }))} />
                </label>
                <label className="admin-label">
                  Target end
                  <input type="date" className="admin-input mt-1" value={form.target_end_date} onChange={(e) => setForm((p) => ({ ...p, target_end_date: e.target.value }))} />
                </label>
                <label className="admin-label">
                  Progress %
                  <input type="number" min={0} max={100} className="admin-input mt-1" value={form.progress_percent} onChange={(e) => setForm((p) => ({ ...p, progress_percent: Number(e.target.value) }))} />
                </label>
                <label className="admin-label md:col-span-2 xl:col-span-3">
                  Manager documentation notes (internal)
                  <textarea className="admin-input mt-1 min-h-[80px]" value={form.manager_notes} onChange={(e) => setForm((p) => ({ ...p, manager_notes: e.target.value }))} />
                </label>
              </div>
              <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void save()}>
                <Plus className="h-4 w-4" />
                {editingId ? "Save changes" : "Create growth plan"}
              </button>
            </div>
          ) : null}
        </div>

        <aside className="admin-card space-y-4 p-5 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-fitdog-orange" />
            <div>
              <h3 className="text-lg font-semibold text-white">Avery · PIP AI Coach</h3>
              <p className="mt-1 text-sm text-admin-muted">
                Extremely practical coaching grounded in {aiLocation}. Supportive for people. Protective for Fitdog.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["draft_plan", "Draft plan"],
                ["employee_summary", "Employee summary"],
                ["manager_talking_points", "Talking points"],
                ["check_in_coach", "Check-in coach"],
                ["ca_documentation", "CA docs"]
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`crossover-btn text-xs ${aiMode === mode ? "crossover-btn--active" : "crossover-btn--ghost"}`}
                disabled={!aiReady || aiBusy}
                onClick={() => void runAi(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            className="admin-input min-h-[100px]"
            placeholder={
              selected
                ? `Ask Avery about ${selected.employee_name}'s plan…`
                : "Describe the situation, or select a plan and ask Avery for a draft…"
            }
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <button
            type="button"
            className="admin-btn-primary w-full"
            disabled={!aiReady || aiBusy}
            onClick={() => void runAi("chat")}
          >
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiBusy ? "Thinking…" : "Ask Avery"}
          </button>

          {!aiReady ? (
            <p className="text-xs text-admin-muted">Enable HR Consult / Gemini in Settings and ensure GEMINI_API_KEY is configured.</p>
          ) : null}

          {aiReply ? (
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
              {aiReply}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-admin-muted">
              Try “Draft plan” for a full growth-path first draft, or “CA docs” for employer-protective documentation tips.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
