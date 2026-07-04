"use client";

import type { AdminBoardType } from "@/lib/admin/types";
import type { LobbyPromotion, LobbySettings } from "@/lib/lobby/types";
import type { StaffBoardSettings } from "@/lib/admin/types";
import type { LiveDog } from "@/lib/types";
import { Modal } from "@/components/admin/ui/Modal";
import { LivePreviewPanel } from "@/components/admin/LivePreviewPanel";

type PreviewModalProps = {
  open: boolean;
  board: AdminBoardType;
  lobbySettings: LobbySettings;
  staffSettings: StaffBoardSettings;
  promotions: LobbyPromotion[];
  staffDogs: LiveDog[];
  activeCheckouts: number;
  onClose: () => void;
  onOpenLive: () => void;
};

export function PreviewModal(props: PreviewModalProps) {
  const { open, board, onClose, onOpenLive, ...previewProps } = props;

  return (
    <Modal
      open={open}
      title="Live Preview"
      description="Preview how your board looks before publishing."
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="admin-btn-primary" onClick={onOpenLive}>
            Open {board === "staff" ? "Staff Whiteboard" : "Lobby Whiteboard"}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="admin-label mb-2">Desktop / TV</p>
          <LivePreviewPanel board={board} {...previewProps} />
        </div>
        <div>
          <p className="admin-label mb-2">Mobile</p>
          <div className="admin-preview-mobile">
            <LivePreviewPanel board={board} {...previewProps} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
