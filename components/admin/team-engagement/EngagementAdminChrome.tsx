"use client";

import type { ReactNode } from "react";

export function EngagementPageIntro({
  kicker,
  title,
  lede,
  actions
}: {
  kicker?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ro-manage-intro">
      <div>
        {kicker ? <p className="ro-ai-kicker">{kicker}</p> : null}
        <h2 className="ro-manage-intro__title">{title}</h2>
        {lede ? <p className="ro-ai-lede">{lede}</p> : null}
      </div>
      {actions ? <div className="ro-ai-controls">{actions}</div> : null}
    </header>
  );
}

export function EngagementPremiumSection({
  title,
  description,
  actions,
  children,
  className = ""
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ro-te-card ro-te-section ro-ai-card ${className}`.trim()}>
      <div className="ro-ai-section-title">
        <h3>{title}</h3>
        {actions}
      </div>
      {description ? <p className="ro-ai-muted" style={{ marginBottom: 10 }}>{description}</p> : null}
      {children}
    </section>
  );
}

export function EngagementToolbar({ children }: { children: ReactNode }) {
  return <div className="ro-manage-toolbar">{children}</div>;
}

export function EngagementStatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "active" || normalized === "published" || normalized === "open"
      ? "ro-manage-pill--good"
      : normalized === "draft" || normalized === "scheduled"
        ? "ro-manage-pill--muted"
        : normalized === "closed" || normalized === "archived" || normalized === "resolved"
          ? "ro-manage-pill--neutral"
          : "ro-manage-pill--accent";
  return <span className={`ro-manage-pill ${tone}`}>{status}</span>;
}

export function EngagementDataTable({
  columns,
  rows,
  emptyTitle,
  emptyBody
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: { id: string; cells: Record<string, ReactNode> }[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (!rows.length) {
    return (
      <div className="ro-ai-empty">
        <h3>{emptyTitle ?? "Nothing here yet"}</h3>
        {emptyBody ? <p>{emptyBody}</p> : null}
      </div>
    );
  }
  return (
    <div className="ro-ai-table-wrap">
      <table className="ro-ai-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {row.cells[column.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}