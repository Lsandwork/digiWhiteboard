"use client";

import { Upload } from "lucide-react";
import type { AdminBoardType } from "@/lib/admin/types";

type PublishPanelProps = {
  board: AdminBoardType;
  version: string;
  publishedAt: string | null;
  publishedBy: string | null;
  onPublish: () => void;
  busy?: boolean;
};

export function PublishPanel({ board, version, publishedAt, publishedBy, onPublish, busy }: PublishPanelProps) {
  return (
    <section className="admin-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-black text-white">Publish & Version</h2>
        <span className="admin-badge admin-badge--green">Published</span>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-admin-muted">Version</dt><dd className="font-semibold text-white">{version}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-admin-muted">Published</dt><dd className="text-white">{publishedAt ? new Date(publishedAt).toLocaleString() : "Not yet"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-admin-muted">Published by</dt><dd className="text-white">{publishedBy ?? "—"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-admin-muted">Board</dt><dd className="text-white">{board === "lobby" ? "Lobby Whiteboard" : "Staff Digital Whiteboard"}</dd></div>
      </dl>
      <button type="button" className="admin-btn-primary mt-4 inline-flex w-full items-center justify-center gap-2" onClick={onPublish} disabled={busy}>
        <Upload className="h-4 w-4" /> Publish Changes
      </button>
      <button type="button" className="admin-btn-ghost mt-2 w-full">View Change History</button>
    </section>
  );
}
