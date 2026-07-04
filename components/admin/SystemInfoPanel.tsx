"use client";

import type { AdminBoardType } from "@/lib/admin/types";

type SystemInfoPanelProps = {
  board: AdminBoardType;
  dataSource: string;
};

export function SystemInfoPanel({ board, dataSource }: SystemInfoPanelProps) {
  return (
    <section className="admin-card p-4">
      <h2 className="mb-3 font-black text-white">System Info</h2>
      <dl className="space-y-2 text-sm">
        <Row label="Board ID" value={board === "lobby" ? "board_lobby_01" : "board_staff_01"} />
        <Row label="Selected board" value={board === "lobby" ? "Lobby Whiteboard" : "Staff Digital Whiteboard"} />
        <Row label="Content Source" value={dataSource} />
        <Row label="Timezone" value="America/Los_Angeles" />
        <Row label="Sync mode" value="Supabase cached / read-only" />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-admin-border/60 pb-2 last:border-0">
      <dt className="text-admin-muted">{label}</dt>
      <dd className="text-right font-medium text-white">{value}</dd>
    </div>
  );
}
