"use client";

import { useEffect, useMemo, useState } from "react";

type Article = Record<string, unknown>;

export function BlogEditorPanel({ articleId }: { articleId: string | null }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [agentRuns, setAgentRuns] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<"desktop" | "tablet" | "mobile">("desktop");

  async function load() {
    if (!articleId) return;
    const res = await fetch(`/api/blog/articles?id=${articleId}`);
    const json = await res.json();
    if (res.ok) {
      setArticle(json.article);
      setAgentRuns(json.agentRuns || []);
    } else {
      setMessage(json.error || "Failed to load article");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const bodyText = String(article?.body_markdown || "");

  function speak() {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setMessage("Speech synthesis is not available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(bodyText.slice(0, 4500));
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  }

  async function action(name: string, extra?: Record<string, unknown>) {
    if (!articleId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blog/articles/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, articleId, ...extra })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setMessage(`${name} succeeded.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!article || !articleId) return;
    await action("save", {
      patch: {
        title: article.title,
        excerpt: article.excerpt,
        body_markdown: article.body_markdown,
        body_html: article.body_html,
        seo_title: article.seo_title,
        meta_description: article.meta_description,
        slug: article.slug,
        cover_alt: article.cover_alt,
        author_profile: article.author_profile
      }
    });
  }

  const previewWidth = useMemo(() => {
    if (preview === "mobile") return "max-w-sm";
    if (preview === "tablet") return "max-w-2xl";
    return "max-w-4xl";
  }, [preview]);

  if (!articleId) {
    return <p className="text-sm text-slate-600">Select an article from a queue to open the editor.</p>;
  }
  if (!article) return <p className="text-sm text-slate-600">Loading article…</p>;

  const reports = (article.quality_reports || {}) as { human?: { deductions?: Array<{ reason: string; points: number }> }; blockReasons?: string[] };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Article Editor</h2>
          <p className="text-sm text-slate-600">
            Status {String(article.status)} · Human {String(article.human_editorial_score ?? "—")} · Natural voice{" "}
            {String(article.natural_voice_score ?? "—")} · Empathy {String(article.empathy_score ?? "—")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md border px-3 py-1.5 text-sm">
            Save
          </button>
          <button type="button" disabled={busy} onClick={() => void action("rescore")} className="rounded-md border px-3 py-1.5 text-sm">
            Rescore
          </button>
          <button type="button" onClick={speak} className="rounded-md border px-3 py-1.5 text-sm">
            Listen to Article
          </button>
          <button type="button" disabled={busy} onClick={() => void action("approve")} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => void action("request_changes")} className="rounded-md border px-3 py-1.5 text-sm">
            Request changes
          </button>
          <button type="button" disabled={busy} onClick={() => void action("publish")} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">
            Publish now
          </button>
        </div>
      </div>
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      {reports.blockReasons?.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Blocked: {reports.blockReasons.join(" ")}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-lg font-semibold dark:border-slate-600 dark:bg-slate-950"
            value={String(article.title || "")}
            onChange={(e) => setArticle({ ...article, title: e.target.value })}
          />
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            value={String(article.slug || "")}
            onChange={(e) => setArticle({ ...article, slug: e.target.value })}
            placeholder="slug"
          />
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            rows={3}
            value={String(article.excerpt || "")}
            onChange={(e) => setArticle({ ...article, excerpt: e.target.value })}
            placeholder="excerpt"
          />
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-950"
            rows={18}
            value={bodyText}
            onChange={(e) => setArticle({ ...article, body_markdown: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={String(article.seo_title || "")}
              onChange={(e) => setArticle({ ...article, seo_title: e.target.value })}
              placeholder="SEO title"
            />
            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={String(article.meta_description || "")}
              onChange={(e) => setArticle({ ...article, meta_description: e.target.value })}
              placeholder="Meta description"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold">Human quality report</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              {(reports.human?.deductions || []).map((d, i) => (
                <li key={i}>
                  −{d.points}: {d.reason}
                </li>
              ))}
              {!reports.human?.deductions?.length ? <li>No deductions recorded.</li> : null}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold">Agent runs</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {agentRuns.map((run) => (
                <li key={String(run.id)} className="rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                  <span className="font-medium">{String(run.agent_name)}</span> · score {String(run.score ?? "—")} ·{" "}
                  {run.ok ? "ok" : "flagged"}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex gap-2">
              {(["desktop", "tablet", "mobile"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPreview(mode)}
                  className={`rounded px-2 py-1 text-xs ${preview === mode ? "bg-emerald-700 text-white" : "border"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className={`${previewWidth} prose prose-sm mx-auto dark:prose-invert`} dangerouslySetInnerHTML={{ __html: String(article.body_html || "") }} />
          </div>
        </div>
      </div>
    </div>
  );
}
