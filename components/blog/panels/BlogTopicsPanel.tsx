"use client";

import { useCallback, useEffect, useState } from "react";
import { BlogContextualHelpLink } from "@/components/blog/help/BlogContextualHelpLink";

type Topic = {
  id: string;
  title: string;
  status: string;
  topic_quality_score?: number;
  reader_concern?: string;
  primary_takeaway?: string;
  tone_preset?: string;
  local_relevance?: string;
  rejection_reason?: string;
};

export function BlogTopicsPanel() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [title, setTitle] = useState("");
  const [readerConcern, setReaderConcern] = useState("");
  const [primaryTakeaway, setPrimaryTakeaway] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/blog/topics");
    const json = await res.json();
    if (res.ok) setTopics(json.topics || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seed() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blog/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Seed failed");
      setMessage(`Seeded ${json.inserted} topics (${json.skipped} already present).`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  }

  async function createTopic(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blog/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, readerConcern, primaryTakeaway })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      setMessage(`Topic scored ${json.score?.score}. ${json.score?.rejected ? json.score.rejectionReason : "Ready."}`);
      setTitle("");
      setReaderConcern("");
      setPrimaryTakeaway("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="blog-dash-panel--wide space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">Topic Ideas</h2>
          <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">Minimum Topic Quality Score: 85. Weak generic topics are rejected.</p>
          <div className="mt-2">
            <BlogContextualHelpLink step="topics" label="Learn how to generate topics" />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void seed()}
          className="blog-dash-toolbar-btn blog-dash-toolbar-btn--success disabled:opacity-50"
        >
          Seed thoughtful topics
        </button>
      </div>

      <form onSubmit={createTopic} className="blog-dash-form-panel">
        <h3 className="text-base font-semibold text-[var(--fitdog-heading,#121417)]">Submit a topic</h3>
        <input
          className="blog-dash-input"
          placeholder="Specific, useful topic title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          className="blog-dash-textarea blog-dash-textarea--compact"
          placeholder="Reader concern"
          value={readerConcern}
          onChange={(e) => setReaderConcern(e.target.value)}
          rows={3}
        />
        <textarea
          className="blog-dash-textarea blog-dash-textarea--compact"
          placeholder="Primary takeaway"
          value={primaryTakeaway}
          onChange={(e) => setPrimaryTakeaway(e.target.value)}
          rows={3}
        />
        <button type="submit" disabled={busy} className="blog-dash-toolbar-btn blog-dash-toolbar-btn--primary w-fit disabled:opacity-50">
          Score & save topic
        </button>
      </form>

      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}

      <div className="overflow-hidden rounded-[var(--blog-card-radius,14px)] border border-[var(--fitdog-border,#e6e8eb)]">
        <table className="blog-dash-table min-w-full">
          <thead>
            <tr>
              <th>Title</th>
              <th>Score</th>
              <th>Status</th>
              <th>Concern</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic.id}>
                <td className="font-medium text-[var(--fitdog-heading,#121417)]">{topic.title}</td>
                <td>{topic.topic_quality_score ?? "—"}</td>
                <td>{topic.status}</td>
                <td className="text-[var(--fitdog-muted,#6b7280)]">{topic.reader_concern || topic.rejection_reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
