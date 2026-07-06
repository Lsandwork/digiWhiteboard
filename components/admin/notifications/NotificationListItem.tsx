"use client";

import {
  AlertTriangle,
  Bell,
  ClipboardList,
  MessageSquare,
  MessageSquareReply,
  ShieldAlert,
  UserRound
} from "lucide-react";
import type { EnrichedNotification } from "@/lib/staff/notification-hub";
import { NotificationStatusBadge } from "@/components/admin/notifications/NotificationStatusBadge";
import { NotificationTypeBadge } from "@/components/admin/notifications/NotificationTypeBadge";

function TypeIcon({ notification }: { notification: EnrichedNotification }) {
  const className = "notif-hub-item__icon";
  switch (notification.displayType) {
    case "complaint":
    case "owner_alert":
      return <ShieldAlert className={className} aria-hidden />;
    case "request":
      return <ClipboardList className={className} aria-hidden />;
    case "response":
    case "mention":
      return <MessageSquareReply className={className} aria-hidden />;
    case "write_up":
    case "write_up_review":
      return <AlertTriangle className={className} aria-hidden />;
    case "follow_up":
      return <UserRound className={className} aria-hidden />;
    default:
      return <Bell className={className} aria-hidden />;
  }
}

function priorityClass(priority: string) {
  if (priority === "Critical" || priority === "Urgent" || priority === "High") return "notif-hub-priority--high";
  if (priority === "Medium") return "notif-hub-priority--medium";
  return "";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type NotificationListItemProps = {
  notification: EnrichedNotification;
  selected: boolean;
  onSelect: () => void;
};

export function NotificationListItem({ notification, selected, onSelect }: NotificationListItemProps) {
  const related =
    notification.linkedReport?.related_dog_name ||
    notification.linkedReport?.related_owner_name ||
    notification.linkedCrossover?.related_dog_name ||
    notification.linkedFollowUp?.dog_name;

  return (
    <button
      type="button"
      className={`notif-hub-item ${notification.isUnread ? "notif-hub-item--unread" : ""} ${selected ? "notif-hub-item--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="notif-hub-item__icon-wrap">
        <TypeIcon notification={notification} />
        {notification.isUnread ? <span className="notif-hub-item__dot" aria-label="Unread" /> : null}
      </div>
      <div className="notif-hub-item__body">
        <div className="notif-hub-item__meta">
          <NotificationTypeBadge type={notification.displayType} />
          <NotificationStatusBadge status={notification.displayStatus} />
          {(notification.priority === "High" || notification.priority === "Urgent" || notification.priority === "Critical") && (
            <span className={`notif-hub-priority ${priorityClass(notification.priority)}`}>{notification.priority}</span>
          )}
        </div>
        <p className="notif-hub-item__title">{notification.title}</p>
        {notification.preview ? <p className="notif-hub-item__preview">{notification.preview}</p> : null}
        <div className="notif-hub-item__footer">
          <span>{notification.created_by ? `from ${notification.created_by}` : "System"}</span>
          {related ? <span>• {related}</span> : null}
          <span>• {formatTime(notification.created_at)}</span>
        </div>
      </div>
      {notification.needsReply ? (
        <span className="notif-hub-item__reply-flag">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}
