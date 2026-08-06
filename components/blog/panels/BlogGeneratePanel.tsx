"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";

type Topic = { id: string; title: string; topic_quality_score?: number; status: string; reader_concern?: string };

export function BlogGeneratePanel() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/blog/topics");
      const json = await res.json();
      if (res.ok) {
        const usable = (json.topics || []).filter(
          (t: Topic) => t.status !== "rejected" && t.status !== "archived" && Number(t.topic_quality_score || 0) >= 85
        );
        setTopics(usable);
        if (usable[0]) setTopicId(usable[0].id);
      }
    })();
  }, []);

  async function generate() {
    if (!topicId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setArticleId(json.article.id);
      setMessage(
        `Draft created with Human Editorial Score ${json.article.human_editorial_score}. Status: ${json.article.status}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Generate Article</h2>
        <p className="text-sm text-slate-600">
          Runs topic brief → Human-First Writer → empathy, practical, natural-voice, SEO, fact-check, brand, and final human-quality agents.
          Auto-publish stays off.
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Approved / scored topic</span>
        <select
          className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              [{topic.topic_quality_score}] {topic.title}
            </option>
          ))}
        </select>
      </label>
      {topics.find((t) => t.id === topicId)?.reader_concern ? (
        <p className="text-sm text-slate-600">Concern: {topics.find((t) => t.id === topicId)?.reader_concern}</p>
      ) : null}
      <button
        type="button"
        disabled={busy || !topicId}
        onClick={() => void generate()}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Generating…" : "Generate draft"}
      </button>
      {message ? <p className="text-sm text-slate-800 dark:text-slate-200">{message}</p> : null}
      {articleId ? (
        <Link href={`${BLOG_APP_PATH}?page=editor&id=${articleId}`} className="inline-block text-sm text-emerald-700 hover:underline">
          Open in editor
        </Link>
      ) : null}
    </div>
  );
}
