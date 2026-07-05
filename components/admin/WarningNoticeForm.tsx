"use client";

import type { WarningNoticeFormData } from "@/lib/staff/warning-notice-constants";
import {
  EMPTY_WARNING_NOTICE_FORM,
  WARNING_NOTICE_VIOLATION_TYPES,
  type WarningNoticeViolationType
} from "@/lib/staff/warning-notice-constants";

const DEPARTMENTS = ["Daycare", "Grooming", "Training", "Front Desk", "Transportation", "Overnight", "Maintenance", "Other"];

type Props = {
  form: WarningNoticeFormData;
  onChange: (next: WarningNoticeFormData) => void;
  disabled?: boolean;
};

function FieldLine({
  label,
  value,
  onChange,
  type = "text",
  disabled
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="warning-notice-field-line">
      <span className="warning-notice-label">{label}</span>
      <input
        className="warning-notice-input"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function toggleViolationType(form: WarningNoticeFormData, type: WarningNoticeViolationType) {
  const selected = form.violation_types.includes(type);
  return {
    ...form,
    violation_types: selected
      ? form.violation_types.filter((entry) => entry !== type)
      : [...form.violation_types, type]
  };
}

export function WarningNoticeForm({ form, onChange, disabled }: Props) {
  return (
    <div className="warning-notice-sheet">
      <header className="warning-notice-header">
        <p className="warning-notice-company">FITDOG SPORTS CLUB, LLC</p>
        <h3 className="warning-notice-title">WARNING NOTICE</h3>
      </header>

      <div className="warning-notice-row warning-notice-row--two">
        <FieldLine label="Employee:" value={form.employee_name} disabled={disabled} onChange={(employee_name) => onChange({ ...form, employee_name })} />
        <FieldLine label="Date of Violation:" type="date" value={form.violation_date} disabled={disabled} onChange={(violation_date) => onChange({ ...form, violation_date })} />
      </div>

      <div className="warning-notice-row warning-notice-row--two">
        <FieldLine label="Documented by:" value={form.documented_by} disabled={disabled} onChange={(documented_by) => onChange({ ...form, documented_by })} />
        <FieldLine label="Time of Violation:" type="time" value={form.violation_time} disabled={disabled} onChange={(violation_time) => onChange({ ...form, violation_time })} />
      </div>

      <div className="warning-notice-section">
        <p className="warning-notice-label">Type of Violation</p>
        <div className="warning-notice-check-grid">
          {WARNING_NOTICE_VIOLATION_TYPES.map((type) => (
            <label key={type} className="warning-notice-check">
              <input
                type="checkbox"
                checked={form.violation_types.includes(type)}
                disabled={disabled}
                onChange={() => onChange(toggleViolationType(form, type))}
              />
              <span>{type}</span>
            </label>
          ))}
        </div>
        {form.violation_types.includes("Other") ? (
          <input
            className="warning-notice-input warning-notice-input--block"
            placeholder="Other violation details"
            value={form.violation_other}
            disabled={disabled}
            onChange={(event) => onChange({ ...form, violation_other: event.target.value })}
          />
        ) : null}
      </div>

      <label className="warning-notice-block">
        <span className="warning-notice-label">Statement of Violation:</span>
        <textarea
          className="warning-notice-textarea"
          value={form.statement_of_violation}
          disabled={disabled}
          onChange={(event) => onChange({ ...form, statement_of_violation: event.target.value })}
        />
      </label>

      <label className="warning-notice-block">
        <span className="warning-notice-label">Employee Statement:</span>
        <textarea
          className="warning-notice-textarea"
          value={form.employee_statement}
          disabled={disabled}
          onChange={(event) => onChange({ ...form, employee_statement: event.target.value })}
        />
      </label>

      <p className="warning-notice-divider">Below to be filled out by management</p>

      <div className="warning-notice-row warning-notice-row--four">
        <FieldLine label="Date of Warning:" type="date" value={form.date_of_warning} disabled={disabled} onChange={(date_of_warning) => onChange({ ...form, date_of_warning })} />
        <FieldLine label="Type of Warning:" value={form.type_of_warning} disabled={disabled} onChange={(type_of_warning) => onChange({ ...form, type_of_warning })} />
        <FieldLine label="Employee No.:" value={form.employee_number} disabled={disabled} onChange={(employee_number) => onChange({ ...form, employee_number })} />
        <label className="warning-notice-field-line">
          <span className="warning-notice-label">Department:</span>
          <select
            className="warning-notice-input"
            value={form.employee_department}
            disabled={disabled}
            onChange={(event) => onChange({ ...form, employee_department: event.target.value })}
          >
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="warning-notice-table-wrap">
        <table className="warning-notice-table">
          <thead>
            <tr>
              <th colSpan={5}>PREVIOUS WARNINGS</th>
            </tr>
            <tr>
              <th>Date</th>
              <th>Verbal</th>
              <th>Written</th>
              <th>By Whom</th>
              <th>Type of Violation / Details</th>
            </tr>
          </thead>
          <tbody>
            {form.previous_warnings.map((row, index) => (
              <tr key={index}>
                <td>
                  <input
                    className="warning-notice-table-input"
                    type="date"
                    value={row.date}
                    disabled={disabled}
                    onChange={(event) => {
                      const previous_warnings = [...form.previous_warnings];
                      previous_warnings[index] = { ...row, date: event.target.value };
                      onChange({ ...form, previous_warnings });
                    }}
                  />
                </td>
                <td className="warning-notice-table-check">
                  <input
                    type="checkbox"
                    checked={row.verbal}
                    disabled={disabled}
                    onChange={(event) => {
                      const previous_warnings = [...form.previous_warnings];
                      previous_warnings[index] = { ...row, verbal: event.target.checked };
                      onChange({ ...form, previous_warnings });
                    }}
                  />
                </td>
                <td className="warning-notice-table-check">
                  <input
                    type="checkbox"
                    checked={row.written}
                    disabled={disabled}
                    onChange={(event) => {
                      const previous_warnings = [...form.previous_warnings];
                      previous_warnings[index] = { ...row, written: event.target.checked };
                      onChange({ ...form, previous_warnings });
                    }}
                  />
                </td>
                <td>
                  <input
                    className="warning-notice-table-input"
                    value={row.by_whom}
                    disabled={disabled}
                    onChange={(event) => {
                      const previous_warnings = [...form.previous_warnings];
                      previous_warnings[index] = { ...row, by_whom: event.target.value };
                      onChange({ ...form, previous_warnings });
                    }}
                  />
                </td>
                <td>
                  <input
                    className="warning-notice-table-input"
                    value={row.violation_details}
                    disabled={disabled}
                    onChange={(event) => {
                      const previous_warnings = [...form.previous_warnings];
                      previous_warnings[index] = { ...row, violation_details: event.target.value };
                      onChange({ ...form, previous_warnings });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="warning-notice-block">
        <span className="warning-notice-label">Action to be Taken:</span>
        <textarea
          className="warning-notice-textarea warning-notice-textarea--short"
          value={form.action_to_be_taken}
          disabled={disabled}
          onChange={(event) => onChange({ ...form, action_to_be_taken: event.target.value })}
        />
      </label>

      <div className="warning-notice-signatures">
        <p className="warning-notice-label">
          Signatures: I have read and understand this warning decision and action to be taken.
        </p>
        <div className="warning-notice-row warning-notice-row--two">
          <FieldLine label="Employee&apos;s Signature" value={form.employee_signature} disabled={disabled} onChange={(employee_signature) => onChange({ ...form, employee_signature })} />
          <FieldLine label="Date" type="date" value={form.employee_signature_date} disabled={disabled} onChange={(employee_signature_date) => onChange({ ...form, employee_signature_date })} />
        </div>
        <div className="warning-notice-row warning-notice-row--two">
          <FieldLine label="Manager&apos;s Signature" value={form.manager_signature} disabled={disabled} onChange={(manager_signature) => onChange({ ...form, manager_signature })} />
          <FieldLine label="Date" type="date" value={form.manager_signature_date} disabled={disabled} onChange={(manager_signature_date) => onChange({ ...form, manager_signature_date })} />
        </div>
      </div>
    </div>
  );
}

export { EMPTY_WARNING_NOTICE_FORM, DEPARTMENTS };
