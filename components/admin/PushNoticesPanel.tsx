"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Pencil, Plus, RotateCcw, Send, ShieldAlert, Trash2, UserRound, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { canAccessPushNotices, canCreateDogHandlerComplaintNotice, canViewManagementReports } from "@/lib/admin/users";
import type { ManagementReport } from "@/lib/staff/management-reports";
import {
  DOG_HANDLER_COMPLAINT_NOTICE_LABEL,
  isDogHandlerComplaintNotice,
  type StaffPushNotice,
  type StaffPushNoticeDisplayMode,
  type StaffPushNoticePriority,
  type StaffPushNoticeRecurrence
} from "@/lib/staff/push-notices";

type DefaultNotice = Pick<StaffPushNotice, "title" | "message" | "priority" | "display_mode" | "is_default">;

type PushNoticesPayload = {
  activeNotice: StaffPushNotice | null;
  notices: StaffPushNotice[];
  defaultNotices: DefaultNotice[];
  managementReports?: ManagementReport[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

type NoticeFormState = {
  title: string;
  message: string;
  priority: StaffPushNoticePriority;
  display_mode: StaffPushNoticeDisplayMode;
  expires_at: string;
  display_duration_minutes: string;
  schedule_enabled: boolean;
  scheduled_at: string;
  recurrence: StaffPushNoticeRecurrence;
};

const emptyForm: NoticeFormState = {
  title: "",
  message: "",
  priority: "normal",
  display_mode: "normal",
  expires_at: "",
  display_duration_minutes: "5",
  schedule_enabled: false,
  scheduled_at: "",
  recurrence: "none"
};

const priorityLabels: Record<StaffPushNoticePriority, string> = {
  normal: "Normal",
  important: "Important",
  urgent: "Urgent"
};

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

function noticeStatus(notice: StaffPushNotice) {
  if (notice.is_active) return "Active";
  if (notice.cleared_at) return "Cleared";
  if (notice.expires_at && new Date(notice.expires_at).getTime() < Date.now()) return "Expired";
  if (notice.schedule_enabled && (notice.next_scheduled_at || notice.scheduled_at)) return "Scheduled";
  return "Saved";
}

function scheduleLabel(notice: StaffPushNotice) {
  if (!notice.schedule_enabled) return "Not scheduled";
  const recurrence = notice.recurrence && notice.recurrence !== "none" ? ` • Repeats ${notice.recurrence}` : "";
  return `${formatDateTime(notice.next_scheduled_at ?? notice.scheduled_at ?? null)}${recurrence}`;
}

function noticeHistoryTitle(notice: StaffPushNotice) {
  if (isDogHandlerComplaintNotice(notice)) {
    return notice.dog_handler_name
      ? `${DOG_HANDLER_COMPLAINT_NOTICE_LABEL} — ${notice.dog_handler_name}`
      : DOG_HANDLER_COMPLAINT_NOTICE_LABEL;
  }
  return notice.title;
}

export function PushNoticesPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<PushNoticesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<NoticeFormState>(emptyForm);
  const [quickPushDurationMinutes, setQuickPushDurationMinutes] = useState("5");
  const [dogHandlerName, setDogHandlerName] = useState("");
  const [dogHandlerError, setDogHandlerError] = useState("");
  const [editingNotice, setEditingNotice] = useState<StaffPushNotice | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<StaffPushNotice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/push-notices", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load Push Notices.");
      setData(body as PushNoticesPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load Push Notices.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const canManage = canAccessPushNotices(data?.currentUser.role);
  const canPushDogHandler = canCreateDogHandlerComplaintNotice(data?.currentUser.role);
  const canViewReports = canViewManagementReports(data?.currentUser.role);
  const history = useMemo(() => data?.notices ?? [], [data?.notices]);
  const managementReports = useMemo(() => data?.managementReports ?? [], [data?.managementReports]);

  async function mutate(
    label: string,
    request: () => Promise<Response>,
    successMessage: string
  ) {
    setBusy(true);
    try {
      const response = await request();
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? label);
      showToast(successMessage, "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : label, "error");
    } finally {
      setBusy(false);
    }
  }

  async function pushDogHandlerComplaint() {
    const trimmed = dogHandlerName.trim();
    if (!trimmed) {
      setDogHandlerError("Please enter the dog handler name before pushing this notice.");
      return;
    }
    setDogHandlerError("");
    await mutate(
      "Unable to push dog handler complaint notice.",
      () => fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "push_dog_handler_complaint",
          dog_handler_name: trimmed,
          display_duration_minutes: quickPushDurationMinutes
        })
      }),
      "Dog handler owner complaint notice pushed successfully."
    );
    setDogHandlerName("");
  }

  async function pushDefault(notice: DefaultNotice) {
    await mutate(
      "Unable to push default notice.",
      () => fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "push_default", title: notice.title, display_duration_minutes: quickPushDurationMinutes })
      }),
      "Notice pushed to Staff Digital Whiteboard."
    );
  }

  async function pushCustom() {
    const payload = { ...form, action: "create_and_push", schedule_enabled: false, scheduled_at: "", recurrence: "none" };
    await mutate(
      "Unable to push custom notice.",
      () => fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }),
      "Custom notice pushed."
    );
    setForm(emptyForm);
  }

  async function saveCustom() {
    await mutate(
      "Unable to save custom notice.",
      () => fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, action: "create" })
      }),
      "Custom notice saved."
    );
    setForm(emptyForm);
  }

  async function scheduleCustom() {
    await mutate(
      "Unable to schedule custom notice.",
      () => fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, action: "create", schedule_enabled: true })
      }),
      "Custom notice scheduled."
    );
    setForm(emptyForm);
  }

  async function clearActive() {
    await mutate(
      "Unable to clear active notice.",
      () => fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear" })
      }),
      "Active notice cleared."
    );
  }

  async function pushAgain(notice: StaffPushNotice) {
    await mutate(
      "Unable to push notice again.",
      () => fetch(`/api/admin/push-notices/${notice.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "push" })
      }),
      "Notice pushed again."
    );
  }

  return (
    <div className="crossover-dashboard crossover-dashboard__layout space-y-5">
      <header className="crossover-dashboard__page-header">
        <div>
          <h2 className="crossover-dashboard__page-title">Push Notices</h2>
          <p className="crossover-dashboard__page-subtitle">Send live reminders to the Staff Digital Whiteboard.</p>
        </div>
      </header>

      {!canManage ? (
        <section className="admin-card p-5">
          <p className="admin-error">You do not have permission to manage Push Notices.</p>
        </section>
      ) : null}

      <section className="crossover-card crossover-card--sidebar p-5">
        <div className="crossover-card__header crossover-card__header--compact">
          <div>
            <h3 className="crossover-card__title">Quick Push</h3>
            <p className="crossover-card__subtitle">Default owner complaint reminders for fast handler alerts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-admin-muted">
              Display minutes
              <input
                className="admin-input w-28"
                type="number"
                min={1}
                max={240}
                value={quickPushDurationMinutes}
                onChange={(event) => setQuickPushDurationMinutes(event.target.value)}
              />
            </label>
            {loading ? <span className="admin-badge">Loading…</span> : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {(data?.defaultNotices ?? []).map((notice) => (
            <button
              key={notice.title}
              type="button"
              className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-left transition hover:border-red-200/60 hover:bg-red-500/20 disabled:opacity-50"
              disabled={busy || !canManage}
              onClick={() => void pushDefault(notice)}
            >
              <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-full bg-red-400 text-slate-950">
                <BellRing className="h-5 w-5" />
              </div>
              <p className="text-base font-black uppercase leading-tight text-white">{notice.title}</p>
              {notice.message ? <p className="mt-2 text-sm text-admin-muted">{notice.message}</p> : null}
            </button>
          ))}
        </div>
      </section>

      {canPushDogHandler ? (
        <section className="push-notice-dog-handler-card crossover-card crossover-card--create p-5">
          <div className="crossover-card__header crossover-card__header--compact">
            <div className="crossover-card__header-main">
              <div className="crossover-icon-tile h-12 w-12 text-red-300">
                <UserRound className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="crossover-card__title">{DOG_HANDLER_COMPLAINT_NOTICE_LABEL}</h3>
                  <span className="crossover-badge crossover-badge--urgent">Urgent</span>
                </div>
                <p className="crossover-card__subtitle">
                  Sends a notice to the Staff Digital Whiteboard and creates a management write-up report.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="grid gap-2">
              <span className="admin-label">Dog Handler Name</span>
              <input
                className={`crossover-input ${dogHandlerError ? "push-notice-dog-handler-card__input--error" : ""}`}
                placeholder="Enter dog handler name..."
                value={dogHandlerName}
                maxLength={80}
                disabled={busy}
                onChange={(event) => {
                  setDogHandlerName(event.target.value);
                  if (dogHandlerError) setDogHandlerError("");
                }}
              />
              {dogHandlerError ? <span className="push-notice-dog-handler-card__error">{dogHandlerError}</span> : null}
              <span className="text-xs text-admin-muted">This creates an internal report for admin and management users.</span>
            </label>
            <button
              type="button"
              className="crossover-btn crossover-btn--primary inline-flex min-h-[3rem] items-center justify-center gap-2 px-6"
              disabled={busy}
              onClick={() => void pushDogHandlerComplaint()}
            >
              <Send className="h-4 w-4" aria-hidden />
              {busy ? "Pushing…" : "Push Notice"}
            </button>
          </div>
        </section>
      ) : null}

      {canViewReports ? (
        <section className="crossover-card crossover-card--sidebar p-5">
          <div className="crossover-card__header crossover-card__header--compact">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[var(--crossover-gold)]" aria-hidden />
              <h3 className="crossover-card__title">Management Write-Up Reports</h3>
            </div>
            <span className="crossover-link-btn">Admin &amp; Management only</span>
          </div>
          <div className="grid gap-3">
            {managementReports.length ? managementReports.slice(0, 8).map((report) => (
              <article key={report.id} className="push-notice-management-report">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="crossover-badge crossover-badge--urgent">{report.status.toUpperCase()}</span>
                  <span className="text-xs text-admin-muted">{formatDateTime(report.created_at)}</span>
                </div>
                <h4 className="mt-2 font-black text-white">{report.title}</h4>
                <p className="mt-1 text-sm text-admin-muted">
                  Dog Handler: <span className="font-bold text-white">{report.dog_handler_name}</span>
                </p>
                <p className="mt-2 text-sm text-admin-muted">{report.summary}</p>
                <p className="mt-2 text-xs text-admin-muted">
                  Created by {report.created_by ?? "admin"} • Source: {report.source.replace("_", " ")}
                </p>
              </article>
            )) : (
              <p className="text-sm text-admin-muted">No management write-up reports yet.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="crossover-card p-5">
          <h3 className="crossover-card__title">Create Custom Notice</h3>
          <p className="crossover-card__subtitle mb-4">Create a staff-only alert and push it live immediately or save it for later.</p>
          <NoticeForm form={form} onChange={setForm} />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" disabled={busy || !canManage} onClick={() => void saveCustom()}>
              <Plus className="h-4 w-4" /> Save Custom
            </button>
            <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" disabled={busy || !canManage || !form.scheduled_at} onClick={() => void scheduleCustom()}>
              <BellRing className="h-4 w-4" /> Schedule Notice
            </button>
            <button type="button" className="crossover-btn crossover-btn--primary inline-flex items-center gap-2" disabled={busy || !canManage} onClick={() => void pushCustom()}>
              <Send className="h-4 w-4" /> Push Notice
            </button>
          </div>
        </div>

        <div className="crossover-card crossover-card--sidebar p-5">
          <h3 className="crossover-card__title">Active Notice</h3>
          <p className="crossover-card__subtitle mb-4">Currently showing on the Staff Digital Whiteboard.</p>
          {data?.activeNotice ? (
            <ActiveNoticePreview notice={data.activeNotice} />
          ) : (
            <div className="rounded-2xl border border-admin-border bg-white/[0.03] p-5 text-sm text-admin-muted">
              No active notice is currently pushed.
            </div>
          )}
          <button
            type="button"
            className="crossover-btn crossover-btn--outline mt-4 inline-flex w-full items-center justify-center gap-2"
            disabled={busy || !canManage || !data?.activeNotice}
            onClick={() => void clearActive()}
          >
            <XCircle className="h-4 w-4" /> Clear Active Notice
          </button>
        </div>
      </section>

      <section className="crossover-card crossover-card--conversations">
        <div className="crossover-card__header">
          <div>
            <h3 className="crossover-card__title">Recent Notice History</h3>
            <p className="crossover-card__subtitle">Push previous notices again, or edit and delete custom notices.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-admin-border text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-admin-muted">
              <tr>
                <th className="px-4 py-3">Notice title</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Created time</th>
                <th className="px-4 py-3">Cleared / expires</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-border">
              {history.length ? history.map((notice) => (
                <tr key={notice.id} className="text-admin-muted">
                  <td className="max-w-xs px-4 py-3 font-semibold text-white">{noticeHistoryTitle(notice)}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={notice.priority} /></td>
                  <td className="px-4 py-3">{noticeStatus(notice)}</td>
                  <td className="px-4 py-3">{notice.created_by ?? "admin"}</td>
                  <td className="px-4 py-3">{formatDateTime(notice.created_at)}</td>
                  <td className="px-4 py-3">{notice.cleared_at ? formatDateTime(notice.cleared_at) : formatDateTime(notice.expires_at)}</td>
                  <td className="px-4 py-3">{scheduleLabel(notice)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="admin-icon-btn" disabled={busy || !canManage} aria-label={`Push ${notice.title} again`} onClick={() => void pushAgain(notice)}>
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      {!notice.is_default ? (
                        <>
                          <button type="button" className="admin-icon-btn" disabled={busy || !canManage} aria-label={`Edit ${notice.title}`} onClick={() => setEditingNotice(notice)}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" className="admin-icon-btn" disabled={busy || !canManage} aria-label={`Delete ${notice.title}`} onClick={() => setDeleteNotice(notice)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="px-4 py-8 text-center text-admin-muted" colSpan={8}>
                    No Push Notices have been created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EditNoticeModal
        notice={editingNotice}
        busy={busy}
        onClose={() => setEditingNotice(null)}
        onSave={async (payload) => {
          if (!editingNotice) return;
          await mutate(
            "Unable to update notice.",
            () => fetch(`/api/admin/push-notices/${editingNotice.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload)
            }),
            "Notice updated."
          );
          setEditingNotice(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteNotice)}
        title="Delete custom notice?"
        description={`This permanently deletes ${deleteNotice?.title ?? "this notice"}.`}
        confirmLabel="Delete notice"
        danger
        busy={busy}
        onCancel={() => setDeleteNotice(null)}
        onConfirm={async () => {
          if (!deleteNotice) return;
          await mutate(
            "Unable to delete notice.",
            () => fetch(`/api/admin/push-notices/${deleteNotice.id}`, { method: "DELETE" }),
            "Notice deleted."
          );
          setDeleteNotice(null);
        }}
      />
    </div>
  );
}

function NoticeForm({ form, onChange }: { form: NoticeFormState; onChange: (form: NoticeFormState) => void }) {
  return (
    <div className="grid gap-4">
      <Field label="Notice title">
        <input className="admin-input" value={form.title} maxLength={120} onChange={(event) => onChange({ ...form, title: event.target.value })} />
      </Field>
      <Field label="Notice message">
        <textarea className="admin-input min-h-[110px]" value={form.message} maxLength={600} onChange={(event) => onChange({ ...form, message: event.target.value })} />
      </Field>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Priority level">
          <select className="admin-input" value={form.priority} onChange={(event) => onChange({ ...form, priority: event.target.value as StaffPushNoticePriority })}>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        <Field label="Optional expiration time">
          <input className="admin-input" type="datetime-local" value={form.expires_at} onChange={(event) => onChange({ ...form, expires_at: event.target.value })} />
        </Field>
        <Field label="Display minutes">
          <input className="admin-input" type="number" min={1} max={240} value={form.display_duration_minutes} onChange={(event) => onChange({ ...form, display_duration_minutes: event.target.value })} />
        </Field>
        <Field label="Optional display mode">
          <select className="admin-input" value={form.display_mode} onChange={(event) => onChange({ ...form, display_mode: event.target.value as StaffPushNoticeDisplayMode })}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
      </div>
      <div className="rounded-2xl border border-admin-border bg-white/[0.03] p-4">
        <label className="admin-toggle-row mb-4">
          <span className="text-sm font-bold text-white">Schedule for later</span>
          <button type="button" role="switch" aria-checked={form.schedule_enabled} className={`admin-toggle ${form.schedule_enabled ? "admin-toggle--on" : ""}`} onClick={() => onChange({ ...form, schedule_enabled: !form.schedule_enabled })}>
            <span className="admin-toggle__knob" />
          </button>
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Scheduled date and time">
            <input className="admin-input" type="datetime-local" value={form.scheduled_at} onChange={(event) => onChange({ ...form, scheduled_at: event.target.value, schedule_enabled: Boolean(event.target.value) || form.schedule_enabled })} />
          </Field>
          <Field label="Recurring">
            <select className="admin-input" value={form.recurrence} onChange={(event) => onChange({ ...form, recurrence: event.target.value as StaffPushNoticeRecurrence, schedule_enabled: event.target.value !== "none" || form.schedule_enabled })}>
              <option value="none">Does not repeat</option>
              <option value="day">Every day</option>
              <option value="week">Every week</option>
              <option value="month">Every month</option>
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">{label}</span>
      {children}
    </label>
  );
}

function ActiveNoticePreview({ notice }: { notice: StaffPushNotice }) {
  return (
    <div className={`rounded-3xl border p-5 ${notice.display_mode === "urgent" ? "border-red-300/40 bg-red-500/10" : "border-admin-border bg-white/[0.03]"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <PriorityBadge priority={notice.priority} />
        <span className="text-xs font-semibold text-admin-muted">
          Duration: {notice.display_duration_minutes ?? 5} min • Expires: {formatDateTime(notice.expires_at)}
        </span>
      </div>
      <h4 className="text-2xl font-black uppercase leading-tight text-white">
        {isDogHandlerComplaintNotice(notice) ? DOG_HANDLER_COMPLAINT_NOTICE_LABEL : notice.title}
      </h4>
      {isDogHandlerComplaintNotice(notice) && notice.dog_handler_name ? (
        <p className="mt-2 text-lg font-bold text-amber-200">Dog Handler: {notice.dog_handler_name}</p>
      ) : null}
      {notice.message ? <p className="mt-3 text-sm text-admin-muted">{notice.message}</p> : null}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: StaffPushNoticePriority }) {
  const className = priority === "urgent" ? "admin-badge admin-badge--amber" : priority === "important" ? "admin-badge" : "admin-badge admin-badge--green";
  return <span className={className}>{priorityLabels[priority]}</span>;
}

function EditNoticeModal({
  notice,
  busy,
  onClose,
  onSave
}: {
  notice: StaffPushNotice | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: NoticeFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<NoticeFormState>(emptyForm);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setForm({
        title: notice.title,
        message: notice.message ?? "",
        priority: notice.priority,
        display_mode: notice.display_mode,
        expires_at: toLocalDateTimeInput(notice.expires_at),
        display_duration_minutes: String(notice.display_duration_minutes ?? 5),
        schedule_enabled: Boolean(notice.schedule_enabled),
        scheduled_at: toLocalDateTimeInput(notice.scheduled_at ?? notice.next_scheduled_at ?? null),
        recurrence: notice.recurrence ?? "none"
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <Modal
      open={Boolean(notice)}
      title="Edit Custom Notice"
      description="Update the saved custom notice. Push it again from history when ready."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void onSave(form)}>
            {busy ? "Saving…" : "Save notice"}
          </button>
        </div>
      }
    >
      <NoticeForm form={form} onChange={setForm} />
    </Modal>
  );
}
