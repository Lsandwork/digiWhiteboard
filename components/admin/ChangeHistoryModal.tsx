"use client";

import { useEffect, useState } from "react";
import type { AdminBoardType, PublishLogEntry } from "@/lib/admin/types";
import { Modal } from "@/components/admin/ui/Modal";
import { AdminTable } from "@/components/admin/ui/AdminTable";

type ChangeHistoryModalProps = {
  open: boolean;
  board: AdminBoardType;
  onClose: () => void;
};

export function ChangeHistoryModal({ open, board, onClose }: ChangeHistoryModalProps) {
  const [history, setHistory] = useState<PublishLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/admin/publish-history?board=${board}&limit=20`, { cache: "no-store" })
        .then((response) => response.json())
        .then((body) => setHistory(body.history ?? []))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, board]);

  return (
    <Modal open={open} title="Change History" description="Published versions and who published them." onClose={onClose} size="lg">
      <AdminTable
        loading={loading}
        rows={history}
        rowKey={(row) => row.id}
        emptyTitle="No publish history yet"
        emptyDescription="Publish changes to create your first version entry."
        columns={[
          { key: "version", header: "Version", render: (row) => <span className="font-bold text-white">{row.version}</span> },
          { key: "board", header: "Board", render: (row) => row.board_type === "lobby" ? "Lobby" : "Staff" },
          { key: "by", header: "Published by", render: (row) => row.published_by ?? "—" },
          { key: "at", header: "Date", render: (row) => new Date(row.published_at).toLocaleString() }
        ]}
      />
    </Modal>
  );
}
