"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export type SortAccessors<T> = Record<string, (row: T) => unknown>;

function toComparable(value: unknown): string | number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const text = String(value).trim();
  if (!text) return null;
  const asNumber = Number(text.replace(/[$,%]/g, ""));
  if (text.match(/^[\d.$,%-]+$/) && Number.isFinite(asNumber)) return asNumber;
  const asDate = Date.parse(text);
  if (!Number.isNaN(asDate) && (text.includes("-") || text.includes("/") || text.includes("T"))) {
    return asDate;
  }
  return text.toLowerCase();
}

export function compareSortValues(a: unknown, b: unknown): number {
  const left = toComparable(a);
  const right = toComparable(b);
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRowsByKey<T>(
  rows: T[],
  key: string,
  dir: SortDir,
  accessors: SortAccessors<T>
): T[] {
  const getter = accessors[key];
  if (!getter || rows.length < 2) return rows;
  const factor = dir === "asc" ? 1 : -1;
  const indexed = rows.map((row, index) => ({ row, index, value: getter(row) }));
  indexed.sort((a, b) => {
    const cmp = compareSortValues(a.value, b.value);
    if (cmp !== 0) return cmp * factor;
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.row);
}

export function useClientSort<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  defaultKey: string,
  defaultDir: SortDir = "desc"
) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sortedRows = useMemo(
    () => sortRowsByKey(rows, sortKey, sortDir, accessors),
    [rows, sortKey, sortDir, accessors]
  );

  function toggleSort(nextKey: string) {
    if (nextKey === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(defaultDirForKey(nextKey, defaultDir));
  }

  return { sortedRows, sortKey, sortDir, toggleSort };
}

function defaultDirForKey(key: string, fallback: SortDir): SortDir {
  const token = key.toLowerCase();
  if (
    token.includes("date") ||
    token.includes("time") ||
    token.endsWith("_at") ||
    token.includes("created") ||
    token.includes("updated") ||
    token.includes("logged") ||
    token.includes("due") ||
    token.includes("gross") ||
    token.includes("final") ||
    token.includes("amount") ||
    token.includes("cents")
  ) {
    return "desc";
  }
  return fallback === "desc" ? "asc" : "asc";
}

type SortableThProps = {
  label: string;
  column: string;
  sortKey: string;
  sortDir: SortDir;
  onToggle: (column: string) => void;
  className?: string;
};

export function SortableTh({ label, column, sortKey, sortDir, onToggle, className }: SortableThProps) {
  const active = sortKey === column;
  return (
    <th className={className} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`sortable-th-btn${active ? " sortable-th-btn--active" : ""}`}
        onClick={() => onToggle(column)}
      >
        <span>{label}</span>
        <span className="sortable-th-btn__icon" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}
