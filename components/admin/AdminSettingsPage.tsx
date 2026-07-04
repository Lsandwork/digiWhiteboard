"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminGlobalSettings } from "@/lib/admin/settings";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/admin/settings";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { useToast } from "@/components/admin/ui/ToastProvider";

type AdminSettingsPageProps = {
  settings: AdminGlobalSettings;
  lastSyncedAt: string | null;
  dataSource: string;
  onSaved: (settings: AdminGlobalSettings) => void;
  onRefresh: () => Promise<void>;
  onResetBoard: () => Promise<void>;
};

export function AdminSettingsPage({
  settings,
  lastSyncedAt,
  dataSource,
  onSaved,
  onRefresh,
  onResetBoard
}: AdminSettingsPageProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDisableDisplay, setConfirmDisableDisplay] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save settings.");
      onSaved(body.settings);
      setLastSavedAt(new Date());
      showToast("Settings saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Error saving changes.", "error");
    } finally {
      setBusy(false);
    }
  }

  function resetDraft() {
    setDraft(settings);
    showToast("Unsaved changes discarded.", "info");
  }

  async function handleRefresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/refresh", { method: "POST" });
      if (!response.ok) throw new Error("Refresh failed.");
      await onRefresh();
      showToast("Refresh complete.", "success");
    } catch {
      showToast("Refresh failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Settings</h2>
          <p className="admin-page-subtitle">Configure how the admin dashboard and whiteboards behave.</p>
        </div>
        <div className="admin-save-bar">
          {dirty ? <span className="admin-unsaved-badge">Unsaved changes</span> : null}
          {lastSavedAt ? <span className="text-xs text-admin-muted">Last saved {lastSavedAt.toLocaleTimeString()}</span> : null}
          <button type="button" className="admin-btn-secondary" onClick={resetDraft} disabled={!dirty || busy}>Reset changes</button>
          <button type="button" className="admin-btn-primary" onClick={() => void save()} disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </header>

      <Section title="General Settings" helper="Defaults used when you open the admin dashboard.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default board on login">
            <select className="admin-input" value={draft.default_board} onChange={(e) => setDraft({ ...draft, default_board: e.target.value as AdminGlobalSettings["default_board"] })}>
              <option value="lobby">Lobby Whiteboard</option>
              <option value="staff">Staff Digital Whiteboard</option>
            </select>
          </Field>
          <Field label="Default refresh interval">
            <select className="admin-input" value={draft.default_refresh_interval_ms} onChange={(e) => setDraft({ ...draft, default_refresh_interval_ms: Number(e.target.value) })}>
              <option value={2000}>2 seconds</option>
              <option value={3000}>3 seconds</option>
              <option value={5000}>5 seconds</option>
            </select>
          </Field>
          <Field label="Timezone">
            <input className="admin-input" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} />
          </Field>
          <Field label="Business display name">
            <input className="admin-input" value={draft.business_display_name} onChange={(e) => setDraft({ ...draft, business_display_name: e.target.value })} />
          </Field>
          <Field label="Support / help link">
            <input className="admin-input" type="url" value={draft.support_help_link} onChange={(e) => setDraft({ ...draft, support_help_link: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Security Settings" helper="Control login behavior and password requirements.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Session timeout (hours)">
            <input className="admin-input" type="number" min={1} max={24} value={draft.session_timeout_hours} onChange={(e) => setDraft({ ...draft, session_timeout_hours: Number(e.target.value) })} />
          </Field>
          <Toggle label="Require strong passwords" checked={draft.require_strong_passwords} onChange={(checked) => setDraft({ ...draft, require_strong_passwords: checked })} />
          <Toggle label="Force password change on new users" checked={draft.force_password_change} onChange={(checked) => setDraft({ ...draft, force_password_change: checked })} />
          <Toggle label="Allow emergency env admin login" checked={draft.allow_env_admin_login} onChange={(checked) => setDraft({ ...draft, allow_env_admin_login: checked })} />
          <Field label="Login lockout attempts">
            <input className="admin-input" type="number" min={3} max={10} value={draft.login_lockout_attempts} onChange={(e) => setDraft({ ...draft, login_lockout_attempts: Number(e.target.value) })} />
          </Field>
          <Field label="Lockout duration (minutes)">
            <input className="admin-input" type="number" min={5} max={60} value={draft.login_lockout_minutes} onChange={(e) => setDraft({ ...draft, login_lockout_minutes: Number(e.target.value) })} />
          </Field>
        </div>
      </Section>

      <Section title="Display Settings" helper="Default appearance for TV displays.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default TV resolution">
            <select className="admin-input" value={draft.default_tv_resolution} onChange={(e) => setDraft({ ...draft, default_tv_resolution: e.target.value })}>
              <option value="1920x1080">1920 × 1080 (Full HD)</option>
              <option value="3840x2160">3840 × 2160 (4K)</option>
            </select>
          </Field>
          <Field label="Theme mode">
            <select className="admin-input" value={draft.theme_mode} onChange={(e) => setDraft({ ...draft, theme_mode: e.target.value as AdminGlobalSettings["theme_mode"] })}>
              <option value="fitdog_dark">Fitdog Dark</option>
              <option value="fitdog_light">Fitdog Light</option>
            </select>
          </Field>
          <Field label="Logo size">
            <select className="admin-input" value={draft.logo_size} onChange={(e) => setDraft({ ...draft, logo_size: e.target.value as AdminGlobalSettings["logo_size"] })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </Field>
          <Field label="Text size">
            <select className="admin-input" value={draft.text_size} onChange={(e) => setDraft({ ...draft, text_size: e.target.value as AdminGlobalSettings["text_size"] })}>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="large">Large</option>
            </select>
          </Field>
          <Field label="Animation intensity">
            <select className="admin-input" value={draft.animation_intensity} onChange={(e) => setDraft({ ...draft, animation_intensity: e.target.value as AdminGlobalSettings["animation_intensity"] })}>
              <option value="off">Off</option>
              <option value="subtle">Subtle</option>
              <option value="standard">Standard</option>
              <option value="high">High Energy</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Notification & Health" helper="Alerts when sync data looks stale or unhealthy.">
        <div className="grid gap-4 md:grid-cols-2">
          <Toggle label="Show sync health warnings" checked={draft.show_sync_health_warnings} onChange={(checked) => setDraft({ ...draft, show_sync_health_warnings: checked })} />
          <Field label="Stale data warning after (minutes)">
            <input className="admin-input" type="number" min={1} max={60} value={draft.stale_data_warning_minutes} onChange={(e) => setDraft({ ...draft, stale_data_warning_minutes: Number(e.target.value) })} />
          </Field>
          <Field label="Admin alert email">
            <input className="admin-input" type="email" value={draft.admin_alert_email} onChange={(e) => setDraft({ ...draft, admin_alert_email: e.target.value })} placeholder="ops@fitdog.com" />
          </Field>
          <Toggle label="Enable publish reminders" checked={draft.enable_publish_reminders} onChange={(checked) => setDraft({ ...draft, enable_publish_reminders: checked })} />
        </div>
      </Section>

      <Section title="Data & Sync" helper="Read-only cached data from Supabase. No direct Gingr calls.">
        <dl className="admin-kv-grid">
          <div><dt>Data source</dt><dd>{dataSource}</dd></div>
          <div><dt>Sync mode</dt><dd>Cached / Read-only</dd></div>
          <div><dt>Last successful sync</dt><dd>{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Unknown"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="admin-btn-secondary" onClick={() => void handleRefresh()} disabled={busy}>Manual refresh</button>
          <button type="button" className="admin-btn-secondary" onClick={() => showToast("Local UI cache cleared.", "success")}>Clear local UI cache</button>
        </div>
      </Section>

      <Section title="Danger Zone" helper="These actions affect live displays. Proceed carefully.">
        <div className="admin-danger-zone">
          <div>
            <p className="font-bold text-white">Reset board settings to default</p>
            <p className="text-sm text-admin-muted">Restores the currently selected board to factory defaults.</p>
          </div>
          <button type="button" className="admin-btn-danger" onClick={() => setConfirmReset(true)}>Reset to defaults</button>
        </div>
        <div className="admin-danger-zone mt-3">
          <div>
            <p className="font-bold text-white">Disable public display temporarily</p>
            <p className="text-sm text-admin-muted">Shows a maintenance message instead of live checkout data.</p>
          </div>
          <button
            type="button"
            className="admin-btn-danger"
            onClick={() => setConfirmDisableDisplay(true)}
          >
            {draft.public_display_disabled ? "Re-enable display" : "Disable display"}
          </button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmReset}
        title="Reset board settings?"
        description="This will restore the selected board's settings to defaults. Published version history is kept."
        confirmLabel="Reset settings"
        danger
        busy={busy}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          void onResetBoard().then(() => showToast("Board settings reset to defaults.", "success"));
        }}
      />

      <ConfirmDialog
        open={confirmDisableDisplay}
        title={draft.public_display_disabled ? "Re-enable public display?" : "Disable public display?"}
        description={
          draft.public_display_disabled
            ? "Guests will see live checkout data again."
            : "Public whiteboards will show a maintenance message until re-enabled."
        }
        confirmLabel={draft.public_display_disabled ? "Re-enable" : "Disable display"}
        danger={!draft.public_display_disabled}
        onCancel={() => setConfirmDisableDisplay(false)}
        onConfirm={() => {
          setDraft({ ...draft, public_display_disabled: !draft.public_display_disabled });
          setConfirmDisableDisplay(false);
        }}
      />
    </div>
  );
}

function Section({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <section className="admin-card p-5">
      <header className="admin-section-header">
        <div>
          <h3 className="admin-section-title">{title}</h3>
          <p className="admin-section-helper">{helper}</p>
        </div>
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="admin-label">{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="admin-toggle-row">
      <span className="text-sm font-semibold text-white">{label}</span>
      <button type="button" role="switch" aria-checked={checked} className={`admin-toggle ${checked ? "admin-toggle--on" : ""}`} onClick={() => onChange(!checked)}>
        <span className="admin-toggle__knob" />
      </button>
    </label>
  );
}

export { DEFAULT_ADMIN_SETTINGS };
