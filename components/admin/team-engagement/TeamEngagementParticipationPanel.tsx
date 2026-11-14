"use client";

import "@/app/styles/team-engagement.css";

import { useCallback, useEffect, useState } from "react";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";
import { humanizeUnknownError } from "@/lib/safe-url";

type HomePayload = {
  recipients: { userId: string; name: string; title: string | null }[];
  categories: { key: string; label: string }[];
  feed: { items: { id: string; recipientName: string; authorName: string; message: string; categoryLabel: string }[] } | null;
  limits: { message: number };
  participation: { minMessageLength: number };
  storageReady: boolean;
};

export default function TeamEngagementParticipationPanel() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [mode, setMode] = useState<"bark_outs" | "suggestions">("bark_outs");
  const [recipient, setRecipient] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<HomePayload & { error?: string }>("/api/admin/bark-outs?view=home");
    if (!ok) {
      setHome(null);
      setError((body as { error?: string }).error ?? "Bark Outs are not available for this account.");
      return;
    }
    setHome(body);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitBarkOut(event: React.FormEvent) {
    event.preventDefault();
    if (!home) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, body } = await fetchAdminJson("/api/admin/bark-outs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_bark_out", recipientUserId: recipient, category, message })
      });
      if (!ok) throw new Error((body as { error?: string }).error ?? "Could not send Bark Out.");
      setMessage("");
      await load();
    } catch (err) {
      setError(humanizeUnknownError(err, "Could not send Bark Out."));
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok, body } = await fetchAdminJson("/api/admin/bark-outs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit_feedback", category: "suggestion", subject: feedbackSubject, details: feedbackDetails })
      });
      if (!ok) throw new Error((body as { error?: string }).error ?? "Could not send suggestion.");
      setFeedbackSubject("");
      setFeedbackDetails("");
    } catch (err) {
      setError(humanizeUnknownError(err, "Could not send suggestion."));
    } finally {
      setBusy(false);
    }
  }

  if (error && !home) {
    return <p className="ro-te-muted">{error}</p>;
  }
  if (!home) return <p className="ro-te-muted">Loading Bark Outs…</p>;
  if (!home.storageReady) {
    return <p className="ro-te-muted">Team Engagement is being set up. Bark Outs will open after the database migration runs.</p>;
  }

  return (
    <div className="ro-te-participation">
      <div className="ro-te-participation__tabs">
        <button type="button" className={`ro-te-btn ${mode === "bark_outs" ? "ro-te-btn--primary" : "ro-te-btn--ghost"}`} onClick={() => setMode("bark_outs")}>
          Bark Outs
        </button>
        <button type="button" className={`ro-te-btn ${mode === "suggestions" ? "ro-te-btn--primary" : "ro-te-btn--ghost"}`} onClick={() => setMode("suggestions")}>
          Suggestions
        </button>
      </div>
      {error ? <p className="ro-te-error">{error}</p> : null}
      {mode === "bark_outs" ? (
        <form className="ro-te-card ro-te-form" onSubmit={(event) => void submitBarkOut(event)}>
          <h3 className="ro-te-section__title">Recognize a teammate</h3>
          <label className="ro-te-field">
            Teammate
            <select value={recipient} required onChange={(event) => setRecipient(event.target.value)}>
              <option value="">Choose someone</option>
              {home.recipients.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                  {person.title ? ` · ${person.title}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="ro-te-field">
            Category
            <select value={category} required onChange={(event) => setCategory(event.target.value)}>
              <option value="">Choose a category</option>
              {home.categories.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ro-te-field">
            Message
            <textarea
              value={message}
              required
              minLength={home.participation.minMessageLength}
              maxLength={home.limits.message}
              rows={4}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <button type="submit" className="ro-te-btn ro-te-btn--primary" disabled={busy}>
            Send Bark Out
          </button>
        </form>
      ) : (
        <form className="ro-te-card ro-te-form" onSubmit={(event) => void submitFeedback(event)}>
          <h3 className="ro-te-section__title">Team suggestion</h3>
          <p className="ro-te-muted">Suggestions are reviewed by leadership. They are not anonymous in RuffOps.</p>
          <label className="ro-te-field">
            Subject
            <input value={feedbackSubject} required minLength={3} onChange={(event) => setFeedbackSubject(event.target.value)} />
          </label>
          <label className="ro-te-field">
            Details
            <textarea value={feedbackDetails} required minLength={10} rows={4} onChange={(event) => setFeedbackDetails(event.target.value)} />
          </label>
          <button type="submit" className="ro-te-btn ro-te-btn--primary" disabled={busy}>
            Submit suggestion
          </button>
        </form>
      )}
      {home.feed?.items?.length ? (
        <section className="ro-te-card ro-te-section">
          <h3 className="ro-te-section__title">Recent team Bark Outs</h3>
          <ul className="ro-te-list">
            {home.feed.items.slice(0, 8).map((item) => (
              <li key={item.id} className="ro-te-list__item">
                <strong>{item.recipientName}</strong>
                <span className="ro-te-muted"> · {item.categoryLabel}</span>
                <p>{item.message}</p>
                <p className="ro-te-muted ro-te-list__meta">From {item.authorName}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}