"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { BulkEntryComposer } from "@/components/admin/ui/BulkEntryComposer";
import { STAFF_PRIORITIES, type StaffOpsPriority } from "@/lib/staff/admin-ops";
import { ASSIGNMENT_TEAMS, SHIFT_LOG_TYPES, type ShiftLogType } from "@/lib/staff/front-desk-log";
import {
  BULK_SHIFT_LOG_LIMIT,
  emptyBulkShiftLogRow,
  isBulkShiftLogRowEmpty,
  normalizeBulkShiftLogRows,
  type BulkShiftLogRow,
  type NormalizedBulkShiftLogEntry
} from "@/lib/staff/bulk-shift-log";

export function BulkShiftLogComposer({
  title,
  subtitle,
  busy,
  assignOptions,
  defaultLogType,
  defaultDepartment,
  submitLabel,
  onSubmit
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  assignOptions: string[];
  defaultLogType: ShiftLogType;
  defaultDepartment: string;
  submitLabel: string;
  onSubmit: (entries: NormalizedBulkShiftLogEntry[], defaults: {
    log_type: ShiftLogType;
    priority: StaffOpsPriority;
    assigned_to: string;
    department_area: string;
  }) => Promise<void>;
}) {
  const [logType, setLogType] = useState<ShiftLogType>(defaultLogType);
  const [priority, setPriority] = useState<StaffOpsPriority>("Normal");
  const [assignedTo, setAssignedTo] = useState("");
  const [department, setDepartment] = useState(defaultDepartment);
  const [rows, setRows] = useState<BulkShiftLogRow[]>([emptyBulkShiftLogRow()]);

  const assignmentNames = useMemo(
    () => [...new Set([...ASSIGNMENT_TEAMS, ...assignOptions])],
    [assignOptions]
  );
  const readyCount = normalizeBulkShiftLogRows(rows).length;

  async function submitAll() {
    const entries = normalizeBulkShiftLogRows(rows);
    if (!entries.length) return;
    await onSubmit(entries, {
      log_type: logType,
      priority,
      assigned_to: assignedTo,
      department_area: department
    });
    setRows([emptyBulkShiftLogRow()]);
  }

  return (
    <section className="crossover-card crossover-card--create" aria-labelledby="bulk-shift-log-heading">
      <header className="crossover-card__header crossover-card__header--create">
        <div className="crossover-card__header-main">
          <div>
            <h3 id="bulk-shift-log-heading" className="crossover-card__title">
              {title}
            </h3>
            <p className="crossover-card__subtitle">{subtitle}</p>
          </div>
        </div>
      </header>

      <div className="crossover-form">
        <h4 className="shift-log-form-section-title">Shared details</h4>
        <div className="crossover-form__row crossover-form__row--3">
          <label className="crossover-field">
            <span className="crossover-field__label">Log type</span>
            <select className="crossover-input crossover-select" value={logType} disabled={busy} onChange={(event) => setLogType(event.target.value as ShiftLogType)}>
              {SHIFT_LOG_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="crossover-field">
            <span className="crossover-field__label">Priority</span>
            <select className="crossover-input crossover-select" value={priority} disabled={busy} onChange={(event) => setPriority(event.target.value as StaffOpsPriority)}>
              {STAFF_PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="crossover-field">
            <span className="crossover-field__label">Assigned to</span>
            <select className="crossover-input crossover-select" value={assignedTo} disabled={busy} onChange={(event) => setAssignedTo(event.target.value)}>
              <option value="">Unassigned</option>
              {assignmentNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="crossover-field">
          <span className="crossover-field__label">Department / area</span>
          <input
            className="crossover-input"
            value={department}
            disabled={busy}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="Front Desk, Yard, Training…"
          />
        </label>

        <BulkEntryComposer
          rows={rows}
          onChange={setRows}
          createEmpty={emptyBulkShiftLogRow}
          isEmpty={isBulkShiftLogRowEmpty}
          busy={busy}
          maxRows={BULK_SHIFT_LOG_LIMIT}
          title="Entry rows"
          description="Type each note on its own row. Press Enter to start the next entry. Shift+Enter adds a line inside a note."
          addLabel="Add entry row"
          columns={[
            { key: "related_dog_name", label: "Dog", kind: "text", placeholder: "Optional", className: "bulk-entry-col--dog" },
            { key: "subject", label: "Subject", kind: "text", placeholder: "Short title", className: "bulk-entry-col--subject" },
            { key: "details", label: "Details", kind: "textarea", placeholder: "What the incoming staff needs to know", className: "bulk-entry-col--details" }
          ]}
          footer={
            <button
              type="button"
              className="crossover-btn crossover-btn--primary"
              disabled={busy || readyCount === 0}
              onClick={() => void submitAll()}
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              {busy ? "Saving…" : `${submitLabel}${readyCount ? ` (${readyCount})` : ""}`}
            </button>
          }
        />
      </div>
    </section>
  );
}
