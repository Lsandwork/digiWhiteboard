"use client";

import { useState } from "react";
import { FEEDBACK_STATUS_LABELS } from "@/lib/team-engagement/constants";

type ActionHandler = (action: string, payload: Record<string, unknown>) => Promise<void>;

function ListSection({
  title,
  empty,
  children
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">{title}</h3>
      {empty ? <p className="ro-te-muted">{empty}</p> : null}
      {children}
    </section>
  );
}

export function AnalyticsAdminBody({ data }: { data: Record<string, unknown> }) {
  const totals = data.totals as Record<string, number> | undefined;
  const participation = data.participation as { authors?: number; recipients?: number; team?: number } | undefined;
  const range = data.range as { from?: string; to?: string } | undefined;
  if (!totals) {
    return <p className="ro-te-muted">Choose a date range to load engagement analytics.</p>;
  }
  return (
    <div className="ro-te-stack">
      <p className="ro-te-muted">
        {range?.from && range?.to ? `${range.from} → ${range.to}` : "Selected period"} · Participation is not a performance ranking.
      </p>
      <div className="ro-te-stat-grid">
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Published Bark Outs</div>
          <div className="ro-te-stat__value">{totals.published ?? 0}</div>
        </div>
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Cross-department</div>
          <div className="ro-te-stat__value">{totals.crossDepartment ?? 0}</div>
        </div>
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Authors</div>
          <div className="ro-te-stat__value">{participation?.authors ?? 0}</div>
        </div>
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Recipients</div>
          <div className="ro-te-stat__value">{participation?.recipients ?? 0}</div>
        </div>
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Feedback items</div>
          <div className="ro-te-stat__value">{totals.feedbackSubmitted ?? 0}</div>
        </div>
      </div>
    </div>
  );
}

export function FeedbackAdminBody({ data }: { data: Record<string, unknown> }) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  return (
    <ListSection title="Team feedback & suggestions" empty={items.length ? undefined : "No feedback in your scope yet."}>
      <ul className="ro-te-list">
        {items.map((row) => (
          <li key={String(row.id)} className="ro-te-list__item">
            <strong>{String(row.subject ?? "Suggestion")}</strong>
            <span className="ro-te-muted">
              {" "}
              · {FEEDBACK_STATUS_LABELS[row.status as keyof typeof FEEDBACK_STATUS_LABELS] ?? row.status} · {String(row.submitterName ?? "")}
            </span>
            <p>{String(row.message ?? row.body ?? "")}</p>
          </li>
        ))}
      </ul>
    </ListSection>
  );
}

export function AnnouncementsAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction: ActionHandler;
  onRefresh: () => void;
}) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="ro-te-stack">
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Post announcement</h3>
        <label className="ro-te-field">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="ro-te-field">
          Message
          <textarea value={body} rows={4} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button
          type="button"
          className="ro-te-btn ro-te-btn--primary"
          onClick={() => void onAction("create_announcement", { title, body }).then(onRefresh)}
        >
          Publish
        </button>
      </section>
      <ListSection title="Recent announcements" empty={items.length ? undefined : "No announcements yet."}>
        <ul className="ro-te-list">
          {items.map((row) => (
            <li key={String(row.id)} className="ro-te-list__item">
              <strong>{String(row.title)}</strong>
              <p>{String(row.body)}</p>
            </li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function ProgramsAdminBody({ data }: { data: Record<string, unknown> }) {
  const programs = (data.programs as Array<Record<string, unknown>>) ?? (data.items as Array<Record<string, unknown>>) ?? [];
  const nominations = (data.nominations as Array<Record<string, unknown>>) ?? [];
  return (
    <div className="ro-te-stack">
      <ListSection title="Recognition programs" empty={programs.length ? undefined : "No programs configured."}>
        <ul className="ro-te-list">
          {programs.map((row) => (
            <li key={String(row.id)} className="ro-te-list__item">
              <strong>{String(row.title ?? row.name)}</strong>
              <span className="ro-te-muted"> · {String(row.status ?? "")}</span>
            </li>
          ))}
        </ul>
      </ListSection>
      <ListSection title="Open nominations" empty={nominations.length ? undefined : "No open nominations."}>
        <ul className="ro-te-list">
          {nominations.map((row) => (
            <li key={String(row.id)} className="ro-te-list__item">
              <strong>{String(row.nomineeName ?? row.nominee_name)}</strong>
              <span className="ro-te-muted"> · {String(row.programTitle ?? "")}</span>
            </li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function DevelopmentAdminBody({ data }: { data: Record<string, unknown> }) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  return (
    <ListSection title="Employee development" empty={items.length ? undefined : "No development records in this view."}>
      <ul className="ro-te-list">
        {items.map((row) => (
          <li key={String(row.id)} className="ro-te-list__item">
            <strong>{String(row.employeeName ?? row.employee_name)}</strong>
            <span className="ro-te-muted">
              {" "}
              · {String(row.recordType ?? row.record_type)} · {String(row.status)}
            </span>
            <p>{String(row.title ?? row.summary ?? "")}</p>
          </li>
        ))}
      </ul>
    </ListSection>
  );
}

export function WorkloadAdminBody({ data }: { data: Record<string, unknown> }) {
  if (data.available === false) {
    return (
      <p className="ro-te-muted">{String(data.note ?? data.missing ?? "Workload data is not available right now.")}</p>
    );
  }
  const people = (data.people as Array<Record<string, unknown>>) ?? [];
  const summary = (data.summary as Array<Record<string, unknown>>) ?? [];
  return (
    <div className="ro-te-stack">
      <p className="ro-te-callout">{String(data.note ?? "Open assignments are a snapshot, not a performance score.")}</p>
      {summary.length ? (
        <div className="ro-te-stat-grid">
          {summary.map((row, index) => (
            <div key={index} className="ro-te-card ro-te-stat">
              <div className="ro-te-muted">{String(row.label ?? row.key)}</div>
              <div className="ro-te-stat__value">{String(row.open ?? row.count ?? "—")}</div>
            </div>
          ))}
        </div>
      ) : null}
      <ListSection title="By teammate" empty={people.length ? undefined : "No workload rows for this filter."}>
        <ul className="ro-te-list">
          {people.map((row, index) => (
            <li key={String(row.userId ?? index)} className="ro-te-list__item">
              <strong>{String(row.name)}</strong>
              <span className="ro-te-muted"> · open {String(row.open ?? 0)}</span>
            </li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function DepartmentsAdminBody({ data }: { data: Record<string, unknown> }) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  return (
    <ListSection title="Departments" empty={items.length ? undefined : "No departments in scope."}>
      <ul className="ro-te-list">
        {items.map((row) => (
          <li key={String(row.key)} className="ro-te-list__item">
            <strong>{String(row.label)}</strong>
            <span className="ro-te-muted"> · {String(row.headcount ?? row.memberCount ?? "—")} members</span>
            {Array.isArray(row.managers) && row.managers.length ? (
              <p className="ro-te-muted">Managers: {(row.managers as string[]).join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </ListSection>
  );
}

export function SettingsAdminBody({ data }: { data: Record<string, unknown> }) {
  const categories = (data.categories as Array<{ key: string; label: string; active: boolean }>) ?? [];
  const participation = data.participation as Record<string, unknown> | undefined;
  const features = data.features as Record<string, boolean> | undefined;
  return (
    <div className="ro-te-stack">
      <ListSection title="Bark Out categories">
        <ul className="ro-te-list">
          {categories.map((cat) => (
            <li key={cat.key}>
              {cat.label}
              {!cat.active ? <span className="ro-te-muted"> (inactive)</span> : null}
            </li>
          ))}
        </ul>
      </ListSection>
      {participation ? (
        <section className="ro-te-card ro-te-section">
          <h3 className="ro-te-section__title">Participation limits</h3>
          <ul className="ro-te-list">
            <li>Daily limit: {String(participation.dailyLimit)}</li>
            <li>Per-recipient weekly: {String(participation.perRecipientWeeklyLimit)}</li>
            <li>Minimum message length: {String(participation.minMessageLength)}</li>
          </ul>
        </section>
      ) : null}
      {features ? (
        <section className="ro-te-card ro-te-section">
          <h3 className="ro-te-section__title">Feature toggles</h3>
          <ul className="ro-te-list">
            {Object.entries(features).map(([key, enabled]) => (
              <li key={key}>
                {key.replace(/_/g, " ")}: {enabled ? "On" : "Off"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function ReportsAdminBody({ data }: { data: Record<string, unknown> }) {
  const exports = (data.exports as Array<{ key: string; label: string; description: string; allowed: boolean }>) ?? [];
  return (
    <ListSection title="Exports" empty={exports.length ? undefined : "No exports available."}>
      <ul className="ro-te-list">
        {exports.map((row) => (
          <li key={row.key} className="ro-te-list__item">
            <strong>{row.label}</strong>
            <p className="ro-te-muted">{row.description}</p>
            {row.allowed ? (
              <a className="ro-te-btn ro-te-btn--ghost" href={`/api/admin/team-engagement/export?type=${encodeURIComponent(row.key)}`}>
                Download CSV
              </a>
            ) : (
              <span className="ro-te-muted">You do not have permission for this export.</span>
            )}
          </li>
        ))}
      </ul>
    </ListSection>
  );
}

export function SecurityAdminBody({ data }: { data: Record<string, unknown> }) {
  const engagementEvents = (data.engagementEvents as Array<Record<string, unknown>>) ?? [];
  const safeguards = (data.safeguards as string[]) ?? [];
  return (
    <div className="ro-te-stack">
      <ListSection title="Safeguards">
        <ul className="ro-te-list">
          {safeguards.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ListSection>
      <ListSection title="Recent security & access events" empty={engagementEvents.length ? undefined : "No recent events."}>
        <ul className="ro-te-list">
          {engagementEvents.map((row) => (
            <li key={String(row.id)} className="ro-te-list__item">
              <span className="ro-te-muted">{row.at ? new Date(String(row.at)).toLocaleString() : ""}</span>
              <strong> {String(row.action)}</strong> — {String(row.actorName)} → {String(row.targetLabel ?? "")}
            </li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function IntegrationsAdminBody({ data }: { data: Record<string, unknown> }) {
  const items = (data.items as Array<{ key: string; label: string; status: string; detail: string }>) ?? [];
  return (
    <ListSection title="Integrations">
      <ul className="ro-te-list">
        {items.map((row) => (
          <li key={row.key} className="ro-te-list__item">
            <strong>{row.label}</strong>
            <span className="ro-te-pill"> {row.status.replace(/_/g, " ")}</span>
            <p className="ro-te-muted">{row.detail}</p>
          </li>
        ))}
      </ul>
    </ListSection>
  );
}

export function SystemHealthAdminBody({ data }: { data: Record<string, unknown> }) {
  const tables = (data.tables as Array<{ table: string; ready: boolean }>) ?? [];
  const moderation = data.moderation as Record<string, number> | null;
  const readyCount = tables.filter((row) => row.ready).length;
  return (
    <div className="ro-te-stack">
      <p className="ro-te-muted">
        Checked {data.checkedAt ? new Date(String(data.checkedAt)).toLocaleString() : "recently"} · {readyCount}/{tables.length} tables responding
      </p>
      {moderation ? (
        <div className="ro-te-stat-grid">
          <div className="ro-te-card ro-te-stat">
            <div className="ro-te-muted">Pending moderation</div>
            <div className="ro-te-stat__value">{moderation.pending ?? 0}</div>
          </div>
          <div className="ro-te-card ro-te-stat">
            <div className="ro-te-muted">Open reports</div>
            <div className="ro-te-stat__value">{moderation.openReports ?? 0}</div>
          </div>
        </div>
      ) : null}
      <details>
        <summary className="ro-te-muted">Table readiness</summary>
        <ul className="ro-te-list" style={{ fontSize: 13 }}>
          {tables.map((row) => (
            <li key={row.table}>
              {row.ready ? "✓" : "○"} {row.table}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function AccessAdminBody({ data }: { data: Record<string, unknown> }) {
  const rules = (data.rules as string[]) ?? [];
  const groups = ["superAdmins", "admins", "management"] as const;
  return (
    <div className="ro-te-stack">
      {groups.map((key) => {
        const people = (data[key] as Array<{ name: string; roleLabel: string }>) ?? [];
        return (
          <ListSection key={key} title={key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} empty={people.length ? undefined : "None"}>
            <ul className="ro-te-list">
              {people.map((person) => (
                <li key={person.name}>
                  {person.name} <span className="ro-te-muted">· {person.roleLabel}</span>
                </li>
              ))}
            </ul>
          </ListSection>
        );
      })}
      <ListSection title="Rules">
        <ul className="ro-te-list">
          {rules.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function PermissionsAdminBody({ data }: { data: Record<string, unknown> }) {
  const notes = (data.notes as string[]) ?? [];
  return (
    <div className="ro-te-stack">
      <ListSection title="Role permissions">
        <p className="ro-te-muted">Use RuffOps User Management for detailed matrix edits. This view summarizes Team Engagement permissions by role.</p>
        <ul className="ro-te-list">
          {notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function AiPolicyAdminBody({ data }: { data: Record<string, unknown> }) {
  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">AI moderation policy</h3>
      <p className="ro-te-muted">
        Gemini is {data.configured ? "configured" : "not configured"}. Bark Outs that automated rules cannot clear still route to human moderators.
      </p>
    </section>
  );
}

export function RetentionAdminBody({ data }: { data: Record<string, unknown> }) {
  const preview = data.preview as Record<string, number> | undefined;
  return (
    <div className="ro-te-stack">
      <p className="ro-te-callout">{String(data.schedule ?? "")}</p>
      {preview ? (
        <div className="ro-te-stat-grid">
          {Object.entries(preview).map(([key, value]) => (
            <div key={key} className="ro-te-card ro-te-stat">
              <div className="ro-te-muted">{key.replace(/([A-Z])/g, " $1")}</div>
              <div className="ro-te-stat__value">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FeatureControlsAdminBody({ data }: { data: Record<string, unknown> }) {
  const features = (data.features as Array<{ key: string; label: string; enabled: boolean }>) ?? [];
  return (
    <ListSection title="Pack feature controls">
      <ul className="ro-te-list">
        {features.map((row) => (
          <li key={row.key}>
            <strong>{row.label}</strong> — {row.enabled ? "Enabled" : "Disabled"}
          </li>
        ))}
      </ul>
    </ListSection>
  );
}