"use client";

import type { AdminBoardType } from "@/lib/admin/types";
import type { LobbySettings } from "@/lib/lobby/types";
import type { StaffBoardSettings } from "@/lib/admin/types";

type BoardSettingsProps = {
  board: AdminBoardType;
  lobbySettings: LobbySettings;
  staffSettings: StaffBoardSettings;
  onSaveLobby: (patch: Partial<LobbySettings> & { show_class_schedule?: boolean }) => void;
  onSaveStaff: (patch: Partial<StaffBoardSettings>) => void;
  onReset: () => void;
};

const refreshOptions = [
  { label: "2 seconds", value: 2000 },
  { label: "3 seconds", value: 3000 },
  { label: "5 seconds", value: 5000 }
];

export function BoardSettings({ board, lobbySettings, staffSettings, onSaveLobby, onSaveStaff, onReset }: BoardSettingsProps) {
  if (board === "staff") {
    return (
      <section className="admin-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Staff Board Settings</h2>
          <button type="button" className="admin-btn-ghost" onClick={onReset}>Reset to defaults</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Refresh Interval">
            <select className="admin-input" value={staffSettings.refresh_interval_ms} onChange={(e) => onSaveStaff({ refresh_interval_ms: Number(e.target.value) })}>
              {refreshOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Toggle label="Show Team Reminders" checked={staffSettings.show_team_reminders} onChange={(checked) => onSaveStaff({ show_team_reminders: checked })} />
          <TextArea label="Team Reminder" value={staffSettings.team_reminder ?? ""} max={120} onChange={(value) => onSaveStaff({ team_reminder: value })} />
          <TextArea label="Important Notice" value={staffSettings.important_notice ?? ""} max={120} onChange={(value) => onSaveStaff({ important_notice: value })} />
        </div>
      </section>
    );
  }

  return (
    <section className="admin-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black text-white">Board Settings</h2>
        <button type="button" className="admin-btn-ghost" onClick={onReset}>Reset to defaults</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Max Queue Count">
          <div className="flex items-center gap-2">
            <button type="button" className="admin-stepper" onClick={() => onSaveLobby({ max_queue_count: Math.max(3, lobbySettings.max_queue_count - 1) })} aria-label="Decrease">−</button>
            <span className="min-w-8 text-center text-lg font-bold">{lobbySettings.max_queue_count}</span>
            <button type="button" className="admin-stepper" onClick={() => onSaveLobby({ max_queue_count: Math.min(8, lobbySettings.max_queue_count + 1) })} aria-label="Increase">+</button>
          </div>
        </Field>
        <Field label="Refresh Interval">
          <select className="admin-input" value={lobbySettings.refresh_interval_ms} onChange={(e) => onSaveLobby({ refresh_interval_ms: Number(e.target.value) })}>
            {refreshOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Toggle label="Show Promotions" checked={lobbySettings.show_promotions} onChange={(checked) => onSaveLobby({ show_promotions: checked })} />
        <Toggle label="Show Class Schedule" checked={lobbySettings.show_events} onChange={(checked) => onSaveLobby({ show_events: checked, show_class_schedule: checked })} />
        <TextArea label="Lobby Message" value={lobbySettings.lobby_message ?? ""} max={100} onChange={(value) => onSaveLobby({ lobby_message: value })} />
        <TextArea label="Footer Message" value={lobbySettings.footer_message ?? ""} max={100} onChange={(value) => onSaveLobby({ footer_message: value })} />
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="admin-label">{label}</span>{children}</label>;
}

function TextArea({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <textarea className="admin-input min-h-24 resize-y" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-right text-xs text-admin-muted">{value.length}/{max}</p>
    </Field>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-admin-border px-4 py-3">
      <span className="text-sm font-semibold text-white">{label}</span>
      <button type="button" role="switch" aria-checked={checked} className={`admin-toggle ${checked ? "admin-toggle--on" : ""}`} onClick={() => onChange(!checked)}>
        <span className="admin-toggle__knob" />
      </button>
    </label>
  );
}
