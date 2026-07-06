"use client";

import type { EnrichedNotification } from "@/lib/staff/notification-hub";
import { NotificationListItem } from "@/components/admin/notifications/NotificationListItem";

type NotificationListProps = {
  items: EnrichedNotification[];
  selectedId: string | null;
  onSelect: (notification: EnrichedNotification) => void;
};

export function NotificationList({ items, selectedId, onSelect }: NotificationListProps) {
  if (items.length === 0) {
    return (
      <div className="notif-hub-list__empty">
        <p className="notif-hub-list__empty-title">No notifications yet.</p>
        <p className="notif-hub-list__empty-text">New crossover, support, and assignment activity will appear here.</p>
      </div>
    );
  }

  return (
    <div className="notif-hub-list">
      {items.map((notification) => (
        <NotificationListItem
          key={notification.id}
          notification={notification}
          selected={notification.id === selectedId}
          onSelect={() => onSelect(notification)}
        />
      ))}
    </div>
  );
}
