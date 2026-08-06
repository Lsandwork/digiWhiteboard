"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BLOG_APP_PATH } from "@/lib/blog/constants";
import { BlogContextualHelpLink } from "@/components/blog/help/BlogContextualHelpLink";

type Topic = { id: string; title: string; topic_quality_score?: number; status: string; reader_concern?: string };

export function BlogGeneratePanel() {
  const searchParams = useSearchParams();
  const presetTopicId = searchParams.get("topicId") || "";
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState(presetTopicId);
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
        if (presetTopicId && usable.some((t: Topic) => t.id === presetTopicId)) {
          setTopicId(presetTopicId);
        } else if (usable[0]) {
          setTopicId(usable[0].id);
        }
      }
    })();
  }, [presetTopicId]);

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

  const selectedTopic = topics.find((t) => t.id === topicId);

  return (
    <div className="blog-dash-panel space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">Blog Generator</h2>
        <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">
          Runs topic brief → Human-First Writer → empathy, practical, natural-voice, SEO, fact-check, brand, and final human-quality agents.
          Auto-publish stays off.
        </p>
        <div className="mt-2">
          <BlogContextualHelpLink step="create" label="Learn how to create articles" />
        </div>
      </div>

      <div className="blog-dash-form-panel">
        <label className="block">
          <span className="blog-dash-label">Approved / scored topic</span>
          <select className="blog-dash-select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                [{topic.topic_quality_score}] {topic.title}
              </option>
            ))}
          </select>
        </label>

        {selectedTopic?.reader_concern ? (
          <div className="blog-dash-concern">
            <strong>Concern:</strong> {selectedTopic.reader_concern}
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy || !topicId}
          onClick={() => void generate()}
          className="blog-dash-toolbar-btn blog-dash-toolbar-btn--primary w-fit disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate draft"}
        </button>
      </div>

      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      {articleId ? (
        <Link href={`${BLOG_APP_PATH}?page=editor&id=${articleId}`} className="inline-block text-sm text-[var(--fitdog-orange,#ff6f26)] hover:underline">
          Open in editor
        </Link>
      ) : null}
    </div>
  );
}
