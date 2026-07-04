"use client";

import type { WebhookEvent } from "@/lib/types";

type AdminLogsPanelProps = {
  webhookUrl: string;
  events: WebhookEvent[];
  failedEvents: WebhookEvent[];
};

export function AdminLogsPanel({ webhookUrl, events, failedEvents }: AdminLogsPanelProps) {
  return (
    <div className="space-y-5">
      <section className="admin-card p-5">
        <h2 className="mb-3 text-lg font-black text-white">Webhook URL</h2>
        <input readOnly value={webhookUrl} className="admin-input font-mono text-xs" />
      </section>
      <EventTable title="Recent Webhook Events" events={events} />
      <EventTable title="Failed Events" events={failedEvents} />
    </div>
  );
}

function EventTable({ title, events }: { title: string; events: WebhookEvent[] }) {
  return (
    <section className="admin-card overflow-hidden p-5">
      <h2 className="mb-3 text-lg font-black text-white">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-admin-muted">
            <tr>
              <th className="pb-2">Type</th>
              <th className="pb-2">Entity</th>
              <th className="pb-2">Verified</th>
              <th className="pb-2">Processed</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-admin-border/60 text-white/90">
                <td className="py-2">{event.webhook_type}</td>
                <td className="py-2">{event.entity_id}</td>
                <td className="py-2">{event.verified ? "Yes" : "No"}</td>
                <td className="py-2">{event.processed ? "Yes" : event.processing_error ?? "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!events.length ? <p className="py-3 text-admin-muted">No events.</p> : null}
      </div>
    </section>
  );
}
