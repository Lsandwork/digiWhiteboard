"use client";

import { useEffect, useState } from "react";

function rowLabel(row: Record<string, unknown>) {
  return String(row.label || row.name || row.title || row.email || row.action || row.id || "Item");
}

function rowMeta(row: Record<string, unknown>) {
  const bits = [
    row.slug ? `/${row.slug}` : null,
    row.status ? String(row.status) : null,
    row.active === false ? "inactive" : null,
    row.approved === false ? "unapproved" : null
  ].filter(Boolean);
  return bits.join(" · ");
}

export function BlogGenericPanel({
  title,
  description,
  endpoint,
  listKey
}: {
  title: string;
  description?: string;
  endpoint: string;
  listKey: string;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(endpoint);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        if (!cancelled) setRows((json[listKey] || []) as Record<string, unknown>[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, listKey]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">{title}</h2>
        {description ? <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">{description}</p> : null}
      </div>
      {error ? <p className="text-sm text-amber-700">{error}</p> : null}
      {loading ? <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">Loading…</p> : null}
      {!loading && !error ? (
        <div className="blog-dash-card overflow-hidden">
          <ul className="divide-y divide-[var(--fitdog-border,#e6e8eb)]">
            {rows.map((row, index) => (
              <li key={String(row.id || index)} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--fitdog-heading,#121417)]">{rowLabel(row)}</p>
                  <p className="text-xs text-[var(--fitdog-muted,#6b7280)]">{rowMeta(row) || "—"}</p>
                </div>
                {row.created_at || row.updated_at || row.consent_at ? (
                  <time className="shrink-0 text-[11px] text-[var(--fitdog-muted,#6b7280)]">
                    {new Date(String(row.updated_at || row.consent_at || row.created_at)).toLocaleString()}
                  </time>
                ) : null}
              </li>
            ))}
            {!rows.length ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--fitdog-muted,#6b7280)]">No records yet.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
