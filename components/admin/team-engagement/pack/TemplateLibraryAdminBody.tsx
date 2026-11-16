"use client";

import { useCallback, useMemo, useState } from "react";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";

type TemplateItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tab: string;
  category: string;
  tone: string;
  titleTemplate: string;
  messageTemplate: string;
  instructionsTemplate?: string | null;
  kind: string;
  favorited?: boolean;
  usageCount?: number;
  isSystem?: boolean;
};

type TemplateLibraryPayload = {
  ready: boolean;
  migration?: string;
  catalogOnly?: boolean;
  tabs: { id: string; label: string }[];
  tones: string[];
  total: number;
  items: TemplateItem[];
};

const AUDIENCE_AWARE_KINDS = new Set([
  "announcement",
  "culture_message",
  "campaign",
  "milestone",
  "insight",
  "status_message"
]);

function tabLabel(tabs: TemplateLibraryPayload["tabs"], id: string) {
  return tabs.find((tab) => tab.id === id)?.label ?? id;
}

export function TemplateLibraryAdminBody({
  data,
  onRefresh
}: {
  data: Record<string, unknown>;
  onRefresh: () => void;
}) {
  const payload = data as unknown as TemplateLibraryPayload;
  const [tab, setTab] = useState<string>("");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<TemplateItem | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("Professional");
  const [busy, setBusy] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let items = payload.items ?? [];
    if (tab) items = items.filter((item) => item.tab === tab);
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      );
    }
    if (favoritesOnly) items = items.filter((item) => item.favorited);
    return items;
  }, [payload.items, tab, query, favoritesOnly]);

  const openTemplate = useCallback((item: TemplateItem) => {
    setSelected(item);
    setTitle(item.titleTemplate);
    setMessage(item.messageTemplate);
    setTone(item.tone || "Professional");
    setPublishResult(null);
  }, []);

  async function runAction(action: string, body: Record<string, unknown>) {
    setBusy(action);
    try {
      const { ok, body: response } = await fetchAdminJson<{ error?: string; preview?: { title: string }; result?: Record<string, unknown> }>(
        "/api/admin/team-engagement",
        { method: "POST", body: JSON.stringify({ action, ...body }) }
      );
      if (!ok) throw new Error(response?.error ?? "Request failed");
      return response;
    } finally {
      setBusy(null);
    }
  }

  async function publish(draft: boolean) {
    if (!selected) return;
    try {
      const response = await runAction("publish_engagement_template", {
        templateId: selected.id,
        title,
        message,
        tone,
        asDraft: draft
      });
      const prefilled = response?.result as { prefilled?: boolean; message?: string } | undefined;
      if (prefilled?.prefilled) {
        setPublishResult("Template is ready — finish recipient details in Bark Outs or Ideas before posting.");
      } else if (response?.preview?.title) {
        setPublishResult(draft ? "Saved as draft publication." : `Published “${response.preview.title}”.`);
      } else {
        setPublishResult(draft ? "Draft saved." : "Published.");
      }
      onRefresh();
    } catch (error) {
      setPublishResult(error instanceof Error ? error.message : "Could not publish.");
    }
  }

  return (
    <div className="ro-te-stack">
      {!payload.ready ? (
        <div className="ro-te-banner ro-te-banner--warn">
          Template storage is not applied yet. You can browse the built-in catalog below; apply <code>{payload.migration}</code> and{" "}
          <code>supabase/migrations/112_team_engagement_commit_templates.sql</code> to enable favorites, custom templates, and usage history.
        </div>
      ) : null}

      <div className="ro-te-toolbar">
        <input
          className="ro-te-input"
          placeholder="Search templates…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search templates"
        />
        <select className="ro-te-select" value={tab} onChange={(event) => setTab(event.target.value)} aria-label="Filter by tab">
          <option value="">All Team Engagement tabs</option>
          {(payload.tabs ?? []).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <label className="ro-te-check">
          <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />
          Favorites only
        </label>
        <span className="ro-te-muted">{filtered.length} of {payload.total ?? 0} templates</span>
      </div>

      <div className="ro-te-template-grid">
        {filtered.map((item) => (
          <article key={item.id} className="ro-te-card ro-te-template-card">
            <div className="ro-te-template-card__head">
              <h4>{item.name}</h4>
              {item.favorited ? <span className="ro-te-pill ro-te-pill--accent">Favorite</span> : null}
            </div>
            <p className="ro-te-muted">{tabLabel(payload.tabs ?? [], item.tab)} · {item.category}</p>
            <p className="ro-te-template-card__desc">{item.description}</p>
            <div className="ro-te-actions">
              <button type="button" className="ro-te-btn ro-te-btn--primary" onClick={() => openTemplate(item)}>
                Preview & customize
              </button>
              <button
                type="button"
                className="ro-te-btn ro-te-btn--ghost"
                disabled={busy === "favorite"}
                onClick={async () => {
                  await runAction("favorite_engagement_template", { templateId: item.id, favorite: !item.favorited });
                  onRefresh();
                }}
              >
                {item.favorited ? "Unfavorite" : "Favorite"}
              </button>
              <button
                type="button"
                className="ro-te-btn ro-te-btn--ghost"
                disabled={busy === "duplicate"}
                onClick={async () => {
                  await runAction("duplicate_engagement_template", { templateId: item.id });
                  onRefresh();
                }}
              >
                Duplicate
              </button>
            </div>
          </article>
        ))}
      </div>

      {selected ? (
        <dialog open className="ro-te-modal">
          <div className="ro-te-modal__panel ro-te-stack">
            <header className="ro-te-modal__header">
              <h3>{selected.name}</h3>
              <button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={() => setSelected(null)}>
                Close
              </button>
            </header>
            <p className="ro-te-muted">Employee preview — this is what teammates will see after you publish.</p>
            <label className="ro-te-field">
              <span>Title</span>
              <input className="ro-te-input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="ro-te-field">
              <span>Message</span>
              <textarea className="ro-te-textarea" rows={6} value={message} onChange={(event) => setMessage(event.target.value)} />
            </label>
            <label className="ro-te-field">
              <span>Tone</span>
              <select className="ro-te-select" value={tone} onChange={(event) => setTone(event.target.value)}>
                {(payload.tones ?? []).map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            {selected.instructionsTemplate ? (
              <div className="ro-te-callout">
                <strong>Instructions</strong>
                <p>{selected.instructionsTemplate}</p>
              </div>
            ) : null}
            {AUDIENCE_AWARE_KINDS.has(selected.kind) ? (
              <p className="ro-te-muted" style={{ fontSize: 13 }}>
                Department-scoped managers publish to their departments automatically. Organization-wide leaders reach everyone unless you add audience controls later.
              </p>
            ) : null}
            <div className="ro-te-preview-card">
              <h4>{title}</h4>
              <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
            </div>
            {publishResult ? <p className="ro-te-callout">{publishResult}</p> : null}
            <div className="ro-te-actions">
              <button type="button" className="ro-te-btn ro-te-btn--ghost" disabled={!!busy} onClick={() => void publish(true)}>
                Save draft
              </button>
              <button type="button" className="ro-te-btn ro-te-btn--primary" disabled={!!busy} onClick={() => void publish(false)}>
                Publish now
              </button>
              {!selected.isSystem ? (
                <button
                  type="button"
                  className="ro-te-btn ro-te-btn--ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    await runAction("archive_engagement_template", { templateId: selected.id });
                    setSelected(null);
                    onRefresh();
                  }}
                >
                  Archive
                </button>
              ) : null}
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}