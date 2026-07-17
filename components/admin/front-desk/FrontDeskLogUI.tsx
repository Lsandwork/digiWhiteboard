"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ClipboardList, Plus } from "lucide-react";
import type { CrossoverMessage, CrossoverReply, StaffActivityLog, StaffDirectoryMember, StaffOpsPriority, StaffOpsStatus } from "@/lib/staff/admin-ops";
import { STAFF_PRIORITIES } from "@/lib/staff/admin-ops";
import { CROSSOVER_ASSETS } from "@/lib/admin/crossover-assets";
import { FITDOG_UI } from "@/lib/fitdog-dashboard/assets";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { DynamicTemplateFields } from "@/components/front-desk-log/DynamicTemplateFields";
import {
  CUSTOM_LOG_TEMPLATE,
  compileGeneratedPreview,
  getLogTemplateById,
  LOG_TEMPLATES,
  syncTemplateDrivenForm,
  templateActionLabel,
  validateTemplateFields,
  type TemplateAction,
  type TemplateFieldValues
} from "@/lib/frontDeskLog/logTemplates";
import {
  ASSIGNMENT_TEAMS,
  isDueToday,
  isOpenShiftLogStatus,
  OPEN_SHIFT_LOG_STATUSES,
  SHIFT_LOG_STATUSES,
  SHIFT_LOG_TYPES,
  SHIFT_LOG_TYPE_TONES,
  shouldAlertManagement,
  shiftLogAssignedTo,
  shiftLogDetails,
  shiftLogSubmittedBy,
  shiftLogType,
  type ShiftLogType
} from "@/lib/staff/front-desk-log";

export type ShiftLogFilters = {
  query: string;
  logType: string;
  priority: string;
  status: string;
  assignedTo: string;
  submittedBy: string;
  dueToday: boolean;
  urgentOnly: boolean;
  needsReview: boolean;
  openOnly: boolean;
};

export type ShiftLogFormShape = {
  log_type: ShiftLogType;
  subject: string;
  details: string;
  priority: StaffOpsPriority;
  status: StaffOpsStatus;
  assigned_to: string;
  related_dog_name: string;
  related_owner_name: string;
  department_area: string;
  due_at: string;
  reminder_at: string;
  needs_management_review: boolean;
  urgent: boolean;
  create_owner_follow_up: boolean;
  create_active_issue: boolean;
  template_title: string | null;
  template_id: string | null;
  template_fields: TemplateFieldValues;
  field_errors: Record<string, string>;
};

function IconTile({ src, alt, size = 52 }: { src: string; alt: string; size?: number }) {
  return (
    <div className="crossover-icon-tile" style={{ width: size, height: size }}>
      <Image src={src} alt={alt} width={size} height={size} className="crossover-icon-tile__img" />
    </div>
  );
}

export function ShiftLogTypeBadge({ logType }: { logType: string }) {
  const tone = SHIFT_LOG_TYPE_TONES[logType as ShiftLogType] ?? "general";
  return <span className={`shift-log-badge shift-log-badge--type-${tone}`}>{logType}</span>;
}

export function ShiftLogPriorityBadge({ priority, urgent }: { priority: StaffOpsPriority; urgent?: boolean }) {
  if (urgent) return <span className="crossover-badge crossover-badge--urgent">URGENT</span>;
  const tone =
    priority === "Critical" || priority === "Urgent" || priority === "High"
      ? "high"
      : priority === "Normal" || priority === "Medium"
        ? "normal"
        : "muted";
  return <span className={`crossover-badge crossover-badge--priority-${tone}`}>{priority.toUpperCase()}</span>;
}

export function ShiftLogStatusBadge({ status }: { status: StaffOpsStatus }) {
  const tone =
    status === "Open" || status === "Active" || status === "In Progress"
      ? "active"
      : status === "Waiting on Owner" || status === "Waiting on Staff" || status === "Needs Management Review" || status === "Scheduled" || status === "Pending Review"
        ? "pending"
        : status === "Resolved" || status === "Completed"
          ? "resolved"
          : "muted";
  return <span className={`crossover-badge crossover-badge--status-${tone}`}>{status.toUpperCase()}</span>;
}

function ShiftLogRowMenu({
  busy,
  canPushToWhiteboard,
  onDetail,
  onEdit,
  onResolve,
  onArchive,
  onInProgress,
  onFollowUp,
  onIssue
}: {
  busy: boolean;
  canPushToWhiteboard: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onResolve: () => void;
  onArchive: () => void;
  onInProgress: () => void;
  onFollowUp: () => void;
  onIssue: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="crossover-row-actions" ref={ref}>
      <button type="button" className="fitdog-action-icon-btn" disabled={busy} aria-label="View details" title="View details" onClick={onDetail}>
        <FitdogDashboardIcon src={FITDOG_UI.view} size={18} alt="" />
      </button>
      <button type="button" className="fitdog-action-icon-btn" disabled={busy} aria-label="Edit entry" title="Edit entry" onClick={onEdit}>
        <FitdogDashboardIcon src={FITDOG_UI.edit} size={18} alt="" />
      </button>
      <div className="crossover-more-menu">
        <button type="button" className="fitdog-action-icon-btn" disabled={busy} aria-label="More actions" onClick={() => setOpen((v) => !v)}>
          <FitdogDashboardIcon src={FITDOG_UI.more} size={18} alt="" />
        </button>
        {open ? (
          <div className="crossover-more-menu__panel" role="menu">
            <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onResolve(); }}>Mark Resolved</button>
            <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onEdit(); }}>Edit</button>
            <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onInProgress(); }}>Mark In Progress</button>
            <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onFollowUp(); }}>Create Owner Follow Up</button>
            <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onIssue(); }}>Create Active Issue</button>
            <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onArchive(); }}>Archive</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ShiftLogFilterBar({
  filters,
  setFilters,
  assignOptions,
  onClear
}: {
  filters: ShiftLogFilters;
  setFilters: (filters: ShiftLogFilters) => void;
  assignOptions: string[];
  onClear?: () => void;
}) {
  return (
    <div className="crossover-filters shift-log-filters shift-log-filters--readable">
      <label className="crossover-search">
        <Image src={CROSSOVER_ASSETS.search} alt="" width={22} height={22} aria-hidden className="crossover-search__icon" />
        <input className="crossover-input crossover-search__input" placeholder="Search logs, notes, dog or owner..." value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} aria-label="Search logs" />
      </label>
      <select className="crossover-input crossover-select" value={filters.logType} onChange={(e) => setFilters({ ...filters, logType: e.target.value })} aria-label="Filter by log type">
        <option value="">All log types</option>
        {SHIFT_LOG_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      <select className="crossover-input crossover-select" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} aria-label="Filter by priority">
        <option value="">All priorities</option>
        {STAFF_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="crossover-input crossover-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, openOnly: !e.target.value })} aria-label="Filter by status">
        <option value="">Open items (default)</option>
        {SHIFT_LOG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="crossover-input crossover-select" value={filters.assignedTo} onChange={(e) => setFilters({ ...filters, assignedTo: e.target.value })} aria-label="Filter by assigned to">
        <option value="">All assignments</option>
        {assignOptions.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <button type="button" role="switch" aria-checked={filters.urgentOnly} className={`crossover-urgent-pill ${filters.urgentOnly ? "crossover-urgent-pill--on" : ""}`} onClick={() => setFilters({ ...filters, urgentOnly: !filters.urgentOnly })}>Urgent Only</button>
      <button type="button" role="switch" aria-checked={filters.needsReview} className={`crossover-urgent-pill ${filters.needsReview ? "crossover-urgent-pill--on" : ""}`} onClick={() => setFilters({ ...filters, needsReview: !filters.needsReview })}>Review Needed</button>
      <button type="button" role="switch" aria-checked={filters.dueToday} className={`crossover-urgent-pill ${filters.dueToday ? "crossover-urgent-pill--on" : ""}`} onClick={() => setFilters({ ...filters, dueToday: !filters.dueToday })}>Due Today</button>
      {onClear ? (
        <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" onClick={onClear}>
          <Image src={FITDOG_UI.clearFilters} alt="" width={18} height={18} aria-hidden />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function ShiftHandoffSummary({ rows }: { rows: CrossoverMessage[] }) {
  const openRows = rows.filter((item) => isOpenShiftLogStatus(item.status));
  const urgent = openRows.filter((item) => item.urgent || item.priority === "High" || item.priority === "Urgent" || item.priority === "Critical");
  const dueToday = openRows.filter((item) => isDueToday(item.due_at) || isDueToday(item.reminder_at));
  const management = openRows.filter((item) => item.needs_management_review || (item.assigned_to ?? "").includes("Management"));
  const waitingOwner = openRows.filter((item) => item.status === "Waiting on Owner");

  return (
    <section className="crossover-card crossover-card--sidebar shift-handoff-summary" aria-labelledby="shift-handoff-heading">
      <header className="crossover-card__header crossover-card__header--compact">
        <div className="crossover-card__header-main">
          <IconTile src={CROSSOVER_ASSETS.chat} alt="Shift handoff" size={48} />
          <h3 id="shift-handoff-heading" className="crossover-card__title">Shift Handoff Summary</h3>
        </div>
      </header>
      <div className="shift-handoff-summary__grid">
        <div className="shift-handoff-summary__item"><span className="shift-handoff-summary__count">{urgent.length}</span><span>Open urgent/high</span></div>
        <div className="shift-handoff-summary__item"><span className="shift-handoff-summary__count">{dueToday.length}</span><span>Due / reminder today</span></div>
        <div className="shift-handoff-summary__item"><span className="shift-handoff-summary__count">{management.length}</span><span>Management items</span></div>
        <div className="shift-handoff-summary__item"><span className="shift-handoff-summary__count">{waitingOwner.length}</span><span>Waiting on owner</span></div>
      </div>
    </section>
  );
}

export function ActiveShiftLogCard({
  rows,
  total,
  page,
  maxPage,
  pageSize,
  busy,
  loading,
  canPushToWhiteboard,
  directory,
  filters,
  setFilters,
  assignOptions,
  onPage,
  onRefresh,
  onMutate,
  onDetail,
  onEdit,
  formatDateTime,
  title = "Active Shift Log",
  subtitle = "Open items, assignments, reminders, and follow-ups for the current and next shift.",
  headingId = "shift-log-active-heading",
  emptyTitle = "No shift log entries",
  emptyText = "Add a shift log entry below or adjust your filters.",
  showFilterBar = true,
  showRefresh = true
}: {
  rows: CrossoverMessage[];
  total: number;
  page: number;
  maxPage: number;
  pageSize: number;
  busy: boolean;
  loading: boolean;
  canPushToWhiteboard: boolean;
  directory?: StaffDirectoryMember[];
  filters: ShiftLogFilters;
  setFilters: (filters: ShiftLogFilters) => void;
  assignOptions: string[];
  onPage: (page: number) => void;
  onRefresh: () => void;
  onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>;
  onDetail: (item: CrossoverMessage) => void;
  onEdit: (item: CrossoverMessage) => void;
  formatDateTime: (value: string | null) => string;
  title?: string;
  subtitle?: string;
  headingId?: string;
  emptyTitle?: string;
  emptyText?: string;
  showFilterBar?: boolean;
  showRefresh?: boolean;
}) {
  const reminderLabel = (item: CrossoverMessage) => {
    if (item.due_at) return formatDateTime(item.due_at);
    if (item.reminder_at) return formatDateTime(item.reminder_at);
    return "—";
  };

  return (
    <section className="crossover-card crossover-card--conversations shift-log-card" aria-labelledby={headingId}>
      <header className="crossover-card__header">
        <div className="crossover-card__header-main">
          <IconTile src={CROSSOVER_ASSETS.chat} alt={title} />
          <div>
            <h3 id={headingId} className="crossover-card__title">{title}</h3>
            <p className="crossover-card__subtitle">{subtitle}</p>
          </div>
        </div>
        {showRefresh ? (
          <button type="button" className="crossover-btn crossover-btn--outline" disabled={loading} onClick={() => void onRefresh()}>
            <Image src={CROSSOVER_ASSETS.refresh} alt="" width={22} height={22} aria-hidden />
            Refresh
          </button>
        ) : null}
      </header>

      {showFilterBar ? <ShiftLogFilterBar filters={filters} setFilters={setFilters} assignOptions={assignOptions} /> : null}

      <div className="crossover-table-wrap shift-log-table-wrap hidden md:block">
        {rows.length ? (
          <table className="crossover-table shift-log-table">
            <thead>
              <tr>
                <th>Subject / Log Type</th>
                <th>Dog / Owner</th>
                <th>Submitted By</th>
                <th>Assigned To</th>
                <th>Priority</th>
                <th>Due / Logged</th>
                <th>Status</th>
                <th className="crossover-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td className="crossover-table__subject">
                    <p className="crossover-table__subject-title">{item.subject}</p>
                    <p className="crossover-table__subject-preview">{shiftLogDetails(item)}</p>
                    <ShiftLogTypeBadge logType={shiftLogType(item)} />
                  </td>
                  <td>
                    {item.related_dog_name ? <p>{item.related_dog_name}</p> : null}
                    {item.related_owner_name ? <p className="crossover-table__muted">{item.related_owner_name}</p> : !item.related_dog_name ? "—" : null}
                  </td>
                  <td>{shiftLogSubmittedBy(item)}</td>
                  <td className="crossover-table__emphasis">{shiftLogAssignedTo(item)}</td>
                  <td><ShiftLogPriorityBadge priority={item.priority} urgent={item.urgent} /></td>
                  <td className="crossover-table__datetime">
                    {reminderLabel(item) !== "—" ? (
                      <>
                        <span className="crossover-table__datetime-due">{reminderLabel(item)}</span>
                        <span className="crossover-table__datetime-logged">{formatDateTime(item.created_at)}</span>
                      </>
                    ) : (
                      <span>{formatDateTime(item.created_at)}</span>
                    )}
                  </td>
                  <td><ShiftLogStatusBadge status={item.status} /></td>
                  <td>
                    <ShiftLogRowMenu
                      busy={busy}
                      canPushToWhiteboard={canPushToWhiteboard}
                      onDetail={() => onDetail(item)}
                      onEdit={() => onEdit(item)}
                      onResolve={() => void onMutate("Unable to resolve.", { action: "update_crossover", id: item.id, status: "Resolved" }, "Log marked resolved.")}
                      onArchive={() => void onMutate("Unable to archive.", { action: "update_crossover", id: item.id, status: "Archived" }, "Log archived.")}
                      onInProgress={() => void onMutate("Unable to update.", { action: "update_crossover", id: item.id, status: "In Progress" }, "Marked in progress.")}
                      onFollowUp={() => void onMutate("Unable to create follow up.", { action: "update_crossover", id: item.id, create_owner_follow_up: true }, "Owner Follow Up created.")}
                      onIssue={() => void onMutate("Unable to create issue.", { action: "update_crossover", id: item.id, create_active_issue: true }, "Active Issue created.")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="crossover-empty">
            <IconTile src={CROSSOVER_ASSETS.chat} alt="" size={64} />
            <p className="crossover-empty__title">{emptyTitle}</p>
            <p className="crossover-empty__text">{emptyText}</p>
          </div>
        )}
      </div>

      <div className="crossover-mobile-list md:hidden">
        {rows.length ? rows.map((item) => (
          <article key={item.id} className="crossover-mobile-card">
            <div className="crossover-mobile-card__head">
              <div>
                <h4 className="crossover-mobile-card__title">{item.subject}</h4>
                <ShiftLogTypeBadge logType={shiftLogType(item)} />
              </div>
              <ShiftLogPriorityBadge priority={item.priority} urgent={item.urgent} />
            </div>
            <p className="crossover-mobile-card__meta">{shiftLogSubmittedBy(item)} • {formatDateTime(item.created_at)} • Assigned {shiftLogAssignedTo(item)}</p>
            <p className="crossover-mobile-card__preview">{shiftLogDetails(item)}</p>
            <div className="crossover-mobile-card__footer">
              <ShiftLogStatusBadge status={item.status} />
              <ShiftLogRowMenu busy={busy} canPushToWhiteboard={canPushToWhiteboard} onDetail={() => onDetail(item)} onEdit={() => onEdit(item)} onResolve={() => void onMutate("Unable to resolve.", { action: "update_crossover", id: item.id, status: "Resolved" }, "Log marked resolved.")} onArchive={() => void onMutate("Unable to archive.", { action: "update_crossover", id: item.id, status: "Archived" }, "Log archived.")} onInProgress={() => void onMutate("Unable to update.", { action: "update_crossover", id: item.id, status: "In Progress" }, "Marked in progress.")} onFollowUp={() => void onMutate("Unable to create follow up.", { action: "update_crossover", id: item.id, create_owner_follow_up: true }, "Owner Follow Up created.")} onIssue={() => void onMutate("Unable to create issue.", { action: "update_crossover", id: item.id, create_active_issue: true }, "Active Issue created.")} />
            </div>
          </article>
        )) : (
          <div className="crossover-empty crossover-empty--compact">
            <p className="crossover-empty__title">{emptyTitle}</p>
          </div>
        )}
      </div>

      <footer className="crossover-pagination">
        <p className="crossover-pagination__meta">Showing {rows.length} of {total} entries • Page {page} of {maxPage}</p>
        <div className="crossover-pagination__controls">
          <button type="button" className="crossover-btn crossover-btn--ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span className="crossover-pagination__page" aria-current="page">{page}</span>
          <button type="button" className="crossover-btn crossover-btn--ghost" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      </footer>
    </section>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="crossover-field">
      <span className="crossover-field__label">{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
}

function actionFormKey(action: TemplateAction): keyof Pick<ShiftLogFormShape, "needs_management_review" | "urgent" | "create_owner_follow_up" | "create_active_issue"> {
  if (action === "needs_management_review") return "needs_management_review";
  if (action === "urgent") return "urgent";
  if (action === "create_owner_follow_up") return "create_owner_follow_up";
  return "create_active_issue";
}

export function AddShiftLogEntryCard({
  form,
  patchForm,
  busy,
  assignOptions,
  onSubmit,
  onSubmitAndFollowUp
}: {
  form: ShiftLogFormShape;
  patchForm: (patch: Partial<ShiftLogFormShape>) => void;
  busy: boolean;
  assignOptions: string[];
  onSubmit: () => Promise<void>;
  onSubmitAndFollowUp: () => Promise<void>;
}) {
  const template = getLogTemplateById(form.template_id);
  const isCustomLog = form.template_id === "custom";
  const hasPreset = Boolean(template && template.id !== "custom");
  const showDogName = isCustomLog && Boolean(template?.showDogName);
  const showOwnerName = isCustomLog && Boolean(template?.showOwnerName);
  const showDueDate = isCustomLog && Boolean(template?.showDueDate);
  const showReminder = isCustomLog && Boolean(template?.showReminderDateTime);
  const fieldErrors = hasPreset && template ? validateTemplateFields(template, form.template_fields) : {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const willAlert = shouldAlertManagement(form.priority, form.urgent, form.needs_management_review);
  const invalid = !form.subject.trim() || !form.details.trim() || hasFieldErrors;

  const preview = useMemo(
    () =>
      hasPreset && template
        ? compileGeneratedPreview(template, {
            subject: form.subject,
            details: form.details,
            log_type: form.log_type,
            priority: form.priority,
            status: form.status,
            assigned_to: form.assigned_to,
            department_area: form.department_area,
            template_fields: form.template_fields,
            needs_management_review: form.needs_management_review,
            urgent: form.urgent,
            create_owner_follow_up: form.create_owner_follow_up,
            create_active_issue: form.create_active_issue,
            due_at: form.due_at,
            reminder_at: form.reminder_at
          })
        : "",
    [form, hasPreset, template]
  );

  function onTemplateFieldChange(key: string, value: string | string[]) {
    if (!template) return;
    const nextFields = { ...form.template_fields, [key]: value };
    let next = syncTemplateDrivenForm({ ...form, template_fields: nextFields, field_errors: {} });
    if (template.id === "facility_issue" && key === "safetyRisk") {
      const risk = String(value);
      if (risk === "High" || risk === "Urgent") next = { ...next, create_active_issue: true };
      if (risk === "Urgent") next = { ...next, urgent: true };
    }
    if (template.id === "payment_billing_note" && key === "billingIssueType") {
      const issue = String(value);
      if (["Refund request", "Store credit", "Package issue", "Incorrect charge", "Duplicate charge"].includes(issue)) {
        next = { ...next, needs_management_review: true };
      }
    }
    if (template.id === "end_of_shift_handoff" && key === "ownerFollowUps") {
      const text = String(value).trim();
      next = { ...next, create_owner_follow_up: text.length > 0 };
    }
    patchForm(next);
  }

  function toggleAction(action: TemplateAction) {
    const key = actionFormKey(action);
    const nextValue = !form[key];
    const patch: Partial<ShiftLogFormShape> = { [key]: nextValue };
    if (action === "needs_management_review" && nextValue) {
      patch.status = "Needs Management Review";
    }
    patchForm(patch);
  }

  return (
    <section className="crossover-card crossover-card--create shift-log-create-card" aria-labelledby="shift-log-create-heading">
      <header className="crossover-card__header crossover-card__header--create">
        <div className="crossover-card__header-main">
          <IconTile src={CROSSOVER_ASSETS.envelope} alt="Add shift log entry" />
          <div>
            <h3 id="shift-log-create-heading" className="crossover-card__title">Add Shift Log Entry</h3>
            <p className="crossover-card__subtitle">
              {form.template_title
                ? `Template loaded: ${form.template_title}`
                : "Pick a Quick Log Template on the right, or choose Custom Log for a general note."}
            </p>
            {template?.description && hasPreset ? (
              <p className="shift-log-template-loaded-hint">{template.description}</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="crossover-form">
        <h4 className="shift-log-form-section-title">Log Details</h4>
        <div className="crossover-form__row crossover-form__row--3">
          <Field label="Log Type" required>
            <select className="crossover-input crossover-select" value={form.log_type} onChange={(e) => patchForm({ log_type: e.target.value as ShiftLogType })}>
              {SHIFT_LOG_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Priority" required>
            <select className="crossover-input crossover-select" value={form.priority} onChange={(e) => patchForm({ priority: e.target.value as StaffOpsPriority })}>
              {STAFF_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="crossover-input crossover-select" value={form.status} onChange={(e) => patchForm({ status: e.target.value as StaffOpsStatus })}>
              {SHIFT_LOG_STATUSES.filter((s) => !["Active", "Pending Review"].includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="crossover-form__row crossover-form__row--2">
          <Field label="Assigned To">
            <select className="crossover-input crossover-select" value={form.assigned_to} onChange={(e) => patchForm({ assigned_to: e.target.value })}>
              <option value="">Select assignment</option>
              {[...ASSIGNMENT_TEAMS, ...assignOptions].map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </Field>
          <Field label="Department / Area">
            <input className="crossover-input" value={form.department_area} onChange={(e) => patchForm({ department_area: e.target.value })} placeholder="Front Desk, Yard, Grooming..." />
          </Field>
        </div>
        {!hasPreset && !isCustomLog ? (
          <p className="crossover-template-hint">Select a template to load the correct fields for that log type. Each preset shows only the fields your team needs.</p>
        ) : null}

        <Field label="Subject" required>
          <input className={`crossover-input ${!form.subject.trim() ? "crossover-input--invalid" : ""}`} value={form.subject} onChange={(e) => patchForm({ subject: e.target.value })} />
        </Field>
        <Field label="Details / Notes" required>
          <textarea className={`crossover-input crossover-textarea ${!form.details.trim() ? "crossover-input--invalid" : ""}`} value={form.details} onChange={(e) => patchForm({ details: e.target.value })} rows={6} />
        </Field>

        {hasPreset && template ? (
          <DynamicTemplateFields
            fields={template.fields}
            values={form.template_fields}
            errors={{ ...fieldErrors, ...form.field_errors }}
            disabled={busy}
            onChange={onTemplateFieldChange}
          />
        ) : null}

        {showDogName || showOwnerName ? (
          <div className="crossover-form__row crossover-form__row--2">
            {showDogName ? (
              <Field label="Dog Name"><input className="crossover-input" value={form.related_dog_name} onChange={(e) => patchForm({ related_dog_name: e.target.value })} /></Field>
            ) : null}
            {showOwnerName ? (
              <Field label="Owner Name"><input className="crossover-input" value={form.related_owner_name} onChange={(e) => patchForm({ related_owner_name: e.target.value })} /></Field>
            ) : null}
          </div>
        ) : null}

        {showDueDate || showReminder ? (
          <div className="crossover-form__row crossover-form__row--2">
            {showDueDate ? (
              <Field label="Due Date"><input className="crossover-input" type="datetime-local" value={form.due_at} onChange={(e) => patchForm({ due_at: e.target.value })} /></Field>
            ) : null}
            {showReminder ? (
              <Field label="Reminder Date / Time"><input className="crossover-input" type="datetime-local" value={form.reminder_at} onChange={(e) => patchForm({ reminder_at: e.target.value })} /></Field>
            ) : null}
          </div>
        ) : null}

        {hasPreset && preview ? (
          <section className="shift-log-preview-card" aria-labelledby="shift-log-preview-heading">
            <h4 id="shift-log-preview-heading" className="shift-log-preview-card__title">Generated Log Preview</h4>
            <pre className="shift-log-preview-card__body">{preview}</pre>
          </section>
        ) : null}

        {hasPreset || isCustomLog ? (
          <>
            <h4 className="shift-log-form-section-title">Actions &amp; Follow-Up</h4>
            <div className="shift-log-form__toggles">
              {(isCustomLog
                ? (["needs_management_review", "urgent", "create_owner_follow_up", "create_active_issue"] as TemplateAction[])
                : template?.actions ?? []
              ).map((action) => {
                const key = actionFormKey(action);
                const checked = form[key];
                return (
                  <button
                    key={action}
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    className={`crossover-urgent-pill ${checked ? "crossover-urgent-pill--on" : ""}`}
                    onClick={() => toggleAction(action)}
                  >
                    {templateActionLabel(action)}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        {hasFieldErrors ? (
          <p className="shift-log-validation-summary" role="alert">Complete all required template fields before saving.</p>
        ) : null}
        {willAlert ? <p className="shift-log-alert-warning">This will alert management/admin users when saved.</p> : null}
        <div className="crossover-form__footer">
          <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy || invalid} onClick={() => void onSubmitAndFollowUp()}>
            <Plus className="h-4 w-4" aria-hidden />
            Save &amp; Create Follow Up
          </button>
          <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy || invalid} onClick={() => void onSubmit()}>
            <ClipboardList className="h-4 w-4" aria-hidden />
            Save Log Entry
          </button>
        </div>
      </div>
    </section>
  );
}

export function QuickLogTemplatesSidebar({
  selectedTemplateId,
  onPick
}: {
  selectedTemplateId: string | null;
  onPick: (templateId: string) => void;
}) {
  const templates = useMemo(() => [...LOG_TEMPLATES, CUSTOM_LOG_TEMPLATE], []);

  return (
    <section className="crossover-card crossover-card--sidebar" aria-labelledby="shift-log-templates-heading">
      <header className="crossover-card__header crossover-card__header--compact">
        <div className="crossover-card__header-main">
          <IconTile src={CROSSOVER_ASSETS.documents} alt="Quick log templates" size={48} />
          <h3 id="shift-log-templates-heading" className="crossover-card__title">Quick Log Templates</h3>
        </div>
      </header>
      <div className="crossover-template-list">
        {templates.map((template) => {
          const selected = selectedTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              className={`crossover-template-row ${selected ? "crossover-template-row--selected" : ""}`}
              onClick={() => onPick(template.id)}
              title={template.description}
            >
              <Image src={CROSSOVER_ASSETS.documents} alt="" width={24} height={24} aria-hidden className="crossover-template-row__icon" />
              <span className="crossover-template-row__text">
                <span className="crossover-template-row__title">{template.label}</span>
                {selected ? <span className="crossover-template-row__description">{template.description}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ShiftLogRecentActivitySidebar({ items, formatDateTime }: { items: StaffActivityLog[]; formatDateTime: (value: string | null) => string }) {
  const trackingItems = useMemo(
    () =>
      items.filter((item) =>
        item.activity_type.startsWith("shift_log.") ||
        item.activity_type.startsWith("follow_up.created_from_log") ||
        item.activity_type.includes("management_alerted")
      ),
    [items]
  );

  return (
    <section className="crossover-card crossover-card--sidebar" aria-labelledby="shift-log-activity-heading">
      <header className="crossover-card__header crossover-card__header--compact">
        <div className="crossover-card__header-main">
          <IconTile src={CROSSOVER_ASSETS.refresh} alt="Recent activity" size={48} />
          <h3 id="shift-log-activity-heading" className="crossover-card__title">Recent Activity</h3>
        </div>
      </header>
      <div className="crossover-activity-list">
        {trackingItems.length ? trackingItems.slice(0, 12).map((item) => (
          <article key={item.id} className="crossover-activity-row">
            <p className="crossover-activity-row__title">{item.title}</p>
            {item.description ? <p className="crossover-activity-row__text">{item.description}</p> : null}
            <p className="crossover-activity-row__meta">{formatDateTime(item.created_at)}</p>
          </article>
        )) : <p className="crossover-empty__text">Activity will appear here as logs are created and updated.</p>}
      </div>
    </section>
  );
}

export function filterShiftLogRows(rows: CrossoverMessage[], filters: ShiftLogFilters, queryFields: (item: CrossoverMessage) => string[]) {
  return rows.filter((item) => {
    if (filters.logType && shiftLogType(item) !== filters.logType) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.openOnly && !filters.status && !isOpenShiftLogStatus(item.status)) return false;
    if (filters.assignedTo && shiftLogAssignedTo(item) !== filters.assignedTo) return false;
    if (filters.submittedBy && shiftLogSubmittedBy(item) !== filters.submittedBy) return false;
    if (filters.urgentOnly && !item.urgent && item.priority !== "High" && item.priority !== "Urgent" && item.priority !== "Critical") return false;
    if (filters.needsReview && !item.needs_management_review && item.status !== "Needs Management Review") return false;
    if (filters.dueToday && !isDueToday(item.due_at) && !isDueToday(item.reminder_at)) return false;
    if (filters.query.trim()) {
      const haystack = queryFields(item).join(" ").toLowerCase();
      if (!haystack.includes(filters.query.trim().toLowerCase())) return false;
    }
    return true;
  });
}

export type { CrossoverReply };
