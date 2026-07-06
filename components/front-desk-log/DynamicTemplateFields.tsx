"use client";

import type { TemplateField, TemplateFieldValues } from "@/lib/frontDeskLog/logTemplates";

type DynamicTemplateFieldsProps = {
  fields: TemplateField[];
  values: TemplateFieldValues;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: string | string[]) => void;
};

function fieldValue(values: TemplateFieldValues, key: string) {
  const value = values[key];
  if (Array.isArray(value)) return value;
  return String(value ?? "");
}

export function DynamicTemplateFields({ fields, values, errors, disabled = false, onChange }: DynamicTemplateFieldsProps) {
  if (!fields.length) return null;

  return (
    <section className="shift-log-template-fields" aria-labelledby="shift-log-template-fields-heading">
      <h4 id="shift-log-template-fields-heading" className="shift-log-template-fields__title">
        Template Details
      </h4>
      <div className="shift-log-template-fields__grid">
        {fields.map((field) => {
          const value = fieldValue(values, field.key);
          const error = errors[field.key];
          const spanClass = field.colSpan === 2 ? "shift-log-template-fields__field shift-log-template-fields__field--full" : "shift-log-template-fields__field";

          if (field.type === "textarea") {
            return (
              <label key={field.key} className={spanClass}>
                <span className="crossover-field__label">{field.label}{field.required ? " *" : ""}</span>
                <textarea
                  className={`crossover-input crossover-textarea ${error ? "crossover-input--invalid" : ""}`}
                  rows={3}
                  value={value}
                  placeholder={field.placeholder}
                  disabled={disabled}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
                {field.helperText ? <span className="shift-log-template-fields__helper">{field.helperText}</span> : null}
                {error ? <span className="shift-log-template-fields__error">{error}</span> : null}
              </label>
            );
          }

          if (field.type === "select" || field.type === "yesNo") {
            const options = field.type === "yesNo" ? ["Yes", "No"] : field.options ?? [];
            return (
              <label key={field.key} className={spanClass}>
                <span className="crossover-field__label">{field.label}{field.required ? " *" : ""}</span>
                <select
                  className={`crossover-input crossover-select ${error ? "crossover-input--invalid" : ""}`}
                  value={value}
                  disabled={disabled}
                  onChange={(event) => onChange(field.key, event.target.value)}
                >
                  <option value="">Select…</option>
                  {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                {field.helperText ? <span className="shift-log-template-fields__helper">{field.helperText}</span> : null}
                {error ? <span className="shift-log-template-fields__error">{error}</span> : null}
              </label>
            );
          }

          if (field.type === "multiSelect") {
            const selected = Array.isArray(values[field.key]) ? (values[field.key] as string[]) : [];
            return (
              <div key={field.key} className={spanClass}>
                <span className="crossover-field__label">{field.label}{field.required ? " *" : ""}</span>
                <div className="shift-log-template-fields__chips">
                  {(field.options ?? []).map((option) => {
                    const active = selected.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`crossover-urgent-pill ${active ? "crossover-urgent-pill--on" : ""}`}
                        disabled={disabled}
                        onClick={() => {
                          const next = active ? selected.filter((item) => item !== option) : [...selected, option];
                          onChange(field.key, next);
                        }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {error ? <span className="shift-log-template-fields__error">{error}</span> : null}
              </div>
            );
          }

          const inputType =
            field.type === "date" ? "date" :
            field.type === "datetime" ? "datetime-local" :
            field.type === "time" ? "time" :
            field.type === "number" ? "number" : "text";

          return (
            <label key={field.key} className={spanClass}>
              <span className="crossover-field__label">{field.label}{field.required ? " *" : ""}</span>
              <input
                className={`crossover-input ${error ? "crossover-input--invalid" : ""}`}
                type={inputType}
                value={value}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
              {field.helperText ? <span className="shift-log-template-fields__helper">{field.helperText}</span> : null}
              {error ? <span className="shift-log-template-fields__error">{error}</span> : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}
