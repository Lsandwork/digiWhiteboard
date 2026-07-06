"use client";

import { ExternalLink } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import type { CrossoverReply } from "@/lib/staff/admin-ops";
import type { ManagementReport } from "@/lib/staff/management-reports";
import type { EnrichedNotification } from "@/lib/staff/notification-hub";
import {
  buildCrossoverThreadEntries,
  buildSupportThreadEntries,
  NotificationThread
} from "@/components/admin/notifications/NotificationThread";
import { NotificationReplyComposer } from "@/components/admin/notifications/NotificationReplyComposer";
import { NotificationStatusBadge } from "@/components/admin/notifications/NotificationStatusBadge";
import { NotificationTypeBadge } from "@/components/admin/notifications/NotificationTypeBadge";

const SUPPORT_STATUSES = ["Submitted", "In Review", "Needs More Info", "Resolved", "Closed"] as const;

type NotificationDetailPanelProps = {
  notification: EnrichedNotification | null;
  report: ManagementReport | null;
  crossoverReplies: CrossoverReply[];
  busy: boolean;
  replyText: string;
  canReplySupport: boolean;
  canReplyCrossover: boolean;
  canInternalNote: boolean;
  canManageStatus: boolean;
  onReplyTextChange: (value: string) => void;
  onSendReply: (options: { internalNote: boolean; markResolved: boolean }) => void;
  onStatusChange: (status: string) => void;
  onAssign: (name: string) => void;
  onSupportAction: (action: string) => void;
  onOpenTab?: (tab: AdminTab) => void;
  staffNames: string[];
};

function sourceTabForNotification(notification: EnrichedNotification): AdminTab | null {
  if (notification.source_tab === "crossover_communication") return "crossover_communication";
  if (notification.source_tab === "owner_follow_up") return "owner_follow_up";
  if (notification.source_tab === "active_issues") return "active_issues";
  if (notification.source_tab === "push_notices") return "push_notices";
  if (notification.linkedReport?.report_type === "employee_write_up") return "management_support";
  return null;
}

export function NotificationDetailPanel({
  notification,
  report,
  crossoverReplies,
  busy,
  replyText,
  canReplySupport,
  canReplyCrossover,
  canInternalNote,
  canManageStatus,
  onReplyTextChange,
  onSendReply,
  onStatusChange,
  onAssign,
  onSupportAction,
  onOpenTab,
  staffNames
}: NotificationDetailPanelProps) {
  if (!notification) {
    return (
      <aside className="notif-hub-detail notif-hub-detail--empty">
        <p className="notif-hub-detail__empty-title">Select a notification</p>
        <p className="notif-hub-detail__empty-text">Select a notification to view details and reply.</p>
      </aside>
    );
  }

  const threadEntries = report
    ? buildSupportThreadEntries(report, canInternalNote)
    : notification.linkedCrossover
      ? buildCrossoverThreadEntries(
          notification.linkedCrossover.subject,
          notification.linkedCrossover.message,
          notification.linkedCrossover.created_by,
          notification.linkedCrossover.created_at,
          crossoverReplies
        )
      : [];

  const canReply = Boolean((report && canReplySupport) || (notification.linkedCrossover && canReplyCrossover));
  const linkedTab = sourceTabForNotification(notification);

  return (
    <aside className="notif-hub-detail">
      <header className="notif-hub-detail__header">
        <div className="notif-hub-detail__badges">
          <NotificationTypeBadge type={notification.displayType} />
          <NotificationStatusBadge status={notification.displayStatus} />
        </div>
        <h2 className="notif-hub-detail__title">{notification.title}</h2>
        <div className="notif-hub-detail__meta">
          <span>{notification.created_by ? `From ${notification.created_by}` : "System"}</span>
          <span>• {new Date(notification.created_at).toLocaleString()}</span>
        </div>
        {report ? (
          <div className="notif-hub-detail__linked">
            <p>
              <strong>Submission ID:</strong> {report.id.slice(0, 8)}…
            </p>
            <p>
              <strong>Submitted by:</strong> {report.submitted_by_name ?? report.created_by}
            </p>
            <p>
              <strong>Type:</strong> {report.item_type ?? report.report_type}
            </p>
            {report.related_dog_name ? (
              <p>
                <strong>Dog:</strong> {report.related_dog_name}
              </p>
            ) : null}
            {report.related_owner_name ? (
              <p>
                <strong>Owner:</strong> {report.related_owner_name}
              </p>
            ) : null}
            {report.assigned_to ? (
              <p>
                <strong>Assigned:</strong> {report.assigned_to}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="notif-hub-detail__actions">
          {linkedTab && onOpenTab ? (
            <button type="button" className="crossover-btn crossover-btn--outline" onClick={() => onOpenTab(linkedTab)}>
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              Open linked page
            </button>
          ) : null}
          {report && canManageStatus ? (
            <>
              <select
                className="notif-hub-toolbar__select"
                value={report.admin_status ?? "Submitted"}
                disabled={busy}
                onChange={(event) => onStatusChange(event.target.value)}
              >
                {SUPPORT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                className="notif-hub-toolbar__select"
                value={report.assigned_to ?? ""}
                disabled={busy}
                onChange={(event) => onAssign(event.target.value)}
              >
                <option value="">Unassigned</option>
                {staffNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => onSupportAction("close")}>
                Close
              </button>
              {report.admin_status === "Closed" ? (
                <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => onSupportAction("reopen")}>
                  Reopen
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      <section className="notif-hub-detail__section">
        <h3 className="notif-hub-detail__section-title">Conversation</h3>
        {notification.body && !report && !notification.linkedCrossover ? (
          <p className="notif-hub-detail__body">{notification.body}</p>
        ) : null}
        <NotificationThread entries={threadEntries} />
      </section>

      <NotificationReplyComposer
        value={replyText}
        busy={busy}
        canReply={canReply}
        canInternalNote={canInternalNote && Boolean(report)}
        canResolve={canManageStatus && Boolean(report)}
        onChange={onReplyTextChange}
        onSend={onSendReply}
      />
    </aside>
  );
}
