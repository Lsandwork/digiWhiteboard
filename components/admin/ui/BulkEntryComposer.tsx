"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

export type BulkComposerColumn<T extends { id: string }> = {
  key: keyof T & string;
  label: string;
  kind: "text" | "textarea" | "select";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  className?: string;
};

type BulkEntryComposerProps<T extends { id: string }> = {
  rows: T[];
  columns: Array<BulkComposerColumn<T>>;
  createEmpty: () => T;
  isEmpty: (row: T) => boolean;
  onChange: (rows: T[]) => void;
  busy?: boolean;
  maxRows?: number;
  title?: string;
  description?: string;
  addLabel?: string;
  footer?: ReactNode;
};

const DEFAULT_MAX_ROWS = 40;

function cssAttr(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function isEnterNewRow(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter") return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  const native = event.nativeEvent as KeyboardEvent["nativeEvent"] & { isComposing?: boolean };
  if (native.isComposing || native.keyCode === 229) return false;
  return true;
}

export function BulkEntryComposer<T extends { id: string }>({
  rows,
  columns,
  createEmpty,
  isEmpty,
  onChange,
  busy = false,
  maxRows = DEFAULT_MAX_ROWS,
  title = "Entries",
  description = "Press Enter to add another row. Shift+Enter starts a new line in a note.",
  addLabel = "Add row",
  footer
}: BulkEntryComposerProps<T>) {
  const focusRef = useRef<{ rowId: string; field: string } | null>(null);
  const primaryField = columns[0]?.key ?? "id";

  useEffect(() => {
    const target = focusRef.current;
    if (!target) return;
    focusRef.current = null;
    const el = document.querySelector<HTMLElement>(
      `[data-bulk-row="${cssAttr(target.rowId)}"][data-bulk-field="${cssAttr(target.field)}"]`
    );
    el?.focus();
  }, [rows]);

  function patchRow(index: number, key: keyof T & string, value: string) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }

  function insertRowAfter(index: number) {
    if (rows.length >= maxRows) return;
    const next = createEmpty();
    const updated = [...rows.slice(0, index + 1), next, ...rows.slice(index + 1)];
    focusRef.current = { rowId: next.id, field: primaryField };
    onChange(updated);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      onChange([createEmpty()]);
      return;
    }
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function handleFieldKeyDown(event: KeyboardEvent<HTMLElement>, index: number) {
    if (!isEnterNewRow(event)) return;
    event.preventDefault();
    insertRowAfter(index);
  }

  const filledCount = rows.filter((row) => !isEmpty(row)).length;

  return (
    <div className="bulk-entry-composer">
      <div className="bulk-entry-composer__intro">
        <div>
          <h4 className="bulk-entry-composer__title">{title}</h4>
          <p className="bulk-entry-composer__hint">{description}</p>
        </div>
        <span className="bulk-entry-composer__count">
          {filledCount} {filledCount === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="bulk-entry-table-wrap">
        <table className="bulk-entry-table">
          <thead>
            <tr>
              <th className="bulk-entry-table__index" scope="col">
                #
              </th>
              {columns.map((column) => (
                <th key={column.key} className={column.className} scope="col">
                  {column.label}
                </th>
              ))}
              <th className="bulk-entry-table__actions" scope="col">
                <span className="bulk-entry-sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td className="bulk-entry-table__index">{index + 1}</td>
                {columns.map((column) => {
                  const value = String(row[column.key] ?? "");
                  const shared = {
                    className: `admin-input bulk-entry-field${column.kind === "textarea" ? " bulk-entry-field--note" : ""}`,
                    disabled: busy,
                    value,
                    "data-bulk-row": row.id,
                    "data-bulk-field": column.key,
                    onChange: (
                      event: { target: { value: string } }
                    ) => patchRow(index, column.key, event.target.value),
                    onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleFieldKeyDown(event, index)
                  };
                  return (
                    <td key={column.key} className={column.className}>
                      {column.kind === "select" ? (
                        <select
                          className={shared.className}
                          disabled={shared.disabled}
                          value={value}
                          data-bulk-row={row.id}
                          data-bulk-field={column.key}
                          onChange={(event) => patchRow(index, column.key, event.target.value)}
                        >
                          {(column.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : column.kind === "textarea" ? (
                        <textarea
                          {...shared}
                          rows={2}
                          placeholder={column.placeholder}
                        />
                      ) : (
                        <input type="text" {...shared} placeholder={column.placeholder} />
                      )}
                    </td>
                  );
                })}
                <td className="bulk-entry-table__actions">
                  <button
                    type="button"
                    className="bulk-entry-remove"
                    disabled={busy || (rows.length === 1 && isEmpty(row))}
                    onClick={() => removeRow(index)}
                    aria-label={`Remove row ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bulk-entry-composer__footer">
        <button
          type="button"
          className="admin-btn-secondary"
          disabled={busy || rows.length >= maxRows}
          onClick={() => insertRowAfter(rows.length - 1)}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {addLabel}
        </button>
        {footer}
      </div>
    </div>
  );
}
