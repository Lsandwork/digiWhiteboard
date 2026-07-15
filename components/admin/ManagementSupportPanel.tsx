"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Download, FilePenLine, MessageSquarePlus, Send, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { EMPTY_WARNING_NOTICE_FORM, WarningNoticeForm } from "@/components/admin/WarningNoticeForm";
import type { WarningNoticeFormData } from "@/lib/staff/warning-notice-constants";
import type { ManagementReport } from "@/lib/staff/management-reports";

type ManagementSupportSubTab = "submit" | "review";
type GroomerSection = "complaint" | "request";
type GroomerSubTab = "file" | "filed";
type TrainerSection = "complaint" | "request";
type TrainerSubTab = "file" | "filed";

type Payload = {
  reports: ManagementReport[];
  complaints?: ManagementReport[];
  requests?: ManagementReport[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

function WriteUpPdfDownloadButton({ reportId, filename }: { reportId: string; filename?: string | null }) {
  return (
    <a
      className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2 text-sm"
      href={`/api/admin/write-ups/${reportId}/pdf`}
      download={filename ?? undefined}
    >
      <Download className="h-4 w-4" aria-hidden />
      Download PDF
    </a>
  );
}

function WriteUpTextReport({ text }: { text: string }) {
  return <pre className="warning-notice-text-report">{text}</pre>;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function statusClass(status: ManagementReport["status"]) {
  if (status === "Needs Review") return "crossover-badge crossover-badge--urgent";
  if (status === "Reviewed" || status === "Closed") return "crossover-badge crossover-badge--resolved";
  return "crossover-badge";
}

function SubmissionReviewCard({ report }: { report: ManagementReport }) {
  const details = report.write_up_details;
  const groomerDetails = report.groomer_submission_details;

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
          <p><span className="font-bold text-white">Date of violation:</span> {details.violation_date ?? details.incident_date}{details.violation_time ?? details.incident_time ? ` at ${details.violation_time ?? details.incident_time}` : ""}</p>
          {details.violation_types?.length ? (
            <p><span className="font-bold text-white">Violation type:</span> {details.violation_types.join(", ")}{details.violation_other ? ` (${details.violation_other})` : ""}</p>
          ) : null}
          <p><span className="font-bold text-white">Statement of violation:</span> {details.statement_of_violation ?? details.incident_description}</p>
          {details.text_report ? <WriteUpTextReport text={details.text_report} /> : null}
          {details.pdf_filename ? (
            <div className="pt-1">
              <WriteUpPdfDownloadButton reportId={report.id} filename={details.pdf_filename} />
            </div>
          ) : null}
        </div>
      ) : groomerDetails ? (
        <div className="mt-2 space-y-2 text-sm text-admin-muted">
          <p>{groomerDetails.description}</p>
          {report.management_response ? (
            <p className="rounded-lg border border-fitdog-orange/30 bg-fitdog-orange/10 p-3">
              <span className="font-bold text-white">Management response:</span> {report.management_response}
            </p>
          ) : null}
          {(report.comments ?? [])
            .filter((comment) => comment.visibility === "visible_to_submitter")
            .map((comment) => (
              <p key={comment.id} className="rounded-lg border border-admin-border p-3">
                <span className="font-bold text-white">{comment.user_name}:</span> {comment.body}
              </p>
            ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-admin-muted">{report.summary}</p>
      )}
      <p className="mt-3 text-xs text-admin-muted">
        Submitted by {report.created_by ?? "staff"}
        {report.reviewed_by ? ` • Reviewed by ${report.reviewed_by}` : " • Awaiting admin/management review"}
      </p>
    </article>
  );
}

function GroomerSubmissionForm({
  title,
  subtitle,
  placeholder,
  busy,
  onSubmit
}: {
  title: string;
  subtitle: string;
  placeholder: string;
  busy: boolean;
  onSubmit: (description: string) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  return (
    <section className="crossover-card crossover-card--create p-5">
      <div className="crossover-card__header crossover-card__header--compact">
        <div className="crossover-card__header-main">
          <div className="crossover-icon-tile h-12 w-12 text-[var(--crossover-gold)]">
            <MessageSquarePlus className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h3 className="crossover-card__title">{title}</h3>
            <p className="crossover-card__subtitle">{subtitle}</p>
          </div>
        </div>
      </div>
      <label className="mt-4 grid gap-2">
        <span className="admin-label">Details *</span>
        <textarea
          className={`crossover-input min-h-40 ${error ? "push-notice-dog-handler-card__input--error" : ""}`}
          value={description}
          maxLength={1200}
          disabled={busy}
          placeholder={placeholder}
          onChange={(event) => {
            setDescription(event.target.value);
            if (error) setError("");
          }}
        />
        {error ? <span className="push-notice-dog-handler-card__error">{error}</span> : null}
      </label>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="crossover-btn crossover-btn--primary inline-flex items-center gap-2"
          disabled={busy}
          onClick={() => {
            const trimmed = description.trim();
            if (!trimmed) {
              setError("Please enter details before submitting.");
              return;
            }
            void onSubmit(trimmed).then(() => setDescription(""));
          }}
        >
          <Send className="h-4 w-4" />
          {busy ? "Submitting…" : "Submit"}
        </button>
      </div>
    </section>
  );
}

function GroomerManagementSupportPanel({ showRequests = true }: { showRequests?: boolean }) {
  const { showToast } = useToast();
  const [section, setSection] = useState<GroomerSection>("complaint");
  const [subTab, setSubTab] = useState<GroomerSubTab>("file");
  const [data, setData] = useState<Payload | null>(null);
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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load management support.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const complaints = useMemo(
    () => data?.complaints ?? data?.reports.filter((report) => report.report_type === "groomer_complaint") ?? [],
    [data]
  );
  const requests = useMemo(
    () => data?.requests ?? data?.reports.filter((report) => report.report_type === "groomer_request") ?? [],
    [data]
  );

  async function submitGroomerForm(action: "create_groomer_complaint" | "create_groomer_request", description: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/management-support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, description })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to submit form.");
      showToast(
        action === "create_groomer_complaint"
          ? "Complaint submitted to admin and management for review."
          : "Request submitted to admin and management for review.",
        "success"
      );
      setSubTab("filed");
      await load();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to submit form.";
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  const filedItems = section === "complaint" ? complaints : requests;

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Management Support</h2>
          <p className="admin-page-subtitle">File complaints and requests for admin and management review, then track their status.</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`crossover-btn ${section === "complaint" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
          onClick={() => {
            setSection("complaint");
            setSubTab("file");
          }}
        >
          Complaints
        </button>
        {showRequests ? (
          <button
            type="button"
            className={`crossover-btn ${section === "request" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
            onClick={() => {
              setSection("request");
              setSubTab("file");
            }}
          >
            Requests
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`crossover-btn ${subTab === "file" ? "crossover-btn--outline" : "crossover-btn--ghost"}`}
          onClick={() => setSubTab("file")}
        >
          <FilePenLine className="h-4 w-4" />
          {section === "complaint" ? "File Complaint" : "File Request"}
        </button>
        <button
          type="button"
          className={`crossover-btn ${subTab === "filed" ? "crossover-btn--outline" : "crossover-btn--ghost"}`}
          onClick={() => setSubTab("filed")}
        >
          <ClipboardList className="h-4 w-4" />
          {section === "complaint" ? "Complaints Filed" : "Requests Filed"}
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p className="text-sm text-admin-muted">Loading management support…</p> : null}

      {subTab === "file" ? (
        section === "complaint" ? (
          <GroomerSubmissionForm
            title="File Complaint"
            subtitle="Describe the issue. Your complaint goes directly to admin and management for review."
            placeholder="Describe the complaint, including relevant details, timing, and anyone involved."
            busy={busy}
            onSubmit={(description) => submitGroomerForm("create_groomer_complaint", description)}
          />
        ) : (
          <GroomerSubmissionForm
            title="File Request"
            subtitle="Describe what you need. Your request goes directly to admin and management for review."
            placeholder="Describe the request, supplies needed, scheduling help, or other support needed."
            busy={busy}
            onSubmit={(description) => submitGroomerForm("create_groomer_request", description)}
          />
        )
      ) : (
        <section className="crossover-card p-5">
          <div className="crossover-card__header crossover-card__header--compact">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[var(--crossover-gold)]" aria-hidden />
              <h3 className="crossover-card__title">
                {section === "complaint" ? "Complaints Filed" : "Requests Filed"}
              </h3>
            </div>
            <span className="crossover-link-btn">{filedItems.length} total</span>
          </div>
          <div className="grid gap-3">
            {filedItems.length ? filedItems.map((report) => <SubmissionReviewCard key={report.id} report={report} />) : (
              <p className="text-sm text-admin-muted">
                {section === "complaint"
                  ? "No complaints filed yet. Use File Complaint to send one to admin and management."
                  : "No requests filed yet. Use File Request to send one to admin and management."}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function TrainerManagementSupportPanel() {
  const { showToast } = useToast();
  const [section, setSection] = useState<TrainerSection>("complaint");
  const [subTab, setSubTab] = useState<TrainerSubTab>("file");
  const [data, setData] = useState<Payload | null>(null);
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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load management support.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const complaints = useMemo(
    () => data?.complaints ?? data?.reports.filter((report) => report.report_type === "trainer_complaint") ?? [],
    [data]
  );
  const requests = useMemo(
    () => data?.requests ?? data?.reports.filter((report) => report.report_type === "trainer_request") ?? [],
    [data]
  );

  async function submitTrainerForm(action: "create_trainer_complaint" | "create_trainer_request", description: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/management-support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, description })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to submit form.");
      showToast(
        action === "create_trainer_complaint"
          ? "Complaint submitted to admin and management for review."
          : "Request submitted to admin and management for review.",
        "success"
      );
      setSubTab("filed");
      await load();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to submit form.";
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  const filedItems = section === "complaint" ? complaints : requests;

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Management Support</h2>
          <p className="admin-page-subtitle">File complaints and requests and track submission status.</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={`crossover-btn ${section === "complaint" ? "crossover-btn--active" : "crossover-btn--ghost"}`} onClick={() => { setSection("complaint"); setSubTab("file"); }}>Complaints</button>
        <button type="button" className={`crossover-btn ${section === "request" ? "crossover-btn--active" : "crossover-btn--ghost"}`} onClick={() => { setSection("request"); setSubTab("file"); }}>Requests</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={`crossover-btn ${subTab === "file" ? "crossover-btn--outline" : "crossover-btn--ghost"}`} onClick={() => setSubTab("file")}>
          <FilePenLine className="h-4 w-4" />
          {section === "complaint" ? "File Complaint" : "File Request"}
        </button>
        <button type="button" className={`crossover-btn ${subTab === "filed" ? "crossover-btn--outline" : "crossover-btn--ghost"}`} onClick={() => setSubTab("filed")}>
          <ClipboardList className="h-4 w-4" />
          {section === "complaint" ? "Complaints Filed" : "Requests Filed"}
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p className="text-sm text-admin-muted">Loading management support…</p> : null}

      {subTab === "file" ? (
        section === "complaint" ? (
          <GroomerSubmissionForm
            title="File Complaint"
            subtitle="Describe the issue. Your complaint goes directly to admin and management for review."
            placeholder="Describe the complaint, including relevant details, timing, and anyone involved."
            busy={busy}
            onSubmit={(description) => submitTrainerForm("create_trainer_complaint", description)}
          />
        ) : (
          <GroomerSubmissionForm
            title="File Request"
            subtitle="Describe what you need. Your request goes directly to admin and management for review."
            placeholder="Describe the request, supplies needed, scheduling help, or other support needed."
            busy={busy}
            onSubmit={(description) => submitTrainerForm("create_trainer_request", description)}
          />
        )
      ) : (
        <section className="crossover-card p-5">
          <div className="crossover-card__header crossover-card__header--compact">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[var(--crossover-gold)]" aria-hidden />
              <h3 className="crossover-card__title">{section === "complaint" ? "Complaints Filed" : "Requests Filed"}</h3>
            </div>
            <span className="crossover-link-btn">{filedItems.length} total</span>
          </div>
          <div className="grid gap-3">
            {filedItems.length ? filedItems.map((report) => <SubmissionReviewCard key={report.id} report={report} />) : (
              <p className="text-sm text-admin-muted">
                {section === "complaint"
                  ? "No complaints filed yet. Use File Complaint to send one to admin and management."
                  : "No requests filed yet. Use File Request to send one to admin and management."}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

type TeamLeadPanelSection = "write_up" | "complaint";

function TeamLeadManagementSupportPanel({
  initialSubTab = "submit",
  allowWriteUpReview = false,
  reviewAllWriteUps = false
}: {
  initialSubTab?: ManagementSupportSubTab;
  allowWriteUpReview?: boolean;
  reviewAllWriteUps?: boolean;
}) {
  const { showToast } = useToast();
  const [panelSection, setPanelSection] = useState<TeamLeadPanelSection>("write_up");
  const [subTab, setSubTab] = useState<ManagementSupportSubTab>(initialSubTab);
  const [complaintSubTab, setComplaintSubTab] = useState<GroomerSubTab>("file");
  const [data, setData] = useState<Payload | null>(null);
  const [complaintData, setComplaintData] = useState<Payload | null>(null);
  const [form, setForm] = useState<WarningNoticeFormData>(EMPTY_WARNING_NOTICE_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = reviewAllWriteUps
        ? "/api/admin/management-support"
        : "/api/admin/management-support?view=write_ups";
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load management support.");
      setData(body as Payload);
      if (!form.documented_by && body.currentUser?.email) {
        setForm((current) => ({
          ...current,
          documented_by: body.currentUser.email ?? "",
          manager_signature: body.currentUser.email ?? current.manager_signature
        }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load management support.");
    } finally {
      setLoading(false);
    }
  }, [form.documented_by, reviewAllWriteUps]);

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/management-support", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load complaints.");
      setComplaintData(body as Payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load complaints.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (panelSection === "write_up") void load();
      else void loadComplaints();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, loadComplaints, panelSection]);

  const writeUps = useMemo(() => data?.reports.filter((report) => report.report_type === "employee_write_up") ?? [], [data]);
  const complaints = useMemo(
    () => complaintData?.complaints ?? complaintData?.reports.filter((report) => report.report_type === "groomer_complaint") ?? [],
    [complaintData]
  );

  async function submitComplaint(description: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/management-support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_groomer_complaint", description })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to submit complaint.");
      showToast("Complaint submitted to admin and management for review.", "success");
      setComplaintSubTab("filed");
      await loadComplaints();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to submit complaint.";
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

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
      setForm({
        ...EMPTY_WARNING_NOTICE_FORM,
        documented_by: data?.currentUser.email ?? "",
        manager_signature: data?.currentUser.email ?? ""
      });
      if (allowWriteUpReview) {
        setSubTab("review");
        await load();
      }
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
          <p className="admin-page-subtitle">
            {allowWriteUpReview
              ? "Submit employee write-ups and review all submitted warning notices."
              : "Submit employee write-ups or file a complaint for admin and management review."}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`crossover-btn ${panelSection === "write_up" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
          onClick={() => setPanelSection("write_up")}
        >
          Write-Ups
        </button>
        <button
          type="button"
          className={`crossover-btn ${panelSection === "complaint" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
          onClick={() => setPanelSection("complaint")}
        >
          Complaints
        </button>
      </div>

      {panelSection === "complaint" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`crossover-btn ${complaintSubTab === "file" ? "crossover-btn--outline" : "crossover-btn--ghost"}`}
              onClick={() => setComplaintSubTab("file")}
            >
              File Complaint
            </button>
            <button
              type="button"
              className={`crossover-btn ${complaintSubTab === "filed" ? "crossover-btn--outline" : "crossover-btn--ghost"}`}
              onClick={() => setComplaintSubTab("filed")}
            >
              Complaints Filed
            </button>
          </div>
          {error ? <p className="admin-error">{error}</p> : null}
          {loading ? <p className="text-sm text-admin-muted">Loading…</p> : null}
          {complaintSubTab === "file" ? (
            <GroomerSubmissionForm
              title="File Complaint"
              subtitle="Describe the issue. Your complaint goes directly to admin and management for review."
              placeholder="Describe the complaint, including relevant details, timing, and anyone involved."
              busy={busy}
              onSubmit={submitComplaint}
            />
          ) : (
            <section className="crossover-card p-5">
              <div className="grid gap-3">
                {complaints.length ? (
                  complaints.map((report) => <SubmissionReviewCard key={report.id} report={report} />)
                ) : (
                  <p className="text-sm text-admin-muted">No complaints filed yet.</p>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`crossover-btn ${subTab === "submit" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
          onClick={() => setSubTab("submit")}
        >
          <FilePenLine className="h-4 w-4" />
          Write Up Submit
        </button>
        {allowWriteUpReview ? (
          <button
            type="button"
            className={`crossover-btn ${subTab === "review" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
            onClick={() => setSubTab("review")}
          >
            <ClipboardList className="h-4 w-4" />
            Write Up Review
          </button>
        ) : null}
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
                <h3 className="crossover-card__title">Fitdog Warning Notice</h3>
                <p className="crossover-card__subtitle">Complete the official warning notice form. Submissions generate a matching PDF for admin, management, and HR tracking.</p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <WarningNoticeForm form={form} onChange={setForm} disabled={busy} />
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="crossover-btn crossover-btn--primary inline-flex items-center gap-2" disabled={busy} onClick={() => void submitWriteUp()}>
              <Send className="h-4 w-4" />
              {busy ? "Submitting…" : "Submit Warning Notice"}
            </button>
          </div>
        </section>
      ) : (
        <section className="crossover-card p-5">
          <div className="crossover-card__header crossover-card__header--compact">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[var(--crossover-gold)]" aria-hidden />
              <h3 className="crossover-card__title">
                {reviewAllWriteUps ? "Submitted Write-Ups" : "Your Submitted Write-Ups"}
              </h3>
            </div>
            <span className="crossover-link-btn">{writeUps.length} total</span>
          </div>
          <div className="grid gap-3">
            {writeUps.length ? writeUps.map((report) => <SubmissionReviewCard key={report.id} report={report} />) : (
              <p className="text-sm text-admin-muted">
                {reviewAllWriteUps
                  ? "No write-ups submitted yet."
                  : "No write-ups submitted yet. Use Write Up Submit to send one to admin and management."}
              </p>
            )}
          </div>
        </section>
      )}
        </>
      )}
    </div>
  );
}

export function ManagementSupportPanel({
  mode = "team_leader",
  initialSubTab = "submit"
}: {
  mode?: "team_leader" | "groomer" | "trainer" | "handler" | "coordinator" | "admin";
  initialSubTab?: ManagementSupportSubTab;
}) {
  if (mode === "coordinator") return <GroomerManagementSupportPanel />;
  if (mode === "groomer" || mode === "handler") return <GroomerManagementSupportPanel />;
  if (mode === "trainer") return <TrainerManagementSupportPanel />;
  if (mode === "admin") {
    return (
      <TeamLeadManagementSupportPanel
        initialSubTab={initialSubTab}
        allowWriteUpReview
        reviewAllWriteUps
      />
    );
  }
  return <TeamLeadManagementSupportPanel initialSubTab={initialSubTab} />;
}
