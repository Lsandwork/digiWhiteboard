"use client";

import type { ReactNode } from "react";

type NotificationsPageLayoutProps = {
  header: ReactNode;
  sidebar: ReactNode;
  toolbar: ReactNode;
  list: ReactNode;
};

export function NotificationsPageLayout({ header, sidebar, toolbar, list }: NotificationsPageLayoutProps) {
  return (
    <div className="notif-hub notif-hub--list-only">
      {header}
      <div className="notif-hub__body">
        {sidebar}
        <div className="notif-hub__right">
          {toolbar}
          <section className="notif-hub__list-panel notif-hub__list-panel--full">{list}</section>
        </div>
      </div>
    </div>
  );
}
