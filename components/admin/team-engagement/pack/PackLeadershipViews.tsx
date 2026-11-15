"use client";

import { useMemo, useState } from "react";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";
import {
  EngagementDataTable,
  EngagementPremiumSection,
  EngagementStatusPill,
  EngagementToolbar
} from "@/components/admin/team-engagement/EngagementAdminChrome";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/lib/team-engagement/constants";

async function post(action: string, body: Record<string, unknown>) {
  return fetchAdminJson("/api/admin/team-engagement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...body })
  });
}

function SurveyDistributionBars({ distribution }: { distribution: unknown }) {
  const rows: Array<{ label: string; count: number }> = [];
  if (Array.isArray(distribution)) {
    for (const entry of distribution) {
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        rows.push({
          label: String(record.label ?? record.option ?? record.key ?? "Option"),
          count: Number(record.count ?? record.value ?? 0)
        });
      }
    }
  } else if (distribution && typeof distribution === "object") {
    for (const [label, value] of Object.entries(distribution as Record<string, unknown>)) {
      rows.push({ label, count: Number(value ?? 0) });
    }
  }
  if (!rows.length) return <p className="ro-te-muted">No distribution data.</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="ro-te-list" style={{ marginTop: 8 }}>
      {rows.map((row) => (
        <li key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 3fr auto", gap: 8, alignItems: "center" }}>
          <span>{row.label}</span>
          <span
            style={{
              display: "block",
              height: 8,
              borderRadius: 4,
              background: "var(--ro-te-accent, #3b82f6)",
              width: `${Math.round((row.count / max) * 100)}%`,
              minWidth: row.count ? 4 : 0
            }}
            aria-hidden
          />
          <span className="ro-te-muted">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function PackOverviewBody({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const goals = data.goals as { active?: number; completed?: number } | undefined;
  const milestones = data.milestones as { upcoming?: number } | undefined;
  const ideas = data.ideas as { open?: number } | undefined;
  return (
    <div className="ro-te-stack">
      <div className="ro-te-stat-grid">
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Active Pack goals</div>
          <div className="ro-te-stat__value">{goals?.active ?? 0}</div>
        </div>
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Upcoming milestones</div>
          <div className="ro-te-stat__value">{milestones?.upcoming ?? 0}</div>
        </div>
        <div className="ro-te-card ro-te-stat">
          <div className="ro-te-muted">Ideas awaiting review</div>
          <div className="ro-te-stat__value">{ideas?.open ?? 0}</div>
        </div>
      </div>
      <button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={onRefresh}>
        Refresh overview
      </button>
    </div>
  );
}

export function PackGoalsAdminBody({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  async function createGoal() {
    setBusy(true);
    try {
      await post("save_pack_goal", { title, description, goalType: "numeric", targetValue: 100, unit: "points" });
      setTitle("");
      setDescription("");
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ro-te-stack">
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Create Pack goal</h3>
        <label className="ro-te-field">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="ro-te-field">
          Description
          <textarea value={description} rows={3} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button type="button" className="ro-te-btn ro-te-btn--primary" disabled={busy} onClick={() => void createGoal()}>
          Save draft
        </button>
      </section>
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Goals</h3>
        {items.length === 0 ? <p className="ro-te-muted">No goals yet.</p> : null}
        <ul className="ro-te-list">
          {items.map((goal) => (
            <li key={String(goal.id)} className="ro-te-list__item">
              <strong>{String(goal.title)}</strong>
              <span className="ro-te-muted"> · {String(goal.status)} · {goal.progressPercent as number}%</span>
              <div className="ro-te-actions">
                {goal.status === "draft" ? (
                  <button type="button" className="ro-te-btn ro-te-btn--primary" onClick={() => void post("publish_pack_goal", { id: goal.id }).then(onRefresh)}>
                    Publish
                  </button>
                ) : null}
                {goal.status === "active" ? (
                  <button
                    type="button"
                    className="ro-te-btn ro-te-btn--ghost"
                    onClick={() => void post("update_pack_goal_progress", { id: goal.id, currentValue: goal.targetValue, complete: true }).then(onRefresh)}
                  >
                    Mark complete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function EmployeeVoiceAdminBody({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  async function openResults(id: string) {
    setResultsFor(id);
    setResults(null);
    const { ok, body } = await fetchAdminJson<Record<string, unknown>>(
      `/api/admin/team-engagement?view=voice_survey_results&id=${encodeURIComponent(id)}`
    );
    if (ok) setResults(body);
    else setResults({ error: "Could not load results." });
  }
  async function createSurvey() {
    setBusy(true);
    try {
      const { body } = await post("save_voice_survey", {
        title,
        anonymityMode: "anonymous",
        questions: [
          { prompt: "How supported do you feel by your team this week?", questionType: "rating", required: true },
          { prompt: "What is one thing we could improve?", questionType: "text", required: false }
        ]
      });
      const id = (body as { id?: string }).id;
      if (id) await post("publish_voice_survey", { id });
      setTitle("");
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ro-te-stack">
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Create anonymous survey</h3>
        <p className="ro-te-muted">Responses are stored without employee identifiers. Aggregate reporting uses minimum response thresholds.</p>
        <label className="ro-te-field">
          Survey title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="button" className="ro-te-btn ro-te-btn--primary" disabled={busy} onClick={() => void createSurvey()}>
          Create & publish
        </button>
      </section>
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Surveys</h3>
        <ul className="ro-te-list">
          {items.map((row) => (
            <li key={String(row.id)} className="ro-te-list__item">
              {String(row.title)} <span className="ro-te-muted">· {String(row.status)} · {String(row.anonymityMode)}</span>
              <div>
                <button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={() => void openResults(String(row.id))}>
                  View aggregate results
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {resultsFor ? (
        <section className="ro-te-card ro-te-section">
          <h3 className="ro-te-section__title">Aggregate results</h3>
          {results === null ? <p className="ro-te-muted">Loading…</p> : null}
          {results?.error ? <p className="ro-te-muted">{String(results.error)}</p> : null}
          {Array.isArray(results?.questions) ? (
            <ul className="ro-te-list">
              {(results.questions as Array<Record<string, unknown>>).map((q) => (
                <li key={String(q.questionId)} className="ro-te-list__item">
                  <strong>{String(q.prompt)}</strong>
                  <span className="ro-te-muted">
                    {" "}
                    · {String(q.responseCount)} responses
                    {q.suppressed ? " · hidden (below minimum)" : ""}
                  </span>
                  {q.distribution ? <SurveyDistributionBars distribution={q.distribution} /> : null}
                  {Array.isArray(q.samples) && q.samples.length ? (
                    <ul className="ro-te-list">
                      {(q.samples as string[]).slice(0, 5).map((sample, index) => (
                        <li key={index} className="ro-te-muted">
                          {sample}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="ro-te-btn ro-te-btn--ghost" style={{ marginTop: 8 }} onClick={() => setResultsFor(null)}>
            Close
          </button>
        </section>
      ) : null}
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">You said, we did</h3>
        <p className="ro-te-muted">Publish a follow-up employees can read on the Voice tab after surveys close.</p>
        <VoiceOutcomeForm onRefresh={onRefresh} />
      </section>
    </div>
  );
}

function VoiceOutcomeForm({ onRefresh }: { onRefresh: () => void }) {
  const [theme, setTheme] = useState("");
  const [response, setResponse] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="ro-te-stack" style={{ marginTop: 8 }}>
      <label className="ro-te-field">
        Theme
        <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Scheduling flexibility" />
      </label>
      <label className="ro-te-field">
        What we heard
        <textarea value={response} rows={3} onChange={(e) => setResponse(e.target.value)} />
      </label>
      <label className="ro-te-field">
        What we did (optional)
        <textarea value={action} rows={2} onChange={(e) => setAction(e.target.value)} />
      </label>
      <button
        type="button"
        className="ro-te-btn ro-te-btn--primary"
        disabled={busy || !theme.trim() || !response.trim()}
        onClick={() => {
          setBusy(true);
          void post("save_voice_outcome", { theme, managementResponse: response, actionTaken: action || undefined, publish: true })
            .then(onRefresh)
            .finally(() => setBusy(false));
        }}
      >
        Publish update
      </button>
    </div>
  );
}

const DEFAULT_POLL_OPTIONS = ["", ""];

function trimPollOptions(options: string[]) {
  return options.map((value) => value.trim()).filter(Boolean);
}

function formatPacificWhen(value: unknown) {
  if (!value || typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function FunZoneActivityTable({
  questions,
  polls,
  trivia,
  onRefresh
}: {
  questions: Array<Record<string, unknown>>;
  polls: Array<Record<string, unknown>>;
  trivia: Array<Record<string, unknown>>;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const rows = useMemo(() => {
    const merged = [
      ...questions.map((row) => ({
        id: String(row.id),
        kind: "Question" as const,
        title: String(row.prompt ?? ""),
        status: String(row.status ?? "draft"),
        publishAt: row.publishAt ?? row.publish_at,
        publishAction: "publish_fun_question" as const
      })),
      ...polls.map((row) => ({
        id: String(row.id),
        kind: "Poll" as const,
        title: String(row.prompt ?? ""),
        status: String(row.status ?? "draft"),
        publishAt: row.publishAt ?? row.publish_at,
        publishAction: "publish_fun_poll" as const
      })),
      ...trivia.map((row) => ({
        id: String(row.id),
        kind: "Trivia" as const,
        title: String(row.title ?? row.prompt ?? ""),
        status: String(row.status ?? "draft"),
        publishAt: row.publishAt ?? row.publish_at,
        publishAction: null
      }))
    ];
    const q = query.trim().toLowerCase();
    return merged.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return row.title.toLowerCase().includes(q) || row.kind.toLowerCase().includes(q);
    });
  }, [polls, questions, query, statusFilter, trivia]);

  return (
    <EngagementPremiumSection
      title="Drafts & activities"
      description="Manage what appears in Pack Fun Zone. Publishing activates items for staff; drafts stay admin-only until published."
    >
      <EngagementToolbar>
        <input
          className="ro-te-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search prompt…"
          aria-label="Search fun zone items"
        />
        <select className="ro-te-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="closed">Closed</option>
        </select>
      </EngagementToolbar>
      <EngagementDataTable
        emptyTitle="No Fun Zone items"
        emptyBody="Publish a question, poll, or event above — it will appear here and in Pack."
        columns={[
          { key: "kind", label: "Type" },
          { key: "title", label: "Title" },
          { key: "status", label: "Status" },
          { key: "publishAt", label: "Publish" },
          { key: "actions", label: "" }
        ]}
        rows={rows.map((row) => {
          const busy = busyKey === `${row.kind}:${row.id}`;
          return {
            id: `${row.kind}:${row.id}`,
            cells: {
              kind: row.kind,
              title: <span style={{ whiteSpace: "pre-wrap" }}>{row.title}</span>,
              status: <EngagementStatusPill status={row.status} />,
              publishAt: formatPacificWhen(row.publishAt),
              actions:
                row.publishAction && row.status === "draft" ? (
                  <button
                    type="button"
                    className="ro-te-btn ro-te-btn--primary"
                    disabled={busy}
                    onClick={() => {
                      setBusyKey(`${row.kind}:${row.id}`);
                      void post(row.publishAction, { id: row.id })
                        .then(onRefresh)
                        .finally(() => setBusyKey(null));
                    }}
                  >
                    Publish
                  </button>
                ) : (
                  <span className="ro-te-muted" style={{ fontSize: 12 }}>
                    {row.status === "active" ? "Live in Pack" : "—"}
                  </span>
                )
            }
          };
        })}
      />
    </EngagementPremiumSection>
  );
}

export function FunZoneAdminBody({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const questions = (data.questions as Array<Record<string, unknown>>) ?? [];
  const polls = (data.polls as Array<Record<string, unknown>>) ?? [];
  const trivia = (data.trivia as Array<Record<string, unknown>>) ?? [];
  if (data.ready === false) {
    return (
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Fun Zone storage</h3>
        <p className="ro-te-muted">
          {typeof data.setupMessage === "string"
            ? data.setupMessage
            : "Run supabase/migrations/105_pack_priority2.sql and 106_team_engagement_commit_pack_tables.sql in Supabase (after 103), then refresh."}
        </p>
        {Array.isArray(data.missingTables) && data.missingTables.length ? (
          <details style={{ marginTop: 8 }}>
            <summary className="ro-te-muted">Missing tables</summary>
            <ul className="ro-te-list" style={{ fontSize: 13 }}>
              {(data.missingTables as string[]).map((table) => (
                <li key={table}>{table}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    );
  }
  return (
    <div className="ro-te-stack">
      <QuestionOfTheDayAdmin onRefresh={onRefresh} />
      <FunZonePollPublisher onRefresh={onRefresh} />
      <FunZoneActivityTable questions={questions} polls={polls} trivia={trivia} onRefresh={onRefresh} />
      <WouldYouRatherAdmin onRefresh={onRefresh} />
      <PackEventAdmin onRefresh={onRefresh} />
    </div>
  );
}

function QuestionOfTheDayAdmin({ onRefresh }: { onRefresh: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const labels = trimPollOptions(options);
  const hasChoiceAnswers = labels.length > 0;
  const choiceMode = options.length > 0 || hasChoiceAnswers;
  const canPublish =
    prompt.trim().length >= 5 && (!choiceMode || labels.length >= 2);

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((entry, i) => (i === index ? value : entry)));
  }

  function removeOption(index: number) {
    setOptions((current) => current.filter((_, i) => i !== index));
  }

  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">Question of the day</h3>
      <p className="ro-te-muted" style={{ marginBottom: 8, fontSize: 13 }}>
        {choiceMode
          ? "With answer choices, Pack shows multiple choice on the Question of the day card."
          : "Team members answer in Pack with short written responses, or add answer choices below for multiple choice."}
      </p>
      <label className="ro-te-field">
        Question
        <textarea
          value={prompt}
          rows={2}
          placeholder="What made you smile at work today?"
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      {choiceMode ? (
        <div className="ro-te-stack" style={{ marginTop: 8, gap: 8 }}>
          {options.map((value, index) => (
            <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label className="ro-te-field" style={{ flex: 1, margin: 0 }}>
                Answer {index + 1}
                <input
                  value={value}
                  placeholder={`Answer ${index + 1}`}
                  onChange={(e) => updateOption(index, e.target.value)}
                />
              </label>
              <button
                type="button"
                className="ro-te-btn ro-te-btn--ghost"
                style={{ marginTop: 20 }}
                aria-label={`Remove answer ${index + 1}`}
                disabled={busy}
                onClick={() => removeOption(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {options.length < 8 ? (
        <button
          type="button"
          className="ro-te-btn ro-te-btn--ghost"
          style={{ marginTop: 8 }}
          disabled={busy}
          onClick={() => setOptions((current) => (current.length ? [...current, ""] : ["", ""]))}
        >
          {choiceMode ? "Add answer" : "Add poll answers"}
        </button>
      ) : null}
      <button
        type="button"
        className="ro-te-btn ro-te-btn--primary"
        style={{ marginTop: 8 }}
        disabled={busy || !canPublish}
        onClick={() => {
          setBusy(true);
          const trimmedPrompt = prompt.trim();
          const publish = post("save_fun_question", {
            prompt: trimmedPrompt,
            cadence: "daily",
            ...(hasChoiceAnswers ? { options: labels } : {})
          }).then(async ({ body }) => {
            const id = (body as { id?: string }).id;
            if (id) await post("publish_fun_question", { id });
          });
          void publish
            .then(() => {
              setPrompt("");
              setOptions([]);
              onRefresh();
            })
            .finally(() => setBusy(false));
        }}
      >
        Publish question
      </button>
    </section>
  );
}

function FunZonePollPublisher({ onRefresh }: { onRefresh: () => void }) {
  const [pollPrompt, setPollPrompt] = useState("");
  const [options, setOptions] = useState(() => [...DEFAULT_POLL_OPTIONS]);
  const [busy, setBusy] = useState(false);
  const labels = trimPollOptions(options);
  const canPublish = pollPrompt.trim().length >= 5 && labels.length >= 2;

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((entry, i) => (i === index ? value : entry)));
  }

  function removeOption(index: number) {
    setOptions((current) => (current.length <= 2 ? current : current.filter((_, i) => i !== index)));
  }

  async function createPoll() {
    setBusy(true);
    try {
      const { body } = await post("save_fun_poll", {
        prompt: pollPrompt.trim(),
        options: labels
      });
      const id = (body as { id?: string }).id;
      if (id) await post("publish_fun_poll", { id });
      setPollPrompt("");
      setOptions([...DEFAULT_POLL_OPTIONS]);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">Pack poll</h3>
      <p className="ro-te-muted" style={{ marginBottom: 8, fontSize: 13 }}>
        Add the question and at least two answer choices. Shown as the Pack poll (multiple choice).
      </p>
      <label className="ro-te-field">
        Poll question
        <input value={pollPrompt} placeholder="Poll question" onChange={(e) => setPollPrompt(e.target.value)} />
      </label>
      <div className="ro-te-stack" style={{ marginTop: 8, gap: 8 }}>
        {options.map((value, index) => (
          <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="ro-te-field" style={{ flex: 1, margin: 0 }}>
              Answer {index + 1}
              <input
                value={value}
                placeholder={`Answer ${index + 1}`}
                onChange={(e) => updateOption(index, e.target.value)}
              />
            </label>
            {options.length > 2 ? (
              <button
                type="button"
                className="ro-te-btn ro-te-btn--ghost"
                style={{ marginTop: 20 }}
                aria-label={`Remove answer ${index + 1}`}
                disabled={busy}
                onClick={() => removeOption(index)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {options.length < 8 ? (
        <button
          type="button"
          className="ro-te-btn ro-te-btn--ghost"
          style={{ marginTop: 8 }}
          disabled={busy}
          onClick={() => setOptions((current) => [...current, ""])}
        >
          Add answer
        </button>
      ) : null}
      <button
        type="button"
        className="ro-te-btn ro-te-btn--primary"
        style={{ marginTop: 8 }}
        disabled={busy || !canPublish}
        onClick={() => void createPoll()}
      >
        Publish poll
      </button>
    </section>
  );
}

function WouldYouRatherAdmin({ onRefresh }: { onRefresh: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">Would you rather?</h3>
      <label className="ro-te-field">
        Option A
        <input value={a} onChange={(e) => setA(e.target.value)} />
      </label>
      <label className="ro-te-field">
        Option B
        <input value={b} onChange={(e) => setB(e.target.value)} />
      </label>
      <button
        type="button"
        className="ro-te-btn ro-te-btn--primary"
        disabled={busy || !a.trim() || !b.trim()}
        onClick={() => {
          setBusy(true);
          void post("publish_would_you_rather", { optionA: a, optionB: b })
            .then(() => {
              setA("");
              setB("");
              onRefresh();
            })
            .finally(() => setBusy(false));
        }}
      >
        Publish question
      </button>
    </section>
  );
}

function PackEventAdmin({ onRefresh }: { onRefresh: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">Team event</h3>
      <label className="ro-te-field">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="ro-te-field">
        Description
        <textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="ro-te-field">
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label className="ro-te-field">
        Starts (local)
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>
      <button
        type="button"
        className="ro-te-btn ro-te-btn--primary"
        disabled={busy || !title.trim()}
        onClick={() => {
          setBusy(true);
          const iso = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
          void post("publish_pack_event", { title, description, location, startsAt: iso })
            .then(() => {
              setTitle("");
              setDescription("");
              setLocation("");
              setStartsAt("");
              onRefresh();
            })
            .finally(() => setBusy(false));
        }}
      >
        Publish event
      </button>
    </section>
  );
}

export function PackIdeasAdminBody({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const recent = (data.recent as Array<Record<string, unknown>>) ?? [];
  const [resolutionById, setResolutionById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  return (
    <EngagementPremiumSection
      title="Ideas for the Pack"
      description="Status updates sync to employee-facing feedback and Pack idea surfaces."
    >
      <p className="ro-te-muted">{data.openCount as number} open submissions</p>
      <ul className="ro-te-list">
        {recent.map((row) => {
          const id = String(row.id);
          const resolution = resolutionById[id] ?? "We are putting this into practice.";
          const busy = busyId === id;
          return (
            <li key={id} className="ro-te-list__item">
              <strong>{String(row.subject)}</strong>
              <span className="ro-te-muted">
                {" "}
                · {FEEDBACK_STATUS_LABELS[row.status as FeedbackStatus] ?? String(row.status)} · {String(row.submitterName)}
              </span>
              <p style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{String(row.message ?? row.body ?? "")}</p>
              <div className="ro-te-actions">
                <button
                  type="button"
                  className="ro-te-btn ro-te-btn--ghost"
                  disabled={busy}
                  onClick={() => {
                    setBusyId(id);
                    void post("update_feedback", { id, status: "under_review" }).then(onRefresh).finally(() => setBusyId(null));
                  }}
                >
                  Under review
                </button>
              </div>
              <label className="ro-te-field" style={{ marginTop: 8 }}>
                Resolution (shown to teammate)
                <textarea rows={2} value={resolution} disabled={busy} onChange={(event) => setResolutionById((prev) => ({ ...prev, [id]: event.target.value }))} />
              </label>
              <button
                type="button"
                className="ro-te-btn ro-te-btn--primary"
                disabled={busy || resolution.trim().length < 5}
                onClick={() => {
                  setBusyId(id);
                  void post("update_feedback", { id, status: "implemented", resolution: resolution.trim() })
                    .then(onRefresh)
                    .finally(() => setBusyId(null));
                }}
              >
                Mark implemented
              </button>
            </li>
          );
        })}
      </ul>
    </EngagementPremiumSection>
  );
}

export function PackMilestonesAdminBody({ onSync }: { onSync: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">Milestone automation</h3>
      <p className="ro-te-muted">Sync anniversaries and opted-in birthdays from staff_directory hire dates. Schedule via /api/cron/pack-milestones.</p>
      <button
        type="button"
        className="ro-te-btn ro-te-btn--primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void post("sync_pack_milestones", {}).finally(() => {
            setBusy(false);
            onSync();
          });
        }}
      >
        Run sync now
      </button>
    </section>
  );
}