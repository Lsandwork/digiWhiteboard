"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Send, X } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import type { NotificationDetailPayload } from "@/lib/staff/notification-detail";
import type { ManagementReport } from "@/lib/staff/management-reports";
import { displayTypeLabel } from "@/lib/staff/notification-hub";
import {
  buildCrossoverThreadEntries,
  buildSupportThreadEntries,
  NotificationThread
} from "@/components/admin/notifications/NotificationThread";
import { NotificationStatusBadge } from "@/components/admin/notifications/NotificationStatusBadge";
import { NotificationTypeBadge } from "@/components/admin/notifications/NotificationTypeBadge";
import { QUICK_REPLIES } from "@/lib/staff/notification-hub";

const SUPPORT_STATUSES = ["Submitted", "In Review", "Needs More Info", "Resolved", "Closed"] as const;

type NotificationResponseModalProps = {
  open: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  success: string | null;
  detail: NotificationDetailPayload | null;
  replyText: string;
  staffNames: string[];
  onClose: () => void;
  onReplyTextChange: (value: string) => void;
  onSendReply: (options: { internalNote: boolean; markResolved: boolean }) => void;
  onStatusChange: (status: string) => void;
  onAssign: (name: string) => void;
  onSupportAction: (action: string) => void;
  onOpenTab?: (tab: AdminTab) => void;
};

function sourceTabLabel(tab: string | null | undefined): string {
  switch (tab) {
    case "crossover_communication":
      return "Front Desk Log";
    case "owner_follow_up":
      return "Owner Follow-Up";
    case "active_issues":
      return "Active Issues";
    case "push_notices":
      return "Push Notices / Management Support";
    default:
      return "Notifications";
  }
}

function sourceTabForReport(report: ManagementReport | null, sourceTab: string): AdminTab | null {
  if (sourceTab === "crossover_communication") return "crossover_communication";
  if (sourceTab === "owner_follow_up") return "owner_follow_up";
  if (sourceTab === "active_issues") return "active_issues";
  if (sourceTab === "push_notices") return "push_notices";
  if (report?.report_type === "employee_write_up") return "management_support";
  return null;
}

function submissionTypeLabel(report: ManagementReport | null, displayType: string) {
  if (report?.report_type === "employee_write_up") return "Write-Up Submission";
  if (report?.item_type === "request") return "Request";
  if (report?.item_type === "complaint") return "Complaint";
  if (report?.report_type === "owner_complaint_dog_handler") return "Owner Complaint";
  return displayTypeLabel(displayType as Parameters<typeof displayTypeLabel>[0]);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value}</td>
    </tr>
  );
}

export function NotificationResponseModal({
  open,
  loading,
  busy,
  error,
  success,
  detail,
  replyText,
  staffNames,
  onClose,
  onReplyTextChange,
  onSendReply,
  onStatusChange,
  onAssign,
  onSupportAction,
  onOpenTab
}: NotificationResponseModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [internalNote, setInternalNote] = useState(false);
  const [markResolved, setMarkResolved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setInternalNote(false);
    setMarkResolved(false);
  }, [open, detail?.notification.id]);

  if (!open) return null;

  const notification = detail?.notification ?? null;
  const report = detail?.report ?? null;
  const permissions = detail?.permissions;
  const canInternalNote = permissions?.canInternalNote ?? false;
  const canManage = permissions?.canManageStatus ?? false;
  const canReply = permissions?.canReply ?? false;

  const threadEntries = report
    ? buildSupportThreadEntries(report, canInternalNote)
    : notification?.linkedCrossover
      ? buildCrossoverThreadEntries(
          notification.linkedCrossover.subject,
          notification.linkedCrossover.message,
          notification.linkedCrossover.created_by,
          notification.linkedCrossover.created_at,
          detail?.crossoverReplies ?? []
        )
      : [];

  const linkedTab = notification ? sourceTabForReport(report, notification.source_tab) : null;
  const relatedTo =
    report?.related_dog_name ||
    report?.related_owner_name ||
    notification?.linkedCrossover?.related_dog_name ||
    notification?.linkedFollowUp?.dog_name ||
    "—";

  const modal = (
    <div className="admin-theme">
      <div
        className="notif-response-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
      >
        <div
          ref={dialogRef}
          className="notif-response-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
        <header className="notif-response-modal__header">
          <div className="notif-response-modal__header-main">
            {notification ? (
              <div className="notif-response-modal__badges">
                <NotificationTypeBadge type={notification.displayType} />
                <NotificationStatusBadge status={notification.displayStatus} />
                {(notification.priority === "High" || notification.priority === "Urgent" || notification.priority === "Critical") && (
                  <span className="notif-hub-priority notif-hub-priority--high">{notification.priority}</span>
                )}
              </div>
            ) : null}
            <h2 id={titleId} className="notif-response-modal__title">
              {loading ? "Loading…" : notification?.title ?? "Notification"}
            </h2>
            {notification ? (
              <p className="notif-response-modal__meta">
                {notification.created_by ? `From ${notification.created_by}` : "System"} • {formatDateTime(notification.created_at)}
              </p>
            ) : null}
          </div>
          <button type="button" className="admin-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="notif-response-modal__body">
          {loading ? (
            <p className="notif-response-modal__loading">Loading submission details…</p>
          ) : error ? (
            <p className="admin-error">{error}</p>
          ) : !notification ? (
            <p className="notif-response-modal__loading">This notification could not be loaded.</p>
          ) : (
            <>
              {success ? <p className="notif-response-modal__success">{success}</p> : null}

              <section className="notif-response-modal__section">
                <h3 className="notif-response-modal__section-title">Summary</h3>
                <div className="notif-response-table-wrap">
                  <table className="notif-response-table">
                    <tbody>
                      <SummaryRow label="Submission Type" value={submissionTypeLabel(report, notification.displayType)} />
                      <SummaryRow label="Submitted By" value={report?.submitted_by_name ?? report?.created_by ?? notification.created_by ?? "—"} />
                      <SummaryRow label="Submitted Date" value={report ? formatDateTime(report.created_at) : formatDateTime(notification.created_at)} />
                      <SummaryRow label="Assigned To" value={report?.assigned_to ?? "Unassigned"} />
                      <SummaryRow label="Status" value={<NotificationStatusBadge status={notification.displayStatus} />} />
                      <SummaryRow label="Priority" value={report?.priority ?? notification.priority} />
                      <SummaryRow label="Related Dog" value={report?.related_dog_name ?? notification.linkedCrossover?.related_dog_name} />
                      <SummaryRow label="Related Owner" value={report?.related_owner_name ?? notification.linkedCrossover?.related_owner_name} />
                      <SummaryRow label="Department / Area" value={report?.department ?? notification.linkedCrossover?.from_department} />
                      <SummaryRow label="Source Page" value={sourceTabLabel(notification.source_tab)} />
                      <SummaryRow label="Submission ID" value={report ? report.id : notification.source_id} />
                      <SummaryRow label="Related To" value={relatedTo} />
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="notif-response-modal__section">
                <h3 className="notif-response-modal__section-title">Submission Details</h3>
                <div className="notif-response-details">
                  {report?.write_up_details ? (
                    <div className="notif-response-details__grid">
                      <p><strong>Employee:</strong> {report.write_up_details.employee_name} ({report.write_up_details.employee_department})</p>
                      <p><strong>Violation date:</strong> {report.write_up_details.violation_date}</p>
                      <p><strong>Documented by:</strong> {report.write_up_details.documented_by ?? report.created_by}</p>
                      <p className="notif-response-details__full"><strong>Statement:</strong> {report.write_up_details.statement_of_violation}</p>
                      {report.management_response ? (
                        <p className="notif-response-details__full notif-response-details__highlight"><strong>Management response:</strong> {report.management_response}</p>
                      ) : null}
                    </div>
                  ) : report?.groomer_submission_details ? (
                    <p className="notif-response-details__full">{report.groomer_submission_details.description}</p>
                  ) : report ? (
                    <p className="notif-response-details__full">{report.summary}</p>
                  ) : notification.linkedCrossover ? (
                    <div className="notif-response-details__grid">
                      <p><strong>Subject:</strong> {notification.linkedCrossover.subject}</p>
                      <p className="notif-response-details__full">{notification.linkedCrossover.message}</p>
                    </div>
                  ) : (
                    <p className="notif-response-details__full">{notification.body ?? notification.preview}</p>
                  )}
                </div>
              </section>

              <section className="notif-response-modal__section">
                <h3 className="notif-response-modal__section-title">Conversation</h3>
                {threadEntries.length === 0 ? (
                  <p className="notif-response-modal__empty-thread">No responses yet.</p>
                ) : (
                  <NotificationThread entries={threadEntries} />
                )}
              </section>

              {!canReply ? (
                <p className="notif-response-modal__no-reply">You can view this update, but replies are not available for your role.</p>
              ) : null}
            </>
          )}
        </div>

        {canReply && notification ? (
          <footer className="notif-response-modal__footer">
            <div className="notif-response-modal__composer">
              <label className="notif-hub-composer__label" htmlFor="notif-modal-reply">
                Write a response…
              </label>
              <textarea
                id="notif-modal-reply"
                className="notif-hub-composer__textarea"
                rows={3}
                placeholder="Write a response…"
                value={replyText}
                disabled={busy}
                onChange={(event) => onReplyTextChange(event.target.value)}
              />
              <div className="notif-hub-composer__quick">
                {QUICK_REPLIES.map((reply) => (
                  <button key={reply} type="button" className="notif-hub-composer__quick-btn" disabled={busy} onClick={() => onReplyTextChange(reply)}>
                    {reply}
                  </button>
                ))}
              </div>
              <div className="notif-hub-composer__actions">
                {canInternalNote && report ? (
                  <label className="notif-hub-composer__check">
                    <input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} />
                    Internal note only
                  </label>
                ) : null}
                {canManage && report && !internalNote ? (
                  <label className="notif-hub-composer__check">
                    <input type="checkbox" checked={markResolved} onChange={(event) => setMarkResolved(event.target.checked)} />
                    Mark as resolved
                  </label>
                ) : null}
              </div>
            </div>

            <div className="notif-response-modal__footer-actions">
              {report && canManage ? (
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
                  <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => onSupportAction("mark_reviewed")}>
                    Mark Resolved
                  </button>
                  <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => onStatusChange("In Review")}>
                    Mark In Review
                  </button>
                  {report.admin_status !== "Closed" ? (
                    <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => onSupportAction("close")}>
                      Close
                    </button>
                  ) : (
                    <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => onSupportAction("reopen")}>
                      Reopen
                    </button>
                  )}
                </>
              ) : null}
              {linkedTab && onOpenTab ? (
                <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => onOpenTab(linkedTab)}>
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                  Open Source Page
                </button>
              ) : null}
              <button
                type="button"
                className="crossover-btn crossover-btn--primary"
                disabled={busy || !replyText.trim()}
                onClick={() => onSendReply({ internalNote, markResolved })}
              >
                <Send className="mr-2 h-4 w-4" aria-hidden />
                Send Response
              </button>
            </div>
          </footer>
        ) : null}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
