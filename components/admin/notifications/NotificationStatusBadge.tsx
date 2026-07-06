import type { NotificationDisplayStatus } from "@/lib/staff/notification-hub";

function statusClass(status: NotificationDisplayStatus) {
  switch (status) {
    case "Open":
      return "notif-hub-status--open";
    case "In Review":
      return "notif-hub-status--review";
    case "Waiting on Response":
      return "notif-hub-status--waiting";
    case "Responded":
      return "notif-hub-status--responded";
    case "Resolved":
      return "notif-hub-status--resolved";
    case "Closed":
      return "notif-hub-status--closed";
    default:
      return "notif-hub-status--open";
  }
}

export function NotificationStatusBadge({ status }: { status: NotificationDisplayStatus }) {
  return <span className={`notif-hub-status ${statusClass(status)}`}>{status}</span>;
}
