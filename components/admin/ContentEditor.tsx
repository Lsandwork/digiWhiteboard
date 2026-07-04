"use client";

import type { AdminBoardType } from "@/lib/admin/types";
import type { LobbySettings } from "@/lib/lobby/types";
import type { StaffBoardSettings } from "@/lib/admin/types";

type ContentEditorProps = {
  board: AdminBoardType;
  lobbySettings: LobbySettings;
  staffSettings: StaffBoardSettings;
  onSaveLobby: (patch: Partial<LobbySettings>) => void;
  onSaveStaff: (patch: Partial<StaffBoardSettings>) => void;
};

export function ContentEditor({ board, lobbySettings, staffSettings, onSaveLobby, onSaveStaff }: ContentEditorProps) {
  if (board === "staff") {
    return (
      <section className="admin-card p-5">
        <header className="admin-section-header">
          <div>
            <h2 className="admin-section-title">Staff Board Content</h2>
            <p className="admin-section-helper">Messages shown on the staff digital whiteboard.</p>
          </div>
        </header>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextArea
            label="Team Reminder"
            helper="Short reminder for staff at the top of the board."
            value={staffSettings.team_reminder ?? ""}
            max={120}
            onChange={(value) => onSaveStaff({ team_reminder: value })}
          />
          <TextArea
            label="Important Notice"
            helper="Highlighted notice for front desk staff."
            value={staffSettings.important_notice ?? ""}
            max={120}
            onChange={(value) => onSaveStaff({ important_notice: value })}
          />
          <TextArea
            label="Footer Message"
            helper="Optional footer text on the staff board."
            value={staffSettings.footer_message ?? ""}
            max={100}
            onChange={(value) => onSaveStaff({ footer_message: value })}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="admin-card p-5">
      <header className="admin-section-header">
        <div>
          <h2 className="admin-section-title">Lobby Content</h2>
          <p className="admin-section-helper">Edit the messages guests see on the lobby checkout whiteboard.</p>
        </div>
      </header>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TextArea
          label="Lobby Message"
          helper="Main welcome message shown when the queue is idle."
          value={lobbySettings.lobby_message ?? ""}
          max={100}
          onChange={(value) => onSaveLobby({ lobby_message: value })}
        />
        <TextArea
          label="Footer Message"
          helper="Friendly closing message at the bottom of the screen."
          value={lobbySettings.footer_message ?? ""}
          max={100}
          onChange={(value) => onSaveLobby({ footer_message: value })}
        />
        <TextArea
          label="Empty Queue Message"
          helper="Shown when no dogs are currently checking out."
          value={lobbySettings.lobby_message ?? ""}
          max={100}
          onChange={(value) => onSaveLobby({ lobby_message: value })}
        />
        <TextArea
          label="Announcement Banner"
          helper="Optional short announcement (uses lobby message for now)."
          value={lobbySettings.lobby_message ?? ""}
          max={80}
          onChange={(value) => onSaveLobby({ lobby_message: value })}
        />
      </div>
    </section>
  );
}

function TextArea({
  label,
  helper,
  value,
  max,
  onChange
}: {
  label: string;
  helper: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="admin-label">{label}</span>
      <p className="admin-field-helper">{helper}</p>
      <textarea className="admin-input mt-2 min-h-28 resize-y" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-right text-xs text-admin-muted">{value.length}/{max}</p>
    </label>
  );
}
