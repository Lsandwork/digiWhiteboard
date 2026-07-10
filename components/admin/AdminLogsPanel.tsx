"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AuditLogEntry } from "@/lib/admin/types";
import type { WebhookEvent } from "@/lib/types";
import { AdminTable } from "@/components/admin/ui/AdminTable";

type AdminLogsPanelProps = {
  webhookUrl: string;
  events: WebhookEvent[];
  failedEvents: WebhookEvent[];
  board: "lobby" | "staff";
};

export function AdminLogsPanel({ webhookUrl, events, failedEvents, board }: AdminLogsPanelProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [search, setSearch] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ board, limit: "50" });
      if (actionFilter) params.set("action", actionFilter);
      if (actorFilter) params.set("actor", actorFilter);
      if (search) params.set("search", search);
      const response = await fetch(`/api/admin/logs?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      setAuditLogs(body.audit_logs ?? []);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, actorFilter, board, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLogs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  const actionOptions = useMemo(() => {
    const values = new Set(auditLogs.map((log) => log.action));
    return Array.from(values).sort();
  }, [auditLogs]);

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Logs</h2>
          <p className="admin-page-subtitle">Audit activity, publish history, and webhook events.</p>
        </div>
      </header>

      <section className="admin-card p-5">
        <h3 className="admin-section-title">Audit & Activity Logs</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
            <input className="admin-input pl-9" placeholder="Search logs…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search logs" />
          </label>
          <select className="admin-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filter by action">
            <option value="">All actions</option>
            {actionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
          <input className="admin-input" placeholder="Filter by admin" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} aria-label="Filter by admin user" />
        </div>
        <div className="mt-4">
          <AdminTable
            loading={loading}
            rows={auditLogs}
            rowKey={(row) => row.id}
            emptyTitle="No audit logs yet"
            emptyDescription="Admin actions like login, publish, and user changes appear here."
            columns={[
              { key: "action", header: "Action", render: (row) => <span className="font-semibold text-white">{row.action}</span> },
              { key: "actor", header: "Admin", render: (row) => row.actor_email ?? "System" },
              { key: "target", header: "Target", hideOnMobile: true, render: (row) => row.target_type ? `${row.target_type}${row.target_id ? `: ${row.target_id}` : ""}` : "—" },
              { key: "when", header: "When", render: (row) => new Date(row.created_at).toLocaleString() }
            ]}
          />
        </div>
      </section>

      <section className="admin-card p-5">
        <h3 className="admin-section-title">Webhook URL</h3>
        <p className="admin-section-helper">Configure this URL in Gingr to send events to Supabase.</p>
        <input readOnly value={webhookUrl} className="admin-input mt-3 font-mono text-xs" onFocus={(e) => e.target.select()} />
      </section>

      <EventTable title="Recent Webhook Events" events={events} />
      <EventTable title="Failed Events" events={failedEvents} />
    </div>
  );
}

function EventTable({ title, events }: { title: string; events: WebhookEvent[] }) {
  return (
    <section className="admin-card p-5">
      <h3 className="admin-section-title">{title}</h3>
      <AdminTable
        rows={events}
        rowKey={(row) => row.id}
        emptyTitle="No events"
        emptyDescription="Webhook events will appear here when Gingr sends them."
        columns={[
          { key: "type", header: "Type", render: (row) => row.webhook_type },
          { key: "entity", header: "Entity", render: (row) => row.entity_id },
          { key: "verified", header: "Verified", hideOnMobile: true, render: (row) => row.verified ? "Yes" : "No" },
          { key: "processed", header: "Processed", render: (row) => row.processed ? "Yes" : row.processing_error ?? "No" }
        ]}
      />
    </section>
  );
}
