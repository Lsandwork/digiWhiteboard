"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/ui/ToastProvider";

export function MarketingHistoryPanel() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/marketing/history", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Unable to load history.", "error");
    else setEntries(body.entries ?? []);
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="marketing-card">
      <h2 className="marketing-card__title mb-4">Activity History</h2>
      <table className="marketing-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Entity</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={String(entry.id)}>
              <td>{new Date(String(entry.created_at)).toLocaleString()}</td>
              <td>{String(entry.actor_email ?? "system")}</td>
              <td>{String(entry.action)}</td>
              <td>{String(entry.entity_type)} {entry.entity_id ? `· ${String(entry.entity_id).slice(0, 8)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!entries.length ? <div className="marketing-empty">No activity yet.</div> : null}
    </div>
  );
}
