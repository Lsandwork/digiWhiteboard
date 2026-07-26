"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  Plus,
  RefreshCw,
  UserRound
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import {
  formatCompletedAt,
  formatDueTime,
  myTaskBucketLabel,
  roleLabel,
  statusLabel,
  statusToneClass
} from "@/lib/operations-checklist/display";
import {
  OPERATIONS_CHECKLIST_ROLES,
  OPERATIONS_CHECKLIST_STATUSES,
  type OperationsChecklistItemView,
  type OperationsChecklistPayload,
  type OperationsChecklistRole,
  type OperationsChecklistSectionKey,
  type OperationsChecklistStatus
} from "@/lib/operations-checklist/types";

type NoteMode = "add_note" | "report_problem" | "request_help" | "return_task" | null;

const SECTION_KEYS: OperationsChecklistSectionKey[] = [
  "opening_crossover",
  "morning_dog_care",
  "check_in_flow",
  "yard_operations",
  "walks_and_services",
  "midday_operations",
  "grooming_flow",
  "training_flow",
  "transportation_flow",
  "checkout_flow",
  "incidents_vet_followup",
  "afternoon_crossover",
  "closing_operations"
];

export function OperationsChecklistPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<OperationsChecklistPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [noteMode, setNoteMode] = useState<NoteMode>(null);
  const [noteTarget, setNoteTarget] = useState<OperationsChecklistItemView | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskRole, setNewTaskRole] = useState<OperationsChecklistRole>("all_staff");
  const [newTaskDue, setNewTaskDue] = useState("12:00");
  const [newTaskSection, setNewTaskSection] = useState<OperationsChecklistSectionKey>("midday_operations");
  const [metaManager, setMetaManager] = useState("");
  const [metaClockedIn, setMetaClockedIn] = useState("");
  const [metaCrossover, setMetaCrossover] = useState("");
  const [assignUserId, setAssignUserId] = useState<Record<string, string>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/admin/operations-checklist", { cache: "no-store" });
      const body = (await response.json()) as OperationsChecklistPayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load Operations Checklist.");
      setData(body);
      setMetaManager(body.day_meta.manager_on_duty_name ?? "");
      setMetaClockedIn(body.day_meta.clocked_in_names.join(", "));
      setMetaCrossover(body.day_meta.crossover_notes ?? "");
      setExpandedSections((prev) => {
        if (Object.keys(prev).length) return prev;
        const next: Record<string, boolean> = {};
        for (const section of body.sections) {
          next[section.section_key] = section.items.some((item) => item.role_match && item.status !== "completed");
        }
        return next;
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load Operations Checklist.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function runAction(action: string, payload: Record<string, unknown> = {}, busyKey?: string) {
    setBusyId(busyKey ?? action);
    try {
      const response = await fetch("/api/admin/operations-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Action failed.");
      await load(true);
      showToast("Checklist updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Action failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function submitNote() {
    if (!noteMode || !noteTarget) return;
    await runAction(noteMode, { instance_id: noteTarget.id, note: noteText }, noteTarget.id);
    setNoteMode(null);
    setNoteTarget(null);
    setNoteText("");
  }

  const openItemCount = useMemo(() => {
    if (!data) return 0;
    return data.sections.reduce(
      (sum, section) =>
        sum + section.items.filter((item) => item.status !== "completed" && item.status !== "not_applicable").length,
      0
    );
  }, [data]);

  if (loading && !data) {
    return (
      <section className="ops-check-page">
        <p className="text-sm text-admin-muted">Loading Operations Checklist…</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="ops-check-page">
        <p className="text-sm text-admin-muted">Unable to load Operations Checklist.</p>
      </section>
    );
  }

  const { header, permissions, my_tasks: myTasks, sections } = data;

  return (
    <section className="ops-check-page space-y-5">
      <header className="ops-check-header">
        <div className="ops-check-header__title-row">
          <div className="ops-check-header__icon">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h2 className="admin-page-title">Operations Checklist</h2>
            <p className="admin-page-subtitle">
              Full operational flow for every staff role. Tasks for your role appear first.
            </p>
          </div>
          <div className="ops-check-header__actions">
            <button type="button" className="admin-btn-secondary" onClick={() => void load()} disabled={Boolean(busyId)}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {permissions.canExport ? (
              <>
                <a className="admin-btn-secondary" href="/api/admin/operations-checklist?export=day">
                  <Download className="h-4 w-4" />
                  Daily export
                </a>
                <a className="admin-btn-secondary" href="/api/admin/operations-checklist?export=week">
                  <Download className="h-4 w-4" />
                  Weekly export
                </a>
              </>
            ) : null}
            {permissions.canManage ? (
              <button type="button" className="admin-btn-primary" onClick={() => setShowManage((value) => !value)}>
                Management
              </button>
            ) : null}
          </div>
        </div>

        <div className="ops-check-stats">
          <div className="ops-check-stat">
            <span className="ops-check-stat__label">Date & shift</span>
            <strong>
              {header.current_date_label}
              <br />
              <span className="ops-check-stat__sub">{header.shift_label}</span>
            </strong>
          </div>
          <div className="ops-check-stat">
            <span className="ops-check-stat__label">Staff clocked in</span>
            <strong>{header.clocked_in.length ? header.clocked_in.join(", ") : "Not set"}</strong>
          </div>
          <div className="ops-check-stat">
            <span className="ops-check-stat__label">Manager on duty</span>
            <strong>{header.manager_on_duty || "Not set"}</strong>
          </div>
          <div className="ops-check-stat">
            <span className="ops-check-stat__label">Completion</span>
            <strong>
              {header.completion_percent}%
              <span className="ops-check-stat__sub">
                {" "}
                ({header.completed_count}/{header.total_count})
              </span>
            </strong>
            <div className="ops-check-progress">
              <div className="ops-check-progress__bar" style={{ width: `${header.completion_percent}%` }} />
            </div>
          </div>
          <div className="ops-check-stat">
            <span className="ops-check-stat__label">Open alerts / incidents</span>
            <strong>
              {header.open_alerts} alerts · {header.open_incidents} incidents
            </strong>
          </div>
          <div className="ops-check-stat">
            <span className="ops-check-stat__label">Vet / owner follow-ups</span>
            <strong>
              {header.open_vet_visits} vet · {header.open_owner_follow_ups} follow-ups
            </strong>
          </div>
        </div>

        {header.previous_crossover_notes ? (
          <div className="ops-check-crossover">
            <strong>Previous-shift crossover notes</strong>
            <p>{header.previous_crossover_notes}</p>
          </div>
        ) : (
          <div className="ops-check-crossover ops-check-crossover--empty">
            <strong>Previous-shift crossover notes</strong>
            <p>No crossover notes recorded for the previous shift.</p>
          </div>
        )}
      </header>

      {showManage && permissions.canManage ? (
        <section className="ops-check-manage space-y-4">
          <h3 className="text-lg font-semibold">Management controls</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="ops-check-field">
              <span>Manager on duty</span>
              <input value={metaManager} onChange={(event) => setMetaManager(event.target.value)} placeholder="Name" />
            </label>
            <label className="ops-check-field">
              <span>Staff currently clocked in</span>
              <input
                value={metaClockedIn}
                onChange={(event) => setMetaClockedIn(event.target.value)}
                placeholder="Comma-separated names"
              />
            </label>
          </div>
          <label className="ops-check-field">
            <span>Crossover notes for next shift</span>
            <textarea
              value={metaCrossover}
              onChange={(event) => setMetaCrossover(event.target.value)}
              rows={3}
              placeholder="Notes that carry into tomorrow’s checklist header"
            />
          </label>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={busyId === "update_day_meta"}
            onClick={() =>
              void runAction(
                "update_day_meta",
                {
                  shift_date: header.shift_date,
                  manager_on_duty_name: metaManager,
                  clocked_in_names: metaClockedIn,
                  crossover_notes: metaCrossover
                },
                "update_day_meta"
              )
            }
          >
            Save day header
          </button>

          <div className="ops-check-manage__create">
            <h4 className="font-semibold">Create recurring task</h4>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="ops-check-field md:col-span-2">
                <span>Task</span>
                <input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} />
              </label>
              <label className="ops-check-field">
                <span>Role</span>
                <select value={newTaskRole} onChange={(event) => setNewTaskRole(event.target.value as OperationsChecklistRole)}>
                  {OPERATIONS_CHECKLIST_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ops-check-field">
                <span>Due time</span>
                <input type="time" value={newTaskDue} onChange={(event) => setNewTaskDue(event.target.value)} />
              </label>
              <label className="ops-check-field md:col-span-2">
                <span>Section</span>
                <select
                  value={newTaskSection}
                  onChange={(event) => setNewTaskSection(event.target.value as OperationsChecklistSectionKey)}
                >
                  {SECTION_KEYS.map((key) => {
                    const label = sections.find((section) => section.section_key === key)?.section_label ?? key;
                    return (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="admin-btn-primary mt-3"
              disabled={!newTaskTitle.trim() || busyId === "create_recurring_task"}
              onClick={() => {
                void (async () => {
                  await runAction(
                    "create_recurring_task",
                    {
                      title: newTaskTitle,
                      assigned_role: newTaskRole,
                      due_time: newTaskDue,
                      section_key: newTaskSection,
                      section_label: sections.find((section) => section.section_key === newTaskSection)?.section_label,
                      section_sort: sections.find((section) => section.section_key === newTaskSection)?.section_sort ?? 50,
                      requires_photo: false,
                      requires_management_approval: false
                    },
                    "create_recurring_task"
                  );
                  setNewTaskTitle("");
                })();
              }}
            >
              <Plus className="h-4 w-4" />
              Add recurring task
            </button>
          </div>

          {data.completion_stats ? (
            <div className="ops-check-manage__stats grid gap-3 md:grid-cols-3">
              <div>
                <h4 className="font-semibold mb-2">By employee</h4>
                <ul className="ops-check-mini-list">
                  {data.completion_stats.by_employee.slice(0, 8).map((row) => (
                    <li key={row.name}>
                      {row.name}: {row.completed}/{row.total}
                    </li>
                  ))}
                  {!data.completion_stats.by_employee.length ? <li>No completions yet.</li> : null}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">By role</h4>
                <ul className="ops-check-mini-list">
                  {data.completion_stats.by_role.map((row) => (
                    <li key={row.role}>
                      {row.label}: {row.completed}/{row.total}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Missed / overdue</h4>
                <ul className="ops-check-mini-list">
                  {data.completion_stats.overdue.slice(0, 8).map((item) => (
                    <li key={item.id}>{item.title}</li>
                  ))}
                  {!data.completion_stats.overdue.length ? <li>None right now.</li> : null}
                </ul>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="ops-check-my-tasks">
        <div className="ops-check-section-head">
          <h3>My Tasks</h3>
          <span>
            {myTasks.length} personal · {openItemCount} open overall
          </span>
        </div>
        {!myTasks.length ? (
          <p className="ops-check-empty">No personal tasks due right now. Review the full operational flow below.</p>
        ) : (
          <div className="ops-check-table-wrap">
            <table className="ops-check-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assigned Role</th>
                  <th>Due Time</th>
                  <th>Status</th>
                  <th>Completed By</th>
                  <th>Time Completed</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    busyId={busyId}
                    permissionsCanManage={permissions.canManage}
                    assignableUsers={data.assignable_users}
                    assignUserId={assignUserId[item.id] ?? ""}
                    onAssignUserId={(value) => setAssignUserId((prev) => ({ ...prev, [item.id]: value }))}
                    onAction={runAction}
                    onNote={(mode) => {
                      setNoteTarget(item);
                      setNoteMode(mode);
                      setNoteText("");
                    }}
                    highlight
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sections.map((section) => {
        const open = expandedSections[section.section_key] ?? false;
        return (
          <section key={section.section_key} className="ops-check-section">
            <button
              type="button"
              className="ops-check-section-head ops-check-section-head--button"
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  [section.section_key]: !open
                }))
              }
            >
              <span className="inline-flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <h3>{section.section_label}</h3>
              </span>
              <span>
                {section.completion_percent}% · {section.items.length} tasks
              </span>
            </button>
            {open ? (
              <div className="ops-check-table-wrap">
                <table className="ops-check-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Assigned Role</th>
                      <th>Due Time</th>
                      <th>Status</th>
                      <th>Completed By</th>
                      <th>Time Completed</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <TaskRow
                        key={item.id}
                        item={item}
                        busyId={busyId}
                        permissionsCanManage={permissions.canManage}
                        assignableUsers={data.assignable_users}
                        assignUserId={assignUserId[item.id] ?? ""}
                        onAssignUserId={(value) => setAssignUserId((prev) => ({ ...prev, [item.id]: value }))}
                        onAction={runAction}
                        onNote={(mode) => {
                          setNoteTarget(item);
                          setNoteMode(mode);
                          setNoteText("");
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        );
      })}

      {noteMode && noteTarget ? (
        <div className="ops-check-modal-backdrop">
          <div className="ops-check-modal">
            <h3>
              {noteMode === "add_note"
                ? "Add note"
                : noteMode === "report_problem"
                  ? "Report a problem"
                  : noteMode === "request_help"
                    ? "Request help"
                    : "Return task"}
            </h3>
            <p className="text-sm text-admin-muted mb-3">{noteTarget.title}</p>
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={4}
              placeholder="Enter details…"
            />
            <div className="ops-check-modal__actions">
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => {
                  setNoteMode(null);
                  setNoteTarget(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="admin-btn-primary" onClick={() => void submitNote()} disabled={!noteText.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TaskRow(props: {
  item: OperationsChecklistItemView;
  busyId: string | null;
  permissionsCanManage: boolean;
  assignableUsers: OperationsChecklistPayload["assignable_users"];
  assignUserId: string;
  onAssignUserId: (value: string) => void;
  onAction: (action: string, payload?: Record<string, unknown>, busyKey?: string) => Promise<void>;
  onNote: (mode: NoteMode) => void;
  highlight?: boolean;
}) {
  const { item } = props;
  const busy = props.busyId === item.id;

  return (
    <tr className={props.highlight || item.role_match ? "ops-check-row--mine" : undefined}>
      <td>
        <div className="ops-check-task-cell">
          <strong>{item.title}</strong>
          <div className="ops-check-task-meta">
            {item.my_task_buckets.map((bucket) => (
              <span key={bucket} className="ops-check-chip">
                {myTaskBucketLabel(bucket)}
              </span>
            ))}
            {item.requires_photo ? <span className="ops-check-chip">Photo required</span> : null}
            {item.requires_management_approval ? <span className="ops-check-chip">Mgr approval</span> : null}
            {item.help_requested ? <span className="ops-check-chip ops-check-chip--warn">Help requested</span> : null}
            {item.pushed_to_staff_board ? <span className="ops-check-chip ops-check-chip--warn">On Staff Board</span> : null}
          </div>
        </div>
      </td>
      <td>
        {roleLabel(item.assigned_role)}
        {item.assigned_user_name ? (
          <div className="ops-check-task-meta">
            <UserRound className="inline h-3 w-3" /> {item.assigned_user_name}
          </div>
        ) : null}
      </td>
      <td>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
          {formatDueTime(item.due_time)}
        </span>
        {item.overdue ? (
          <div className="ops-check-task-meta ops-check-chip--warn">
            <AlertTriangle className="inline h-3 w-3" /> Overdue
          </div>
        ) : null}
      </td>
      <td>
        <span className={`ops-check-status ${statusToneClass(item.status)}`}>{statusLabel(item.status)}</span>
      </td>
      <td>{item.completed_by_name || "—"}</td>
      <td>{formatCompletedAt(item.completed_at)}</td>
      <td className="ops-check-notes-cell">
        {item.problem_note ? <div className="ops-check-problem">{item.problem_note}</div> : null}
        {item.return_reason ? <div className="ops-check-problem">Returned: {item.return_reason}</div> : null}
        {item.notes || "—"}
      </td>
      <td>
        <div className="ops-check-actions">
          {item.status === "not_started" || item.status === "needs_attention" || item.status === "blocked" ? (
            <button
              type="button"
              className="admin-btn-secondary ops-check-btn-sm"
              disabled={busy}
              onClick={() => void props.onAction("start_task", { instance_id: item.id }, item.id)}
            >
              Start Task
            </button>
          ) : null}
          {item.status !== "completed" && item.status !== "not_applicable" ? (
            <button
              type="button"
              className="admin-btn-primary ops-check-btn-sm"
              disabled={busy}
              onClick={() => void props.onAction("complete_task", { instance_id: item.id }, item.id)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Complete
            </button>
          ) : null}
          <button type="button" className="admin-btn-secondary ops-check-btn-sm" disabled={busy} onClick={() => props.onNote("add_note")}>
            Add Note
          </button>
          <button
            type="button"
            className="admin-btn-secondary ops-check-btn-sm"
            disabled={busy}
            onClick={() => props.onNote("report_problem")}
          >
            Report a Problem
          </button>
          <button
            type="button"
            className="admin-btn-secondary ops-check-btn-sm"
            disabled={busy}
            onClick={() => props.onNote("request_help")}
          >
            Request Help
          </button>
          {item.status !== "not_applicable" ? (
            <button
              type="button"
              className="admin-btn-secondary ops-check-btn-sm"
              disabled={busy}
              onClick={() => void props.onAction("mark_not_applicable", { instance_id: item.id }, item.id)}
            >
              Mark N/A
            </button>
          ) : null}
          {item.acknowledgment_required && !item.acknowledged_at ? (
            <button
              type="button"
              className="admin-btn-primary ops-check-btn-sm"
              disabled={busy}
              onClick={() => void props.onAction("acknowledge_alert", { instance_id: item.id }, item.id)}
            >
              Acknowledge
            </button>
          ) : null}
          {props.permissionsCanManage ? (
            <>
              <div className="ops-check-assign">
                <select value={props.assignUserId} onChange={(event) => props.onAssignUserId(event.target.value)}>
                  <option value="">Assign staff…</option>
                  {props.assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="admin-btn-secondary ops-check-btn-sm"
                  disabled={busy || !props.assignUserId}
                  onClick={() =>
                    void props.onAction(
                      "assign_task",
                      { instance_id: item.id, assigned_user_id: props.assignUserId || null },
                      item.id
                    )
                  }
                >
                  Assign
                </button>
              </div>
              <label className="ops-check-inline-field">
                Due
                <input
                  type="time"
                  defaultValue={item.due_time?.slice(0, 5) ?? ""}
                  onBlur={(event) => {
                    const value = event.target.value;
                    if (!value || value === item.due_time?.slice(0, 5)) return;
                    void props.onAction("set_due_time", { instance_id: item.id, due_time: value }, item.id);
                  }}
                />
              </label>
              <label className="ops-check-inline-field">
                Status
                <select
                  value={item.status}
                  onChange={(event) =>
                    void props.onAction(
                      "set_status",
                      { instance_id: item.id, status: event.target.value as OperationsChecklistStatus },
                      item.id
                    )
                  }
                >
                  {OPERATIONS_CHECKLIST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="admin-btn-secondary ops-check-btn-sm"
                disabled={busy}
                onClick={() =>
                  void props.onAction(
                    "set_requirements",
                    {
                      instance_id: item.id,
                      requires_photo: !item.requires_photo,
                      requires_management_approval: item.requires_management_approval
                    },
                    item.id
                  )
                }
              >
                Toggle photo req
              </button>
              <button
                type="button"
                className="admin-btn-secondary ops-check-btn-sm"
                disabled={busy}
                onClick={() =>
                  void props.onAction(
                    "set_requirements",
                    {
                      instance_id: item.id,
                      requires_photo: item.requires_photo,
                      requires_management_approval: !item.requires_management_approval
                    },
                    item.id
                  )
                }
              >
                Toggle mgr approval
              </button>
              <button type="button" className="admin-btn-secondary ops-check-btn-sm" disabled={busy} onClick={() => props.onNote("return_task")}>
                Return task
              </button>
              <button
                type="button"
                className="admin-btn-secondary ops-check-btn-sm"
                disabled={busy}
                onClick={() =>
                  void props.onAction(
                    "push_to_staff_board",
                    { instance_id: item.id, message: `Urgent checklist: ${item.title}` },
                    item.id
                  )
                }
              >
                Push to Staff Board
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
