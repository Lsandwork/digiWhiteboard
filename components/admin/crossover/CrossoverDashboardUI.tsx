"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Pencil } from "lucide-react";
import type {
  CrossoverMessage,
  StaffActivityLog,
  StaffDirectoryMember,
  StaffOpsPriority,
  StaffOpsStatus
} from "@/lib/staff/admin-ops";
import { CROSSOVER_TEMPLATES, STAFF_DEPARTMENTS, STAFF_PRIORITIES, STAFF_STATUSES } from "@/lib/staff/admin-ops";
import { CROSSOVER_ASSETS } from "@/lib/admin/crossover-assets";
import type { CrossoverTemplateField } from "@/lib/staff/crossover-templates";

export type CrossoverFilters = {
  query: string;
  department: string;
  priority: string;
  status: string;
  urgentOnly: boolean;
};

type CrossoverFormShape = {
  subject: string;
  message: string;
  template_title: string | null;
  field_values: Record<string, string>;
  from_department: string;
  to_department: string;
  priority: StaffOpsPriority;
  assigned_to: string;
  reported_to: string;
  urgent: boolean;
};

function CrossoverIconTile({ src, alt, size = 52 }: { src: string; alt: string; size?: number }) {
  return (
    <div className="crossover-icon-tile" style={{ width: size, height: size }}>
      <Image src={src} alt={alt} width={size} height={size} className="crossover-icon-tile__img" />
    </div>
  );
}

function CrossoverPriorityBadge({ priority, urgent }: { priority: StaffOpsPriority; urgent?: boolean }) {
  if (urgent) {
    return <span className="crossover-badge crossover-badge--urgent">URGENT</span>;
  }
  const tone =
    priority === "Critical" || priority === "High"
      ? "high"
      : priority === "Normal" || priority === "Medium"
        ? "normal"
        : "muted";
  return <span className={`crossover-badge crossover-badge--priority-${tone}`}>{priority.toUpperCase()}</span>;
}

function CrossoverStatusBadge({ status }: { status: StaffOpsStatus }) {
  const tone =
    status === "Active" || status === "Open" || status === "In Progress"
      ? "active"
      : status === "Pending Review" || status === "Scheduled"
        ? "pending"
        : status === "Resolved"
          ? "resolved"
          : "muted";
  return <span className={`crossover-badge crossover-badge--status-${tone}`}>{status.toUpperCase()}</span>;
}

function CrossoverIconButton({
  src,
  alt,
  label,
  disabled,
  onClick
}: {
  src: string;
  alt: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="crossover-icon-btn" disabled={disabled} aria-label={label} title={label} onClick={onClick}>
      <Image src={src} alt="" width={32} height={32} aria-hidden className="crossover-icon-btn__img" />
    </button>
  );
}

function CrossoverResolveButton({
  disabled,
  onClick
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="crossover-icon-btn crossover-icon-btn--resolve"
      disabled={disabled}
      aria-label="Mark resolved"
      title="Mark resolved"
      onClick={onClick}
    >
      <CheckCircle2 aria-hidden className="crossover-icon-btn__lucide" />
    </button>
  );
}

function CrossoverMoreMenu({
  busy,
  canPushToWhiteboard,
  onReopen,
  onArchive,
  onEscalate,
  onPush
}: {
  busy: boolean;
  canPushToWhiteboard: boolean;
  onReopen: () => void;
  onArchive: () => void;
  onEscalate: () => void;
  onPush: () => void;
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
    <div className="crossover-more-menu" ref={ref}>
      <CrossoverIconButton src={CROSSOVER_ASSETS.more} alt="More options" label="More actions" disabled={busy} onClick={() => setOpen((value) => !value)} />
      {open ? (
        <div className="crossover-more-menu__panel" role="menu">
          <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onReopen(); }}>Reopen</button>
          <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onEscalate(); }}>Escalate</button>
          {canPushToWhiteboard ? (
            <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onPush(); }}>Push to Whiteboard</button>
          ) : null}
          <button type="button" className="crossover-more-menu__item" disabled={busy} onClick={() => { setOpen(false); onArchive(); }}>Archive</button>
        </div>
      ) : null}
    </div>
  );
}

function CrossoverRowActions({
  busy,
  canPushToWhiteboard,
  onDetail,
  onResolve,
  onReopen,
  onArchive,
  onEscalate,
  onPush
}: {
  busy: boolean;
  canPushToWhiteboard: boolean;
  onDetail: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onArchive: () => void;
  onEscalate: () => void;
  onPush: () => void;
}) {
  return (
    <div className="crossover-row-actions">
      <CrossoverIconButton src={CROSSOVER_ASSETS.eye} alt="View" label="View conversation" disabled={busy} onClick={onDetail} />
      <CrossoverResolveButton disabled={busy} onClick={onResolve} />
      <CrossoverMoreMenu
        busy={busy}
        canPushToWhiteboard={canPushToWhiteboard}
        onReopen={onReopen}
        onArchive={onArchive}
        onEscalate={onEscalate}
        onPush={onPush}
      />
    </div>
  );
}

export function CrossoverFilterBar({
  filters,
  setFilters
}: {
  filters: CrossoverFilters;
  setFilters: (filters: CrossoverFilters) => void;
}) {
  return (
    <div className="crossover-filters">
      <label className="crossover-search">
        <Image src={CROSSOVER_ASSETS.search} alt="" width={22} height={22} aria-hidden className="crossover-search__icon" />
        <input
          className="crossover-input crossover-search__input"
          placeholder="Search conversations..."
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
      </label>
      <select className="crossover-input crossover-select" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })} aria-label="Filter by priority">
        <option value="">All priorities</option>
        {STAFF_PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>{priority}</option>
        ))}
      </select>
      <select className="crossover-input crossover-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by status">
        <option value="">All statuses</option>
        {STAFF_STATUSES.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <select className="crossover-input crossover-select" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })} aria-label="Filter by department">
        <option value="">All departments</option>
        {STAFF_DEPARTMENTS.map((department) => (
          <option key={department} value={department}>{department}</option>
        ))}
      </select>
      <button
        type="button"
        role="switch"
        aria-checked={filters.urgentOnly}
        className={`crossover-urgent-pill ${filters.urgentOnly ? "crossover-urgent-pill--on" : ""}`}
        onClick={() => setFilters({ ...filters, urgentOnly: !filters.urgentOnly })}
      >
        Urgent only
      </button>
    </div>
  );
}

export function CrossoverPagination({
  page,
  maxPage,
  total,
  pageSize,
  onPage
}: {
  page: number;
  maxPage: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <footer className="crossover-pagination">
      <p className="crossover-pagination__meta">
        Showing {start}–{end} of {total} conversation{total === 1 ? "" : "s"}
      </p>
      <div className="crossover-pagination__controls">
        <button type="button" className="crossover-btn crossover-btn--ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="crossover-pagination__page" aria-current="page">{page}</span>
        <button type="button" className="crossover-btn crossover-btn--ghost" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </footer>
  );
}

export function ActiveConversationsCard({
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
  onPage,
  onRefresh,
  onMutate,
  onDetail,
  displayMessage,
  formatDateTime,
  createdByLabel,
  reportedToLabel
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
  filters: CrossoverFilters;
  setFilters: (filters: CrossoverFilters) => void;
  onPage: (page: number) => void;
  onRefresh: () => void;
  onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>;
  onDetail: (item: CrossoverMessage) => void;
  displayMessage: (item: CrossoverMessage) => string;
  formatDateTime: (value: string | null) => string;
  createdByLabel: (directory: StaffDirectoryMember[] | undefined, createdBy: string | null | undefined) => string;
  reportedToLabel: (item: CrossoverMessage) => string;
}) {
  return (
    <section className="crossover-card crossover-card--conversations" aria-labelledby="crossover-active-heading">
      <header className="crossover-card__header">
        <div className="crossover-card__header-main">
          <CrossoverIconTile src={CROSSOVER_ASSETS.chat} alt="Active conversations" />
          <div>
            <h3 id="crossover-active-heading" className="crossover-card__title">Active Conversations</h3>
            <p className="crossover-card__subtitle">Ongoing crossover messages and updates.</p>
          </div>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline" disabled={loading} onClick={() => void onRefresh()}>
          <Image src={CROSSOVER_ASSETS.refresh} alt="" width={22} height={22} aria-hidden />
          Refresh
        </button>
      </header>

      <CrossoverFilterBar filters={filters} setFilters={setFilters} />

      <div className="crossover-table-wrap hidden md:block">
        {rows.length ? (
          <table className="crossover-table">
            <thead>
              <tr>
                <th>Thread / Subject</th>
                <th>From → To</th>
                <th>Reported By</th>
                <th>Reported To</th>
                <th>Logged</th>
                <th>Priority</th>
                <th>Status</th>
                <th className="crossover-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td className="crossover-table__subject">
                    <p className="crossover-table__subject-title">{item.subject}</p>
                    <p className="crossover-table__subject-preview">{displayMessage(item)}</p>
                  </td>
                  <td className="crossover-table__route">
                    <span>{item.from_department}</span>
                    <span className="crossover-table__arrow" aria-hidden>→</span>
                    <span>{item.to_department}</span>
                  </td>
                  <td>{createdByLabel(directory, item.created_by)}</td>
                  <td className="crossover-table__emphasis">{reportedToLabel(item)}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td><CrossoverPriorityBadge priority={item.priority} urgent={item.urgent} /></td>
                  <td><CrossoverStatusBadge status={item.status} /></td>
                  <td>
                    <CrossoverRowActions
                      busy={busy}
                      canPushToWhiteboard={canPushToWhiteboard}
                      onDetail={() => onDetail(item)}
                      onResolve={() => void onMutate("Unable to resolve.", { action: "update_crossover", id: item.id, status: "Resolved" }, "Conversation resolved.")}
                      onReopen={() => void onMutate("Unable to reopen.", { action: "update_crossover", id: item.id, status: "Active" }, "Conversation reopened.")}
                      onArchive={() => void onMutate("Unable to archive.", { action: "update_crossover", id: item.id, status: "Archived" }, "Conversation archived.")}
                      onEscalate={() => void onMutate("Unable to escalate.", { action: "update_crossover", id: item.id, urgent: true, priority: item.priority === "Critical" ? "Critical" : "High" }, "Escalated to Active Issues.")}
                      onPush={() => void onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.message, priority: item.priority }, "Pushed to Staff Whiteboard.")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="crossover-empty">
            <CrossoverIconTile src={CROSSOVER_ASSETS.chat} alt="" size={64} />
            <p className="crossover-empty__title">No active conversations</p>
            <p className="crossover-empty__text">New crossover messages will appear here as staff log handoffs.</p>
          </div>
        )}
      </div>

      <div className="crossover-mobile-list md:hidden">
        {rows.length ? rows.map((item) => (
          <article key={item.id} className="crossover-mobile-card">
            <div className="crossover-mobile-card__head">
              <div>
                <h4 className="crossover-mobile-card__title">{item.subject}</h4>
                <p className="crossover-mobile-card__route">{item.from_department} → {item.to_department}</p>
              </div>
              <CrossoverPriorityBadge priority={item.priority} urgent={item.urgent} />
            </div>
            <p className="crossover-mobile-card__meta">
              {createdByLabel(directory, item.created_by)} • {formatDateTime(item.created_at)} • To {reportedToLabel(item)}
            </p>
            <p className="crossover-mobile-card__preview">{displayMessage(item)}</p>
            <div className="crossover-mobile-card__footer">
              <CrossoverStatusBadge status={item.status} />
              <CrossoverRowActions
                busy={busy}
                canPushToWhiteboard={canPushToWhiteboard}
                onDetail={() => onDetail(item)}
                onResolve={() => void onMutate("Unable to resolve.", { action: "update_crossover", id: item.id, status: "Resolved" }, "Conversation resolved.")}
                onReopen={() => void onMutate("Unable to reopen.", { action: "update_crossover", id: item.id, status: "Active" }, "Conversation reopened.")}
                onArchive={() => void onMutate("Unable to archive.", { action: "update_crossover", id: item.id, status: "Archived" }, "Conversation archived.")}
                onEscalate={() => void onMutate("Unable to escalate.", { action: "update_crossover", id: item.id, urgent: true, priority: "High" }, "Escalated to Active Issues.")}
                onPush={() => void onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.message, priority: item.priority }, "Pushed to Staff Whiteboard.")}
              />
            </div>
          </article>
        )) : (
          <div className="crossover-empty crossover-empty--compact">
            <p className="crossover-empty__title">No active conversations</p>
            <p className="crossover-empty__text">Try adjusting filters or create a new message below.</p>
          </div>
        )}
      </div>

      <CrossoverPagination page={page} maxPage={maxPage} total={total} pageSize={pageSize} onPage={onPage} />
    </section>
  );
}

function CrossoverField({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="crossover-field">
      <span className="crossover-field__label">{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
}

function CrossoverSelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <CrossoverField label={label}>
      <select className="crossover-input crossover-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option || "blank"} value={option}>{option || "Select"}</option>
        ))}
      </select>
    </CrossoverField>
  );
}

export function CreateCrossoverMessageCard({
  form,
  patchForm,
  busy,
  staffOptions,
  onSubmit,
  templateFields,
  hasTemplate,
  onTemplateFieldChange
}: {
  form: CrossoverFormShape;
  patchForm: (patch: Partial<CrossoverFormShape>, options?: { manualMessage?: string }) => void;
  busy: boolean;
  staffOptions: string[];
  onSubmit: () => Promise<void>;
  templateFields: CrossoverTemplateField[];
  hasTemplate: boolean;
  onTemplateFieldChange: (key: string, value: string, field: CrossoverTemplateField) => void;
}) {
  const subjectInvalid = !form.subject.trim();
  const messageInvalid = !form.message.trim();

  return (
    <section className="crossover-card crossover-card--create" aria-labelledby="crossover-create-heading">
      <header className="crossover-card__header crossover-card__header--create">
        <div className="crossover-card__header-main">
          <CrossoverIconTile src={CROSSOVER_ASSETS.envelope} alt="Create message" />
          <div>
            <h3 id="crossover-create-heading" className="crossover-card__title">Create New Crossover Message</h3>
            <p className="crossover-card__subtitle">
              Log handoffs in the main communication record. Timestamp, sender, and report-to are saved automatically. Urgent or high priority sends an alert with the full message.
            </p>
          </div>
        </div>
        <div className="crossover-create-accent" aria-hidden>
          <Image src={CROSSOVER_ASSETS.sendPlane} alt="" width={140} height={140} className="crossover-create-accent__plane" />
        </div>
      </header>

      <div className="crossover-form">
        <div className="crossover-form__row crossover-form__row--3">
          <CrossoverSelectField label="From" value={form.from_department} options={[...STAFF_DEPARTMENTS]} onChange={(value) => patchForm({ from_department: value })} />
          <CrossoverSelectField label="To" value={form.to_department} options={[...STAFF_DEPARTMENTS]} onChange={(value) => patchForm({ to_department: value, reported_to: form.reported_to || value })} />
          <CrossoverSelectField label="Priority" value={form.priority} options={STAFF_PRIORITIES} onChange={(value) => patchForm({ priority: value as StaffOpsPriority })} />
        </div>
        <div className="crossover-form__row crossover-form__row--2">
          <CrossoverSelectField label="Report To (Staff or Department)" value={form.reported_to} options={["", ...staffOptions, ...STAFF_DEPARTMENTS]} onChange={(value) => patchForm({ reported_to: value, assigned_to: staffOptions.includes(value) ? value : form.assigned_to })} />
          <CrossoverSelectField label="Assign To (optional)" value={form.assigned_to} options={["", ...staffOptions]} onChange={(value) => patchForm({ assigned_to: value, reported_to: form.reported_to || value })} />
        </div>
        <CrossoverField label="Subject" required>
          <input
            className={`crossover-input ${subjectInvalid ? "crossover-input--invalid" : ""}`}
            value={form.subject}
            aria-invalid={subjectInvalid}
            onChange={(event) => patchForm({ subject: event.target.value })}
          />
        </CrossoverField>
        {hasTemplate ? (
          <div className="crossover-template-fields">
            <p className="crossover-template-fields__title">{form.template_title} — fill these in</p>
            <div className="crossover-form__row crossover-form__row--3">
              {templateFields.map((field) => (
                <CrossoverTemplateFieldInput
                  key={field.key}
                  field={field}
                  value={form.field_values[field.key] ?? (field.type === "department" ? form.to_department : "")}
                  staffOptions={staffOptions}
                  onChange={(value) => onTemplateFieldChange(field.key, value, field)}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="crossover-template-hint">Select a communication template on the right to show smart fill fields for that topic.</p>
        )}
        <CrossoverField label="Message" required>
          <textarea
            className={`crossover-input crossover-textarea ${messageInvalid ? "crossover-input--invalid" : ""}`}
            value={form.message}
            aria-invalid={messageInvalid}
            onChange={(event) => patchForm({}, { manualMessage: event.target.value })}
          />
        </CrossoverField>
        <div className="crossover-form__footer">
          <button
            type="button"
            role="switch"
            aria-checked={form.urgent}
            className={`crossover-urgent-pill ${form.urgent ? "crossover-urgent-pill--on" : ""}`}
            onClick={() => patchForm({ urgent: !form.urgent })}
          >
            Urgent Alert
          </button>
          <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy || subjectInvalid || messageInvalid} onClick={() => void onSubmit()}>
            <Image src={CROSSOVER_ASSETS.sendPlane} alt="" width={24} height={24} aria-hidden />
            Create Message
          </button>
        </div>
      </div>
    </section>
  );
}

function CrossoverTemplateFieldInput({
  field,
  value,
  staffOptions,
  onChange
}: {
  field: CrossoverTemplateField;
  value: string;
  staffOptions: string[];
  onChange: (value: string) => void;
}) {
  if (field.type === "select" && field.options?.length) {
    return <CrossoverSelectField label={field.label} value={value} options={["", ...field.options]} onChange={onChange} />;
  }
  if (field.type === "staff") {
    return <CrossoverSelectField label={field.label} value={value} options={["", ...staffOptions]} onChange={onChange} />;
  }
  if (field.type === "department") {
    return <CrossoverSelectField label={field.label} value={value} options={[...STAFF_DEPARTMENTS]} onChange={onChange} />;
  }
  return (
    <CrossoverField label={field.label}>
      <input className="crossover-input" value={value} placeholder={field.hint} onChange={(event) => onChange(event.target.value)} />
    </CrossoverField>
  );
}

export function CrossoverTemplatesSidebar({ onPick }: { onPick: (template: { title: string; message: string }) => void }) {
  return (
    <section className="crossover-card crossover-card--sidebar" aria-labelledby="crossover-templates-heading">
      <header className="crossover-card__header crossover-card__header--compact">
        <div className="crossover-card__header-main">
          <CrossoverIconTile src={CROSSOVER_ASSETS.documents} alt="Templates" size={48} />
          <h3 id="crossover-templates-heading" className="crossover-card__title">Communication Templates</h3>
        </div>
        <button type="button" className="crossover-link-btn">View all</button>
      </header>
      <div className="crossover-template-list">
        {CROSSOVER_TEMPLATES.map((template) => (
          <button key={template.title} type="button" className="crossover-template-row" onClick={() => onPick(template)}>
            <Image src={CROSSOVER_ASSETS.documents} alt="" width={24} height={24} aria-hidden className="crossover-template-row__icon" />
            <span className="crossover-template-row__title">{template.title}</span>
            <Pencil className="crossover-template-row__edit" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}

export function CrossoverRecentActivitySidebar({
  items,
  formatDateTime
}: {
  items: StaffActivityLog[];
  formatDateTime: (value: string | null) => string;
}) {
  return (
    <section id="crossover-activity-log" className="crossover-card crossover-card--sidebar" aria-labelledby="crossover-activity-heading">
      <header className="crossover-card__header crossover-card__header--compact">
        <div className="crossover-card__header-main">
          <CrossoverIconTile src={CROSSOVER_ASSETS.clock} alt="Recent activity" size={48} />
          <h3 id="crossover-activity-heading" className="crossover-card__title">Recent Activity</h3>
        </div>
        <button type="button" className="crossover-link-btn">View all</button>
      </header>
      <div className="crossover-activity-list">
        {items.slice(0, 6).map((item) => (
          <div key={item.id} className="crossover-activity-item">
            <Image src={CROSSOVER_ASSETS.check} alt="" width={28} height={28} aria-hidden className="crossover-activity-item__icon" />
            <div>
              <p className="crossover-activity-item__title">{item.title}</p>
              <p className="crossover-activity-item__meta">{item.description ?? item.created_by ?? "Staff"} • {formatDateTime(item.created_at)}</p>
            </div>
          </div>
        ))}
        {!items.length ? (
          <div className="crossover-empty crossover-empty--compact">
            <p className="crossover-empty__title">No recent activity</p>
            <p className="crossover-empty__text">Activity from crossover messages will show up here.</p>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="crossover-btn crossover-btn--outline crossover-btn--full"
        onClick={() => document.getElementById("crossover-activity-log")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
      >
        See full activity log
      </button>
    </section>
  );
}
