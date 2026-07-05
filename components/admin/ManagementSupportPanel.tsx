"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FilePenLine, Send, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { ManagementReport } from "@/lib/staff/management-reports";

type ManagementSupportSubTab = "submit" | "review";

type Payload = {
  reports: ManagementReport[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

const DEPARTMENTS = ["Daycare", "Grooming", "Training", "Front Desk", "Transportation", "Overnight", "Maintenance", "Other"];

const EMPTY_FORM = {
  employee_name: "",
  employee_department: "Daycare",
  incident_date: "",
  incident_time: "",
  shift_location: "",
  policy_violated: "",
  incident_description: "",
  witnesses: "",
  prior_discussion: "",
  corrective_action: "",
  team_lead_signature: ""
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function statusClass(status: ManagementReport["status"]) {
  if (status === "Needs Review") return "crossover-badge crossover-badge--urgent";
  if (status === "Reviewed" || status === "Closed") return "crossover-badge crossover-badge--resolved";
  return "crossover-badge";
}

function WriteUpReviewCard({ report }: { report: ManagementReport }) {
  const details = report.write_up_details;

  return (
    <article className="push-notice-management-report">
      <div className="flex flex-wrap items-center gap-2">
        <span className={statusClass(report.status)}>{report.status.toUpperCase()}</span>
        <span className="text-xs text-admin-muted">{formatDateTime(report.created_at)}</span>
      </div>
      <h4 className="mt-2 font-black text-white">{report.title}</h4>
      {details ? (
        <div className="mt-3 space-y-2 text-sm text-admin-muted">
          <p><span className="font-bold text-white">Employee:</span> {details.employee_name} ({details.employee_department})</p>
          <p><span className="font-bold text-white">Incident date:</span> {details.incident_date}{details.incident_time ? ` at ${details.incident_time}` : ""}</p>
          {details.policy_violated ? <p><span className="font-bold text-white">Policy:</span> {details.policy_violated}</p> : null}
          <p><span className="font-bold text-white">Description:</span> {details.incident_description}</p>
          {details.corrective_action ? <p><span className="font-bold text-white">Corrective action:</span> {details.corrective_action}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-admin-muted">{report.summary}</p>
      )}
      <p className="mt-3 text-xs text-admin-muted">
        Submitted by {report.created_by ?? "team lead"}
        {report.reviewed_by ? ` • Reviewed by ${report.reviewed_by}` : " • Awaiting admin/management review"}
      </p>
    </article>
  );
}

export function ManagementSupportPanel({ initialSubTab = "submit" }: { initialSubTab?: ManagementSupportSubTab }) {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<ManagementSupportSubTab>(initialSubTab);
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/management-support", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load management support.");
      setData(body as Payload);
      if (!form.team_lead_signature && body.currentUser?.email) {
        setForm((current) => ({ ...current, team_lead_signature: body.currentUser.email }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load management support.");
    } finally {
      setLoading(false);
    }
  }, [form.team_lead_signature]);

  useEffect(() => {
    void load();
  }, [load]);

  const writeUps = useMemo(() => data?.reports.filter((report) => report.report_type === "employee_write_up") ?? [], [data]);

  async function submitWriteUp() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/management-support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_write_up", ...form })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to submit write-up.");
      showToast("Write-up submitted to admin and management for review.", "success");
      setForm({ ...EMPTY_FORM, team_lead_signature: data?.currentUser.email ?? "" });
      setSubTab("review");
      await load();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to submit write-up.";
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Management Support</h2>
          <p className="admin-page-subtitle">Submit employee write-ups for admin and management review, then track their status.</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`crossover-btn ${subTab === "submit" ? "crossover-btn--primary" : "crossover-btn--ghost"}`}
          onClick={() => setSubTab("submit")}
        >
          <FilePenLine className="h-4 w-4" />
          Write Up Submit
        </button>
        <button
          type="button"
          className={`crossover-btn ${subTab === "review" ? "crossover-btn--primary" : "crossover-btn--ghost"}`}
          onClick={() => setSubTab("review")}
        >
          <ClipboardList className="h-4 w-4" />
          Write Up Review
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p className="text-sm text-admin-muted">Loading management support…</p> : null}

      {subTab === "submit" ? (
        <section className="crossover-card crossover-card--create p-5">
          <div className="crossover-card__header crossover-card__header--compact">
            <div className="crossover-card__header-main">
              <div className="crossover-icon-tile h-12 w-12 text-[var(--crossover-gold)]">
                <ShieldAlert className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h3 className="crossover-card__title">Employee Write-Up Form</h3>
                <p className="crossover-card__subtitle">Complete all required fields. Submissions go directly to admin and management for review.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="admin-label">Employee Name *</span>
              <input className="crossover-input" value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} placeholder="Employee full name" />
            </label>
            <label className="grid gap-2">
              <span className="admin-label">Department *</span>
              <select className="crossover-input" value={form.employee_department} onChange={(e) => setForm({ ...form, employee_department: e.target.value })}>
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="admin-label">Date of Incident *</span>
              <input type="date" className="crossover-input" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} />
            </label>
            <label className="grid gap-2">
              <span className="admin-label">Time of Incident</span>
              <input type="time" className="crossover-input" value={form.incident_time} onChange={(e) => setForm({ ...form, incident_time: e.target.value })} />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="admin-label">Shift / Location</span>
              <input className="crossover-input" value={form.shift_location} onChange={(e) => setForm({ ...form, shift_location: e.target.value })} placeholder="e.g. Big Side yard, morning shift" />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="admin-label">Policy / Rule Violated</span>
              <input className="crossover-input" value={form.policy_violated} onChange={(e) => setForm({ ...form, policy_violated: e.target.value })} placeholder="Policy, SOP, or rule reference" />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="admin-label">Description of Incident *</span>
              <textarea className="crossover-input min-h-32" value={form.incident_description} onChange={(e) => setForm({ ...form, incident_description: e.target.value })} placeholder="Describe what happened, including relevant facts and context." />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="admin-label">Witnesses</span>
              <textarea className="crossover-input min-h-20" value={form.witnesses} onChange={(e) => setForm({ ...form, witnesses: e.target.value })} placeholder="Names of witnesses, if any" />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="admin-label">Prior Discussion with Employee</span>
              <textarea className="crossover-input min-h-20" value={form.prior_discussion} onChange={(e) => setForm({ ...form, prior_discussion: e.target.value })} placeholder="Document any prior coaching or conversation with the employee." />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="admin-label">Recommended Corrective Action</span>
              <textarea className="crossover-input min-h-20" value={form.corrective_action} onChange={(e) => setForm({ ...form, corrective_action: e.target.value })} placeholder="Coaching, retraining, suspension recommendation, etc." />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="admin-label">Team Lead Signature</span>
              <input className="crossover-input" value={form.team_lead_signature} onChange={(e) => setForm({ ...form, team_lead_signature: e.target.value })} placeholder="Your name or email" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="crossover-btn crossover-btn--primary inline-flex items-center gap-2" disabled={busy} onClick={() => void submitWriteUp()}>
              <Send className="h-4 w-4" />
              {busy ? "Submitting…" : "Submit Write-Up"}
            </button>
          </div>
        </section>
      ) : (
        <section className="crossover-card p-5">
          <div className="crossover-card__header crossover-card__header--compact">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[var(--crossover-gold)]" aria-hidden />
              <h3 className="crossover-card__title">Your Submitted Write-Ups</h3>
            </div>
            <span className="crossover-link-btn">{writeUps.length} total</span>
          </div>
          <div className="grid gap-3">
            {writeUps.length ? writeUps.map((report) => <WriteUpReviewCard key={report.id} report={report} />) : (
              <p className="text-sm text-admin-muted">No write-ups submitted yet. Use Write Up Submit to send one to admin and management.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
