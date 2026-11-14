"use client";

import { useState } from "react";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/lib/team-engagement/constants";

async function post(action: string, body: Record<string, unknown>) {
  return fetchAdminJson("/api/admin/team-engagement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...body })
  });
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
                  {q.distribution ? (
                    <pre className="ro-te-muted" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(q.distribution, null, 2)}
                    </pre>
                  ) : null}
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
    </div>
  );
}

export function FunZoneAdminBody({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const questions = (data.questions as Array<Record<string, unknown>>) ?? [];
  const polls = (data.polls as Array<Record<string, unknown>>) ?? [];
  const [pollPrompt, setPollPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  async function createPoll() {
    setBusy(true);
    try {
      const { body } = await post("save_fun_poll", {
        prompt: pollPrompt,
        options: ["Option A", "Option B"]
      });
      const id = (body as { id?: string }).id;
      if (id) await post("publish_fun_poll", { id });
      setPollPrompt("");
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  if (data.ready === false) {
    return <p className="ro-te-muted">Fun Zone tables are not ready. Apply Pack migrations 105–106 first.</p>;
  }
  return (
    <div className="ro-te-stack">
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Publish a poll</h3>
        <input value={pollPrompt} placeholder="Poll question" onChange={(e) => setPollPrompt(e.target.value)} />
        <button type="button" className="ro-te-btn ro-te-btn--primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void createPoll()}>
          Publish poll
        </button>
      </section>
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Drafts & activities</h3>
        <p className="ro-te-muted">{questions.length} questions · {polls.length} polls</p>
      </section>
    </div>
  );
}

export function PackIdeasAdminBody({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: () => void }) {
  const recent = (data.recent as Array<Record<string, unknown>>) ?? [];
  return (
    <section className="ro-te-card ro-te-section">
      <h3 className="ro-te-section__title">Ideas for the Pack</h3>
      <p className="ro-te-muted">{data.openCount as number} open submissions</p>
      <ul className="ro-te-list">
        {recent.map((row) => (
          <li key={String(row.id)} className="ro-te-list__item">
            <strong>{String(row.subject)}</strong>
            <span className="ro-te-muted">
              {" "}
              · {FEEDBACK_STATUS_LABELS[row.status as FeedbackStatus] ?? String(row.status)} · {String(row.submitterName)}
            </span>
            <div className="ro-te-actions">
              <button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={() => void post("update_feedback", { id: row.id, status: "under_review" }).then(onRefresh)}>
                Under review
              </button>
              <button type="button" className="ro-te-btn ro-te-btn--primary" onClick={() => void post("update_feedback", { id: row.id, status: "implemented", resolution: "We are putting this into practice." }).then(onRefresh)}>
                Implemented
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
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