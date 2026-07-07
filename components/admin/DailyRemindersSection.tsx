"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  Copy,
  History,
  Pencil,
  Power,
  PowerOff,
  Send
} from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import {
  DAILY_REMINDER_AUDIENCE_OPTIONS,
  DAILY_REMINDER_DAY_OPTIONS,
  DAILY_REMINDER_DISPLAY_DURATION_OPTIONS,
  DAILY_REMINDER_PRIORITY_OPTIONS,
  DAILY_REMINDER_SHIFT_GROUP_OPTIONS,
  DEFAULT_DAILY_REMINDER_FOOTER,
  formatDailyReminderAudience,
  formatDailyReminderShiftGroup,
  formatDailyReminderTime,
  type DailyReminderPriority,
  type DailyReminderRow,
  type DailyReminderSendType,
  type DailyReminderShiftGroup,
  type DailyReminderTodayStatus
} from "@/lib/staff/daily-reminders";

type DailyRemindersPayload = {
  reminders: DailyReminderRow[];
  shiftDate: string;
  swingHandlerPresent: boolean;
  permissions: {
    canEdit: boolean;
    canSendEarly: boolean;
    canForceResend: boolean;
  };
};

type HistoryRow = {
  id: string;
  daily_reminder_id: string;
  shift_date: string;
  sent_at: string;
  sent_type: DailyReminderSendType;
  sent_by_name: string | null;
  push_notice_id: string | null;
  skipped_reason: string | null;
  reminder_title: string | null;
};

const statusLabels: Record<DailyReminderTodayStatus, string> = {
  pending_today: "Pending Today",
  sent_early_today: "Sent Early Today",
  sent_automatic_today: "Sent Automatically Today",
  force_resent_today: "Force Resent Today",
  queued_today: "Queued Today",
  skipped_today: "Skipped Today",
  inactive: "Inactive",
  not_scheduled_today: "Not Scheduled Today",
  swing_handler_off: "Swing Handler Off"
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

type EditFormState = {
  title: string;
  message: string;
  scheduled_time: string;
  audience: string[];
  shift_group: DailyReminderShiftGroup;
  priority: DailyReminderPriority;
  display_duration_seconds: number;
  active_days: string[];
  requires_swing_handler: boolean;
  is_active: boolean;
  footer_text: string;
  internal_notes: string;
};

function reminderToForm(reminder: DailyReminderRow): EditFormState {
  return {
    title: reminder.title,
    message: reminder.message,
    scheduled_time: reminder.scheduled_time.slice(0, 5),
    audience: [...reminder.audience],
    shift_group: reminder.shift_group,
    priority: reminder.priority,
    display_duration_seconds: reminder.display_duration_seconds,
    active_days: [...reminder.active_days],
    requires_swing_handler: reminder.requires_swing_handler,
    is_active: reminder.is_active,
    footer_text: reminder.footer_text ?? DEFAULT_DAILY_REMINDER_FOOTER,
    internal_notes: reminder.internal_notes ?? ""
  };
}

export function DailyRemindersSection({ canView }: { canView: boolean }) {
  const { showToast } = useToast();
  const [data, setData] = useState<DailyRemindersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DailyReminderRow | null>(null);
  const [form, setForm] = useState<EditFormState | null>(null);
  const [sendEarlyTarget, setSendEarlyTarget] = useState<DailyReminderRow | null>(null);
  const [historyReminder, setHistoryReminder] = useState<DailyReminderRow | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/push-notices/daily-reminders", { cache: "no-store" });
      const body = (await response.json()) as DailyRemindersPayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load Daily Reminders.");
      setData(body);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load Daily Reminders.", "error");
    } finally {
      setLoading(false);
    }
  }, [canView, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const permissions = data?.permissions ?? { canEdit: false, canSendEarly: false, canForceResend: false };

  async function mutate(message: string, run: () => Promise<Response>, successMessage: string) {
    setBusy(true);
    try {
      const response = await run();
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? message);
      showToast(body.message ?? successMessage, "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSwingHandler() {
    if (!permissions.canEdit || !data) return;
    await mutate(
      "Unable to update swing handler status.",
      () =>
        fetch("/api/admin/push-notices/daily-reminders", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ swing_handler_present: !data.swingHandlerPresent })
        }),
      data.swingHandlerPresent ? "Swing handler marked off for today." : "Swing handler marked present for today."
    );
  }

  async function toggleActive(reminder: DailyReminderRow) {
    if (!permissions.canEdit) return;
    await mutate(
      "Unable to update reminder.",
      () =>
        fetch(`/api/admin/push-notices/daily-reminders/${reminder.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...reminderToForm(reminder), is_active: !reminder.is_active })
        }),
      reminder.is_active ? "Reminder disabled." : "Reminder enabled."
    );
  }

  const sortedReminders = useMemo(
    () => [...(data?.reminders ?? [])].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time)),
    [data?.reminders]
  );

  if (!canView) return null;

  return (
    <section className="crossover-card p-5">
      <div className="crossover-card__header crossover-card__header--compact mb-4">
        <div className="crossover-card__header-main">
          <div className="crossover-icon-tile h-12 w-12 text-sky-300">
            <AlarmClock className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h3 className="crossover-card__title">Daily Reminders</h3>
            <p className="crossover-card__subtitle">
              Scheduled handler reminders for the Staff Digital Whiteboard. Send early when the floor needs it — skipped at the normal time today.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {permissions.canEdit ? (
            <label className="admin-toggle-row">
              <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">Swing Handler Present</span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(data?.swingHandlerPresent)}
                className={`admin-toggle ${data?.swingHandlerPresent ? "admin-toggle--on" : ""}`}
                disabled={busy || loading}
                onClick={() => void toggleSwingHandler()}
              >
                <span className="admin-toggle__knob" />
              </button>
            </label>
          ) : null}
          {loading ? <span className="admin-badge">Loading…</span> : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="crossover-table w-full min-w-[1100px]">
          <thead>
            <tr>
              <th>Active</th>
              <th>Time</th>
              <th>Title</th>
              <th>Message</th>
              <th>Audience</th>
              <th>Shift</th>
              <th>Priority</th>
              <th>Duration</th>
              <th>Last Sent</th>
              <th>Next Send</th>
              <th>Today</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedReminders.length ? sortedReminders.map((reminder) => (
              <tr key={reminder.id}>
                <td>
                  <button
                    type="button"
                    className={`admin-icon-button ${reminder.is_active ? "text-emerald-300" : "text-admin-muted"}`}
                    disabled={busy || !permissions.canEdit}
                    title={permissions.canEdit ? "Toggle active" : "View only"}
                    onClick={() => void toggleActive(reminder)}
                  >
                    {reminder.is_active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                  </button>
                </td>
                <td className="whitespace-nowrap font-semibold text-white">{formatDailyReminderTime(reminder.scheduled_time)}</td>
                <td className="font-semibold text-white">{reminder.title}</td>
                <td className="max-w-[220px] truncate text-admin-muted" title={reminder.message}>{reminder.message}</td>
                <td>{formatDailyReminderAudience(reminder.audience)}</td>
                <td>{formatDailyReminderShiftGroup(reminder.shift_group)}</td>
                <td className="capitalize">{reminder.priority}</td>
                <td>{formatDuration(reminder.display_duration_seconds)}</td>
                <td className="whitespace-nowrap text-sm text-admin-muted">{formatDateTime(reminder.last_sent_at)}</td>
                <td className="whitespace-nowrap text-sm text-admin-muted">{formatDateTime(reminder.next_scheduled_send)}</td>
                <td>
                  <span className="crossover-badge">{statusLabels[reminder.today_status]}</span>
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {permissions.canEdit ? (
                      <button
                        type="button"
                        className="admin-button admin-button--ghost admin-button--xs"
                        disabled={busy}
                        onClick={() => {
                          setEditing(reminder);
                          setForm(reminderToForm(reminder));
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    ) : null}
                    {permissions.canSendEarly ? (
                      <button
                        type="button"
                        className="admin-button admin-button--primary admin-button--xs"
                        disabled={busy || !reminder.can_send_early}
                        title={reminder.send_early_disabled_reason ?? "Send this reminder now"}
                        onClick={() => setSendEarlyTarget(reminder)}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {reminder.today_status === "sent_early_today" || reminder.today_status === "sent_automatic_today"
                          ? "Sent"
                          : "Send Early?"}
                      </button>
                    ) : null}
                    {permissions.canEdit ? (
                      <>
                        <button
                          type="button"
                          className="admin-button admin-button--ghost admin-button--xs"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              "Unable to duplicate reminder.",
                              () => fetch(`/api/admin/push-notices/daily-reminders/${reminder.id}/duplicate`, { method: "POST" }),
                              "Reminder duplicated."
                            )
                          }
                        >
                          <Copy className="h-3.5 w-3.5" /> Duplicate
                        </button>
                        <button
                          type="button"
                          className="admin-button admin-button--ghost admin-button--xs"
                          disabled={busy || !reminder.is_active}
                          onClick={() =>
                            void mutate(
                              "Unable to disable reminder.",
                              () => fetch(`/api/admin/push-notices/daily-reminders/${reminder.id}/disable`, { method: "POST" }),
                              "Reminder disabled."
                            )
                          }
                        >
                          Disable
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="admin-button admin-button--ghost admin-button--xs"
                      disabled={busy}
                      onClick={async () => {
                        setHistoryReminder(reminder);
                        try {
                          const response = await fetch(
                            `/api/admin/push-notices/daily-reminders/history?reminder_id=${reminder.id}&limit=50`,
                            { cache: "no-store" }
                          );
                          const body = (await response.json()) as { history?: HistoryRow[]; error?: string };
                          if (!response.ok) throw new Error(body.error ?? "Unable to load history.");
                          setHistoryRows(body.history ?? []);
                        } catch (error) {
                          showToast(error instanceof Error ? error.message : "Unable to load history.", "error");
                        }
                      }}
                    >
                      <History className="h-3.5 w-3.5" /> History
                    </button>
                    {permissions.canForceResend &&
                    (reminder.today_status === "sent_early_today" || reminder.today_status === "sent_automatic_today") ? (
                      <button
                        type="button"
                        className="admin-button admin-button--ghost admin-button--xs"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            "Unable to force resend reminder.",
                            () =>
                              fetch(`/api/admin/push-notices/daily-reminders/${reminder.id}/send-early`, {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ force: true })
                              }),
                            "Reminder force-sent."
                          )
                        }
                      >
                        Force Send Again
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={12} className="crossover-table__empty-row text-admin-muted">
                  {loading ? "Loading Daily Reminders…" : "No Daily Reminders configured yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditDailyReminderModal
        open={Boolean(editing && form)}
        busy={busy}
        form={form}
        onClose={() => {
          setEditing(null);
          setForm(null);
        }}
        onChange={setForm}
        onSave={async () => {
          if (!editing || !form) return;
          await mutate(
            "Unable to save reminder.",
            () =>
              fetch(`/api/admin/push-notices/daily-reminders/${editing.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(form)
              }),
            "Daily Reminder updated."
          );
          setEditing(null);
          setForm(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(sendEarlyTarget)}
        title="Send this reminder early?"
        description="Send this reminder to the Staff Digital Whiteboard now? It will not send again at its scheduled time today."
        confirmLabel="Send Early"
        busy={busy}
        onCancel={() => setSendEarlyTarget(null)}
        onConfirm={async () => {
          if (!sendEarlyTarget) return;
          await mutate(
            "Unable to send reminder early.",
            () =>
              fetch(`/api/admin/push-notices/daily-reminders/${sendEarlyTarget.id}/send-early`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({})
              }),
            "Reminder sent early and will be skipped at its scheduled time today."
          );
          setSendEarlyTarget(null);
        }}
      />

      <Modal
        open={Boolean(historyReminder)}
        title={historyReminder ? `History — ${historyReminder.title}` : "History"}
        onClose={() => {
          setHistoryReminder(null);
          setHistoryRows([]);
        }}
      >
        <div className="max-h-[420px] overflow-y-auto">
          <table className="crossover-table w-full">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Sent By</th>
                <th>Sent At</th>
                <th>Push Notice</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.length ? historyRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.shift_date}</td>
                  <td className="capitalize">{row.skipped_reason ? `Skipped (${row.skipped_reason})` : row.sent_type.replace("_", " ")}</td>
                  <td>{row.sent_by_name ?? "Scheduler"}</td>
                  <td>{formatDateTime(row.sent_at)}</td>
                  <td className="font-mono text-xs">{row.push_notice_id ?? "—"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="crossover-table__empty-row text-admin-muted">No sends recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </section>
  );
}

function EditDailyReminderModal({
  open,
  busy,
  form,
  onClose,
  onChange,
  onSave
}: {
  open: boolean;
  busy: boolean;
  form: EditFormState | null;
  onClose: () => void;
  onChange: (form: EditFormState | null) => void;
  onSave: () => Promise<void>;
}) {
  if (!form) return null;

  function toggleAudience(value: string) {
    const next = form!.audience.includes(value)
      ? form!.audience.filter((item) => item !== value)
      : [...form!.audience, value];
    onChange({ ...form!, audience: next.length ? next : ["dog_handler"] });
  }

  function toggleDay(day: string) {
    const next = form!.active_days.includes(day)
      ? form!.active_days.filter((item) => item !== day)
      : [...form!.active_days, day];
    onChange({ ...form!, active_days: next.length ? next : [...DAILY_REMINDER_DAY_OPTIONS] });
  }

  return (
    <Modal open={open} title="Edit Daily Reminder" onClose={onClose}>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="admin-label">Title</span>
          <input className="admin-input" value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="admin-label">Message</span>
          <textarea className="admin-input min-h-[120px]" value={form.message} onChange={(e) => onChange({ ...form, message: e.target.value })} />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2">
            <span className="admin-label">Scheduled time</span>
            <input className="admin-input" type="time" value={form.scheduled_time} onChange={(e) => onChange({ ...form, scheduled_time: e.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="admin-label">Shift group</span>
            <select className="admin-input" value={form.shift_group} onChange={(e) => onChange({ ...form, shift_group: e.target.value as DailyReminderShiftGroup })}>
              {DAILY_REMINDER_SHIFT_GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="admin-label">Priority</span>
            <select className="admin-input" value={form.priority} onChange={(e) => onChange({ ...form, priority: e.target.value as DailyReminderPriority })}>
              {DAILY_REMINDER_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2">
          <span className="admin-label">Audience</span>
          <div className="flex flex-wrap gap-3">
            {DAILY_REMINDER_AUDIENCE_OPTIONS.map((option) => (
              <label key={option.value} className="inline-flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={form.audience.includes(option.value)} onChange={() => toggleAudience(option.value)} />
                {option.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <span className="admin-label">Days active</span>
          <div className="flex flex-wrap gap-2">
            {DAILY_REMINDER_DAY_OPTIONS.map((day) => (
              <button
                key={day}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${form.active_days.includes(day) ? "bg-sky-500/20 text-sky-200" : "bg-white/5 text-admin-muted"}`}
                onClick={() => toggleDay(day)}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="admin-label">Display duration</span>
            <select
              className="admin-input"
              value={form.display_duration_seconds}
              onChange={(e) => onChange({ ...form, display_duration_seconds: Number(e.target.value) })}
            >
              {DAILY_REMINDER_DISPLAY_DURATION_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>{formatDuration(seconds)}</option>
              ))}
            </select>
          </label>
          <label className="admin-toggle-row mt-7">
            <span className="text-sm font-bold text-white">Requires Swing Handler Present</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.requires_swing_handler}
              className={`admin-toggle ${form.requires_swing_handler ? "admin-toggle--on" : ""}`}
              onClick={() => onChange({ ...form, requires_swing_handler: !form.requires_swing_handler })}
            >
              <span className="admin-toggle__knob" />
            </button>
          </label>
        </div>
        <label className="grid gap-2">
          <span className="admin-label">Footer / support text</span>
          <input className="admin-input" value={form.footer_text} onChange={(e) => onChange({ ...form, footer_text: e.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="admin-label">Internal admin notes</span>
          <textarea className="admin-input min-h-[80px]" value={form.internal_notes} onChange={(e) => onChange({ ...form, internal_notes: e.target.value })} />
        </label>
        <label className="admin-toggle-row">
          <span className="text-sm font-bold text-white">Active</span>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_active}
            className={`admin-toggle ${form.is_active ? "admin-toggle--on" : ""}`}
            onClick={() => onChange({ ...form, is_active: !form.is_active })}
          >
            <span className="admin-toggle__knob" />
          </button>
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" className="admin-button admin-button--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="admin-button admin-button--primary" disabled={busy} onClick={() => void onSave()}>Save reminder</button>
        </div>
      </div>
    </Modal>
  );
}
