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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Topic Ideas</h2>
          <p className="text-sm text-slate-600">Minimum Topic Quality Score: 85. Weak generic topics are rejected.</p>
          <div className="mt-2">
            <BlogContextualHelpLink step="topics" label="Learn how to generate topics" />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void seed()}
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Seed thoughtful topics
        </button>
      </div>

      <form onSubmit={createTopic} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold">Submit a topic</h3>
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          placeholder="Specific, useful topic title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          placeholder="Reader concern"
          value={readerConcern}
          onChange={(e) => setReaderConcern(e.target.value)}
          rows={2}
        />
        <textarea
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          placeholder="Primary takeaway"
          value={primaryTakeaway}
          onChange={(e) => setPrimaryTakeaway(e.target.value)}
          rows={2}
        />
        <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
          Score & save topic
        </button>
      </form>

      {message ? <p className="text-sm text-emerald-800 dark:text-emerald-300">{message}</p> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Concern</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium">{topic.title}</td>
                <td className="px-3 py-2">{topic.topic_quality_score ?? "—"}</td>
                <td className="px-3 py-2">{topic.status}</td>
                <td className="px-3 py-2 text-slate-600">{topic.reader_concern || topic.rejection_reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
