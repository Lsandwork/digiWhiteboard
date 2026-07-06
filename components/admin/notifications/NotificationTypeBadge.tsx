import { displayTypeLabel, type NotificationDisplayType } from "@/lib/staff/notification-hub";

function typeClass(type: NotificationDisplayType) {
  switch (type) {
    case "request":
      return "notif-hub-type--request";
    case "complaint":
    case "owner_alert":
      return "notif-hub-type--complaint";
    case "response":
      return "notif-hub-type--response";
    case "write_up":
    case "write_up_review":
      return "notif-hub-type--writeup";
    case "follow_up":
      return "notif-hub-type--followup";
    case "mention":
      return "notif-hub-type--mention";
    default:
      return "notif-hub-type--general";
  }
}

export function NotificationTypeBadge({ type }: { type: NotificationDisplayType }) {
  return <span className={`notif-hub-type ${typeClass(type)}`}>{displayTypeLabel(type)}</span>;
}
