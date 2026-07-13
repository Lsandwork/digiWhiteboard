"use client";

import { marketingStatusDisplay } from "@/lib/marketing/status";

export function MarketingStatusBadge({ status }: { status: string }) {
  const display = marketingStatusDisplay(status);
  return (
    <span className="marketing-status-badge" style={{ color: display.color, background: display.bg }}>
      {display.label}
    </span>
  );
}
