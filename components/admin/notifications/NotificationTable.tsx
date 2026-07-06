"use client";

import { ExternalLink } from "lucide-react";
import type { EnrichedNotification } from "@/lib/staff/notification-hub";
import { NotificationStatusBadge } from "@/components/admin/notifications/NotificationStatusBadge";
import { NotificationTypeBadge } from "@/components/admin/notifications/NotificationTypeBadge";

type NotificationTableProps = {
  items: EnrichedNotification[];
  onOpen: (notification: EnrichedNotification) => void;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function relatedLabel(notification: EnrichedNotification) {
  return (
    notification.linkedReport?.related_dog_name ||
    notification.linkedReport?.related_owner_name ||
    notification.linkedCrossover?.related_dog_name ||
    notification.linkedFollowUp?.dog_name ||
    "—"
  );
}

export function NotificationTable({ items, onOpen }: NotificationTableProps) {
  if (items.length === 0) {
    return (
      <div className="notif-hub-list__empty">
        <p className="notif-hub-list__empty-title">No notifications yet.</p>
        <p className="notif-hub-list__empty-text">Select a notification to view details and respond.</p>
      </div>
    );
  }

  return (
    <div className="notif-response-list-wrap">
      <table className="notif-response-list">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Title</th>
            <th scope="col">From</th>
            <th scope="col">Related To</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Last Update</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((notification) => (
            <tr
              key={notification.id}
              className={`notif-response-list__row ${notification.isUnread ? "notif-response-list__row--unread" : ""}`}
              onClick={() => onOpen(notification)}
            >
              <td data-label="Type">
                <NotificationTypeBadge type={notification.displayType} />
              </td>
              <td data-label="Title" className="notif-response-list__title">
                {notification.isUnread ? <span className="notif-hub-item__dot notif-response-list__dot" aria-label="Unread" /> : null}
                <span>{notification.title}</span>
                {notification.preview ? <span className="notif-response-list__preview">{notification.preview}</span> : null}
              </td>
              <td data-label="From">{notification.created_by ?? "System"}</td>
              <td data-label="Related To">{relatedLabel(notification)}</td>
              <td data-label="Status">
                <NotificationStatusBadge status={notification.displayStatus} />
              </td>
              <td data-label="Priority">{notification.priority}</td>
              <td data-label="Last Update">{formatTime(notification.created_at)}</td>
              <td data-label="Action">
                <button
                  type="button"
                  className="crossover-btn crossover-btn--primary notif-response-list__open"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(notification);
                  }}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
