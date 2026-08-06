"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { ArticleLivePreview, ArticlePreviewCompareTable, type PreviewDevice } from "@/components/blog/editor/ArticleLivePreview";
import { ArticleSpeechBar } from "@/components/blog/editor/ArticleSpeechBar";
import { useArticleSpeech } from "@/components/blog/editor/useArticleSpeech";

type Article = Record<string, unknown>;
type EditorTab = "edit" | "preview" | "quality";

export function BlogEditorPanel({ articleId }: { articleId: string | null }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [agentRuns, setAgentRuns] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<EditorTab>("edit");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

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
  const speechText = useMemo(() => {
    const title = String(article?.title || "").trim();
    const excerpt = String(article?.excerpt || "").trim();
    return [title, excerpt, bodyText].filter(Boolean).join(". ");
  }, [article?.excerpt, article?.title, bodyText]);

  const speech = useArticleSpeech(speechText);

  const previewArticle = useMemo(
    () => ({
      title: String(article?.title || ""),
      slug: String(article?.slug || ""),
      excerpt: String(article?.excerpt || ""),
      bodyMarkdown: bodyText,
      bodyHtml: String(article?.body_html || ""),
      seoTitle: String(article?.seo_title || ""),
      metaDescription: String(article?.meta_description || ""),
      authorProfile: String(article?.author_profile || "Fitdog Team"),
      coverAlt: String(article?.cover_alt || "")
    }),
    [article, bodyText]
  );

  const compareRows = useMemo(
    () => [
      { label: "Title", value: previewArticle.title },
      { label: "Slug", value: previewArticle.slug },
      { label: "Excerpt", value: previewArticle.excerpt },
      { label: "SEO title", value: previewArticle.seoTitle },
      { label: "Meta description", value: previewArticle.metaDescription },
      { label: "Word count", value: String(bodyText.split(/\s+/).filter(Boolean).length) }
    ],
    [bodyText, previewArticle]
  );

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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!articleId) {
    return <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">Select an article from a queue to open the editor.</p>;
  }
  if (!article) return <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">Loading article…</p>;

  const reports = (article.quality_reports || {}) as { human?: { deductions?: Array<{ reason: string; points: number }> }; blockReasons?: string[] };

  return (
    <div className="blog-dash-panel--wide blog-editor space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">Article Editor</h2>
          <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">
            Status {String(article.status)} · Human {String(article.human_editorial_score ?? "—")} · Natural voice{" "}
            {String(article.natural_voice_score ?? "—")} · Empathy {String(article.empathy_score ?? "—")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className="blog-dash-toolbar-btn">
            Save
          </button>
          <button type="button" disabled={busy} onClick={() => void action("rescore")} className="blog-dash-toolbar-btn">
            Rescore
          </button>
          <button type="button" disabled={busy} onClick={() => void action("approve")} className="blog-dash-toolbar-btn blog-dash-toolbar-btn--success">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => void action("request_changes")} className="blog-dash-toolbar-btn">
            Request changes
          </button>
          <button type="button" disabled={busy} onClick={() => void action("publish")} className="blog-dash-toolbar-btn blog-dash-toolbar-btn--primary">
            Publish now
          </button>
        </div>
      </div>

      <ArticleSpeechBar
        status={speech.status}
        voiceLabel={speech.voiceLabel}
        progress={speech.progress}
        canPlay={speech.canPlay}
        canPause={speech.canPause}
        canStop={speech.canStop}
        onPlay={() => void speech.play()}
        onPause={speech.pause}
        onStop={speech.stop}
      />

      <div className="blog-editor-tabs" role="tablist" aria-label="Article editor views">
        {(
          [
            ["edit", "Edit"],
            ["preview", "Live Preview"],
            ["quality", "Quality & Agents"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`blog-editor-tabs__btn${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      {reports.blockReasons?.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Blocked: {reports.blockReasons.join(" ")}
        </div>
      ) : null}

      {tab === "edit" ? (
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="blog-dash-form-panel space-y-4">
            <label className="block">
              <span className="blog-dash-label">Title</span>
              <input
                className="blog-dash-input blog-dash-input--title"
                value={String(article.title || "")}
                onChange={(e) => setArticle({ ...article, title: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="blog-dash-label">Slug</span>
              <input
                className="blog-dash-input"
                value={String(article.slug || "")}
                onChange={(e) => setArticle({ ...article, slug: e.target.value })}
                placeholder="summer-dog-safety-la"
              />
            </label>
            <label className="block">
              <span className="blog-dash-label">Excerpt</span>
              <textarea
                className="blog-dash-textarea blog-dash-textarea--compact"
                rows={4}
                value={String(article.excerpt || "")}
                onChange={(e) => setArticle({ ...article, excerpt: e.target.value })}
                placeholder="Short summary shown under the title on the public blog"
              />
            </label>
            <label className="block">
              <span className="blog-dash-label">Article body (Markdown)</span>
              <textarea
                className="blog-dash-textarea blog-dash-textarea--body"
                rows={22}
                value={bodyText}
                onChange={(e) => setArticle({ ...article, body_markdown: e.target.value })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="blog-dash-label">SEO title</span>
                <input
                  className="blog-dash-input"
                  value={String(article.seo_title || "")}
                  onChange={(e) => setArticle({ ...article, seo_title: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="blog-dash-label">Meta description</span>
                <input
                  className="blog-dash-input"
                  value={String(article.meta_description || "")}
                  onChange={(e) => setArticle({ ...article, meta_description: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="blog-dash-side-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--fitdog-heading,#121417)]">Quick live preview</h3>
                <button type="button" className="blog-editor-link-btn" onClick={() => setPreviewModalOpen(true)}>
                  Pop out <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <ArticleLivePreview article={previewArticle} device="mobile" compact />
            </div>
            <ArticlePreviewCompareTable rows={compareRows.slice(0, 4)} />
          </div>
        </div>
      ) : null}

      {tab === "preview" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">
              Preview updates instantly as you edit. This mirrors the public Fitdog blog layout.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="blog-editor-device-toggle">
                {(["desktop", "tablet", "mobile"] as const).map((device) => (
                  <button
                    key={device}
                    type="button"
                    className={previewDevice === device ? "is-active" : undefined}
                    onClick={() => setPreviewDevice(device)}
                  >
                    {device}
                  </button>
                ))}
              </div>
              <button type="button" className="blog-dash-toolbar-btn" onClick={() => setPreviewModalOpen(true)}>
                Open full preview
              </button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <ArticlePreviewCompareTable rows={compareRows} />
            <ArticleLivePreview article={previewArticle} device={previewDevice} />
          </div>
        </div>
      ) : null}

      {tab === "quality" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="blog-dash-side-card">
            <h3 className="text-sm font-semibold text-[var(--fitdog-heading,#121417)]">Human quality report</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--fitdog-body,#2f363d)]">
              {(reports.human?.deductions || []).map((d, i) => (
                <li key={i}>
                  −{d.points}: {d.reason}
                </li>
              ))}
              {!reports.human?.deductions?.length ? <li>No deductions recorded.</li> : null}
            </ul>
          </div>
          <div className="blog-dash-side-card">
            <h3 className="text-sm font-semibold text-[var(--fitdog-heading,#121417)]">Agent runs</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {agentRuns.map((run) => (
                <li key={String(run.id)} className="rounded-lg bg-[#f8f9fb] px-3 py-2 text-[var(--fitdog-body,#2f363d)]">
                  <span className="font-medium text-[var(--fitdog-heading,#121417)]">{String(run.agent_name)}</span> · score {String(run.score ?? "—")} ·{" "}
                  {run.ok ? "ok" : "flagged"}
                </li>
              ))}
              {!agentRuns.length ? <li className="text-[var(--fitdog-muted,#6b7280)]">No agent runs recorded yet.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      {previewModalOpen ? (
        <div className="blog-editor-modal" role="dialog" aria-modal="true" aria-label="Full article preview">
          <div className="blog-editor-modal__toolbar">
            <strong>Live article preview</strong>
            <div className="blog-editor-device-toggle">
              {(["desktop", "tablet", "mobile"] as const).map((device) => (
                <button
                  key={device}
                  type="button"
                  className={previewDevice === device ? "is-active" : undefined}
                  onClick={() => setPreviewDevice(device)}
                >
                  {device}
                </button>
              ))}
            </div>
            <button type="button" className="blog-dash-toolbar-btn" onClick={() => setPreviewModalOpen(false)} aria-label="Close preview">
              <X className="h-4 w-4" aria-hidden />
              Close
            </button>
          </div>
          <div className="blog-editor-modal__body">
            <ArticleLivePreview article={previewArticle} device={previewDevice} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
