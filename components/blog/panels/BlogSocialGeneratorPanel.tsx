"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { packItemToDownloadRow, toCsv, toTxt } from "@/lib/blog/social/generate";
import { PLATFORM_FORMATS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/blog/social/types";

type Connection = {
  platform: SocialPlatform;
  username: string;
  status: string;
  hasSecret: boolean;
  lastTestedAt?: string | null;
  lastError?: string | null;
};

type PackItem = {
  id: string;
  platform: SocialPlatform;
  format: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[] | unknown;
  visual_direction: string;
  tone_tags: string[] | unknown;
  script_spoken?: string;
  on_screen_text?: string;
  content?: {
    imageUrl?: string;
    imageAlt?: string;
    imageCredit?: string;
    imageSourceKind?: string;
  } | null;
};

type Pack = {
  id: string;
  title: string;
  prompt: string;
  created_at: string;
};

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  snapchat: "Snapchat"
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function BlogSocialGeneratorPanel() {
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [items, setItems] = useState<PackItem[]>([]);
  const [queueAutoPost, setQueueAutoPost] = useState(false);
  const [credDrafts, setCredDrafts] = useState<Record<string, { username: string; secret: string }>>({});
  const [imageNotes, setImageNotes] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<
    Array<{
      id: string;
      url: string;
      alt: string;
      sourceKind: string;
      sceneDescription?: string;
      photographer?: string | null;
      license?: string | null;
      dogNames?: string[];
      thumbUrl?: string | null;
    }>
  >([]);
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null);
  const [replacementOptions, setReplacementOptions] = useState<
    Array<{
      id: string;
      url: string;
      alt: string;
      sourceKind: string;
      sceneDescription?: string;
      photographer?: string | null;
      license?: string | null;
      dogNames?: string[];
      thumbUrl?: string | null;
    }>
  >([]);
  const [replacementBusy, setReplacementBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/blog/social");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load");
    setPacks(json.packs || []);
    setConnections(json.connections || []);
    const drafts: Record<string, { username: string; secret: string }> = {};
    for (const conn of json.connections || []) {
      drafts[conn.platform] = { username: conn.username || "", secret: "" };
    }
    setCredDrafts(drafts);
  }, []);

  useEffect(() => {
    void reload().catch((err) => setMessage(err instanceof Error ? err.message : "Load failed"));
  }, [reload]);

  async function loadPack(packId: string) {
    const res = await fetch(`/api/blog/social?packId=${encodeURIComponent(packId)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load pack");
    setActivePackId(packId);
    setItems(json.items || []);
  }

  function applyPackPayload(json: {
    pack?: Pack & { ephemeral?: boolean };
    items?: PackItem[];
    persisted?: boolean;
    images?: Array<{ id: string; url: string; alt: string; sourceKind: string; sceneDescription?: string }>;
    imageNotes?: string[];
  }) {
    if (json.pack?.id) {
      setActivePackId(String(json.pack.id));
      setPacks((prev) => {
        const next = [json.pack as Pack, ...prev.filter((p) => p.id !== json.pack!.id)];
        return next.slice(0, 30);
      });
    }
    if (json.items?.length) setItems(json.items);
    setSelectedImages(json.images || []);
    setImageNotes(json.imageNotes || []);
    const photoCount = json.images?.length || 0;
    setMessage(
      json.persisted === false
        ? `Social pack ready with ${photoCount} real photo(s) (download now). Apply migration 061 to save packs in the database.`
        : `Social pack ready — ${photoCount} real photo(s) from bulk library + web search (no AI images). Download by platform below.`
    );
  }

  async function generate() {
    setBusy(true);
    setMessage(null);
    setReplacingImageId(null);
    setReplacementOptions([]);
    try {
      const res = await fetch("/api/blog/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          topic,
          angle,
          blogUrl,
          queueAutoPost
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generate failed");
      applyPackPayload(json);
      if (json.persisted !== false && json.pack?.id) {
        await reload();
        await loadPack(String(json.pack.id));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  async function openReplacePicker(imageId: string) {
    setReplacingImageId(imageId);
    setReplacementBusy(true);
    setMessage(null);
    try {
      const excludeIds = selectedImages.map((img) => img.id);
      const res = await fetch("/api/blog/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list_image_options",
          topic: [topic, angle].filter(Boolean).join(" ").trim() || "dog daycare",
          excludeIds,
          limit: 12
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load replacements");
      setReplacementOptions(json.photos || []);
      if (!(json.photos || []).length) {
        setMessage("No other topic-matched photos found. Upload more bulk photos or refine the topic.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load replacements");
      setReplacingImageId(null);
    } finally {
      setReplacementBusy(false);
    }
  }

  async function applyReplacement(replacement: (typeof selectedImages)[number]) {
    if (!replacingImageId) return;
    const old = selectedImages.find((img) => img.id === replacingImageId);
    if (!old) return;
    setReplacementBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blog/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace_image",
          packId: activePackId,
          oldImageId: old.id,
          oldImageUrl: old.url,
          replacement
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Replace failed");

      setSelectedImages((prev) => prev.map((img) => (img.id === old.id ? { ...replacement } : img)));
      setItems((prev) =>
        prev.map((item) => {
          const url = item.content?.imageUrl || "";
          if (url !== old.url && url.split("?")[0] !== old.url.split("?")[0]) return item;
          const credit = [replacement.photographer, replacement.license].filter(Boolean).join(" · ");
          return {
            ...item,
            visual_direction: `USE THIS REAL PHOTO (${replacement.sourceKind}): ${
              replacement.sceneDescription || replacement.alt
            }. No AI-generated images.`,
            content: {
              ...(item.content || {}),
              imageUrl: replacement.url,
              imageAlt: replacement.alt,
              imageCredit: credit,
              imageSourceKind: replacement.sourceKind
            }
          };
        })
      );
      if (Array.isArray(json.updatedItems) && json.updatedItems.length && activePackId) {
        await loadPack(activePackId);
      }
      setMessage("Photo replaced with a topic-matched real image.");
      setReplacingImageId(null);
      setReplacementOptions([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Replace failed");
    } finally {
      setReplacementBusy(false);
    }
  }

  function downloadLocal(kind: "csv" | "txt", platform?: SocialPlatform, format?: string) {
    const filtered = items.filter((item) => {
      if (platform && item.platform !== platform) return false;
      if (format && item.format !== format) return false;
      return true;
    });
    const rows = filtered.map((item) =>
      packItemToDownloadRow({
        platform: item.platform,
        format: item.format as never,
        hook: item.hook,
        body: item.body,
        cta: item.cta,
        hashtags: asStringArray(item.hashtags),
        visualDirection: item.visual_direction,
        toneTags: asStringArray(item.tone_tags),
        scriptSpoken: item.script_spoken,
        onScreenText: item.on_screen_text,
        imageUrl: item.content?.imageUrl,
        imageAlt: item.content?.imageAlt,
        imageCredit: item.content?.imageCredit,
        imageSourceKind: item.content?.imageSourceKind as "bulk_photo" | "web_licensed" | "fitdog_owned" | undefined
      })
    );
    const body = kind === "txt" ? toTxt(rows) : toCsv(rows);
    const blob = new Blob([body], { type: kind === "txt" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitdog-social-${platform || "all"}${format ? `-${format}` : ""}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveConnection(platform: SocialPlatform) {
    setBusy(true);
    setMessage(null);
    try {
      const draft = credDrafts[platform] || { username: "", secret: "" };
      const res = await fetch("/api/blog/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_connection",
          platform,
          username: draft.username,
          secret: draft.secret || undefined
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMessage(`${PLATFORM_LABELS[platform]} credentials saved (encrypted).`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(platform: SocialPlatform) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blog/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection", platform })
      });
      const json = await res.json();
      setMessage(json.message || (json.ok ? "Connected" : "Not connected"));
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  const byPlatform = useMemo(() => {
    const map: Record<SocialPlatform, PackItem[]> = {
      instagram: [],
      facebook: [],
      tiktok: [],
      snapchat: []
    };
    for (const item of items) {
      if (map[item.platform]) map[item.platform].push(item);
    }
    return map;
  }, [items]);

  return (
    <div className="blog-dash-panel space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">Social Media Generator</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--fitdog-muted,#6b7280)]">
          Professional Fitdog content for Instagram, Facebook, TikTok, and Snapchat — smart, funny, never corny.
          Captions are written to match real Digi Board Bulk Photo Upload shots first, then licensed web photos.
          AI-generated images are blocked. Download by platform and format; connect accounts below when you&apos;re
          ready to auto-post.
        </p>
      </div>

      <div className="blog-dash-form-panel">
        <label className="block">
          <span className="blog-dash-label">Topic / angle</span>
          <input
            className="blog-dash-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. first daycare drop-off nerves"
          />
        </label>
        <label className="block">
          <span className="blog-dash-label">Optional spin</span>
          <input
            className="blog-dash-input"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="e.g. summer heat + short walks"
          />
        </label>
        <label className="block">
          <span className="blog-dash-label">Traffic URL (blog post or booking)</span>
          <input
            className="blog-dash-input"
            value={blogUrl}
            onChange={(e) => setBlogUrl(e.target.value)}
            placeholder="https://blog.fitdog.com/…"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={queueAutoPost} onChange={(e) => setQueueAutoPost(e.target.checked)} />
          Queue auto-post for connected platforms
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="blog-dash-toolbar-btn blog-dash-toolbar-btn--success w-fit disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate social pack"}
        </button>
        {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
        {imageNotes.length ? (
          <ul className="list-disc pl-5 text-xs text-[var(--fitdog-muted,#6b7280)]">
            {imageNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        {selectedImages.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
              Selected real photos
            </p>
            <div className="flex flex-wrap gap-3">
              {selectedImages.map((img) => (
                <figure key={img.id} className="w-28 space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.thumbUrl || img.url}
                    alt={img.alt}
                    className="h-24 w-28 rounded-md object-cover border border-[var(--fitdog-border,#e6e8eb)]"
                  />
                  <figcaption className="text-[10px] leading-tight text-[var(--fitdog-muted,#6b7280)]">
                    {img.sourceKind.replace(/_/g, " ")}
                  </figcaption>
                  <button
                    type="button"
                    disabled={busy || replacementBusy}
                    className="blog-dash-toolbar-btn w-full px-1 py-1 text-[11px] disabled:opacity-50"
                    onClick={() => void openReplacePicker(img.id)}
                  >
                    {replacingImageId === img.id && replacementBusy ? "…" : "Replace"}
                  </button>
                </figure>
              ))}
            </div>
            {replacingImageId ? (
              <div className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-[var(--fitdog-surface,#f8f9fa)] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--fitdog-heading,#121417)]">
                    Pick a better topic-matched photo
                  </p>
                  <button
                    type="button"
                    className="text-xs text-[var(--fitdog-muted,#6b7280)] underline"
                    onClick={() => {
                      setReplacingImageId(null);
                      setReplacementOptions([]);
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {replacementBusy && !replacementOptions.length ? (
                  <p className="text-xs text-[var(--fitdog-muted,#6b7280)]">Finding matching photos…</p>
                ) : null}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {replacementOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={replacementBusy}
                      onClick={() => void applyReplacement(opt)}
                      className="shrink-0 w-24 space-y-1 text-left disabled:opacity-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={opt.thumbUrl || opt.url}
                        alt={opt.alt}
                        className="h-20 w-24 rounded-md object-cover border border-[var(--fitdog-border,#e6e8eb)]"
                      />
                      <span className="block text-[10px] leading-tight text-[var(--fitdog-muted,#6b7280)]">
                        {opt.sourceKind.replace(/_/g, " ")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
          Platform connections
        </h3>
        <p className="text-xs text-[var(--fitdog-muted,#6b7280)]">
          Store username / page ID and access token (or app password). Secrets are encrypted at rest. Official APIs
          require tokens — not browser password bots.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {SOCIAL_PLATFORMS.map((platform) => {
            const conn = connections.find((c) => c.platform === platform);
            const draft = credDrafts[platform] || { username: "", secret: "" };
            return (
              <div key={platform} className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--fitdog-heading,#121417)]">{PLATFORM_LABELS[platform]}</p>
                  <span className="text-xs uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
                    {conn?.status || "disconnected"}
                    {conn?.hasSecret ? " · secret saved" : ""}
                  </span>
                </div>
                <label className="mt-3 block">
                  <span className="blog-dash-label">Username / page ID</span>
                  <input
                    className="blog-dash-input"
                    value={draft.username}
                    onChange={(e) =>
                      setCredDrafts((prev) => ({
                        ...prev,
                        [platform]: { ...draft, username: e.target.value }
                      }))
                    }
                    autoComplete="off"
                  />
                </label>
                <label className="mt-2 block">
                  <span className="blog-dash-label">Access token / app password</span>
                  <input
                    type="password"
                    className="blog-dash-input"
                    value={draft.secret}
                    onChange={(e) =>
                      setCredDrafts((prev) => ({
                        ...prev,
                        [platform]: { ...draft, secret: e.target.value }
                      }))
                    }
                    placeholder={conn?.hasSecret ? "•••••••• (leave blank to keep)" : "Paste token"}
                    autoComplete="new-password"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="blog-dash-toolbar-btn"
                    onClick={() => void saveConnection(platform)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="blog-dash-toolbar-btn"
                    onClick={() => void testConnection(platform)}
                  >
                    Test sync
                  </button>
                </div>
                {conn?.lastError ? <p className="mt-2 text-xs text-red-700">{conn.lastError}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      {packs.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
            Recent packs
          </h3>
          <div className="flex flex-wrap gap-2">
            {packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  activePackId === pack.id
                    ? "border-[var(--fitdog-orange,#ff6f26)] bg-[var(--fitdog-orange-soft,#fff1e9)]"
                    : "border-[var(--fitdog-border,#e6e8eb)] bg-white"
                }`}
                onClick={() => void loadPack(pack.id)}
              >
                {pack.title.slice(0, 48)}
              </button>
            ))}
          </div>
          {items.length ? (
            <div className="flex flex-wrap gap-3 text-sm">
              <button type="button" className="text-[var(--fitdog-orange,#ff6f26)] underline" onClick={() => downloadLocal("csv")}>
                Download all (CSV)
              </button>
              <button type="button" className="text-[var(--fitdog-orange,#ff6f26)] underline" onClick={() => downloadLocal("txt")}>
                Download all (TXT)
              </button>
              {activePackId && !String(activePackId).startsWith("local-") ? (
                <a
                  className="text-[var(--fitdog-orange,#ff6f26)] underline"
                  href={`/api/blog/social?packId=${encodeURIComponent(activePackId)}&download=csv`}
                >
                  Server CSV
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {SOCIAL_PLATFORMS.map((platform) => (
        <PlatformBlock
          key={platform}
          platform={platform}
          items={byPlatform[platform]}
          packId={activePackId}
          onDownload={(kind, format) => downloadLocal(kind, platform, format)}
        />
      ))}
    </div>
  );
}

function PlatformBlock({
  platform,
  items,
  packId,
  onDownload
}: {
  platform: SocialPlatform;
  items: PackItem[];
  packId: string | null;
  onDownload: (kind: "csv" | "txt", format?: string) => void;
}) {
  const formats = PLATFORM_FORMATS[platform];
  return (
    <section className="space-y-3 rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-[var(--fitdog-heading,#121417)]">{PLATFORM_LABELS[platform]}</h3>
          <p className="text-xs text-[var(--fitdog-muted,#6b7280)]">Labeled formats with separate download tables</p>
        </div>
        {items.length ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" className="text-[var(--fitdog-orange,#ff6f26)] underline" onClick={() => onDownload("csv")}>
              Download {PLATFORM_LABELS[platform]} CSV
            </button>
            <button type="button" className="text-[var(--fitdog-orange,#ff6f26)] underline" onClick={() => onDownload("txt")}>
              Download TXT
            </button>
          </div>
        ) : null}
      </div>
      {formats.map((fmt) => {
        const rows = items.filter((item) => item.format === fmt.format);
        return (
          <div key={fmt.tableKey} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-[var(--fitdog-heading,#121417)]">{fmt.label}</h4>
              {rows.length ? (
                <div className="flex gap-3 text-xs">
                  <button type="button" className="text-[var(--fitdog-orange,#ff6f26)] underline" onClick={() => onDownload("csv", fmt.format)}>
                    CSV
                  </button>
                  <button type="button" className="text-[var(--fitdog-orange,#ff6f26)] underline" onClick={() => onDownload("txt", fmt.format)}>
                    TXT
                  </button>
                </div>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--fitdog-border,#e6e8eb)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#fafbfc] text-left text-xs uppercase text-[var(--fitdog-muted,#6b7280)]">
                  <tr>
                    <th className="px-3 py-2">Hook</th>
                    <th className="px-3 py-2">Body</th>
                    <th className="px-3 py-2">CTA</th>
                    <th className="px-3 py-2">On-screen / script</th>
                    <th className="px-3 py-2">Photo</th>
                    <th className="px-3 py-2">Visual</th>
                    <th className="px-3 py-2">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => (
                      <tr key={row.id} className="border-t border-[var(--fitdog-border,#e6e8eb)] align-top">
                        <td className="px-3 py-2 font-medium whitespace-pre-wrap text-sm">{row.hook}</td>
                        <td className="px-3 py-2 max-w-sm whitespace-pre-wrap text-sm">{row.body}</td>
                        <td className="px-3 py-2 text-sm">{row.cta}</td>
                        <td className="px-3 py-2 text-xs">
                          {row.on_screen_text ? <p>On-screen: {row.on_screen_text}</p> : null}
                          {row.script_spoken ? <p className="mt-1">Spoken: {row.script_spoken}</p> : null}
                          {asStringArray(row.hashtags).length ? (
                            <p className="mt-1 whitespace-pre-wrap text-[var(--fitdog-muted,#6b7280)]">
                              {asStringArray(row.hashtags)
                                .map((h) => (h.startsWith("#") ? h : `#${h}`))
                                .join(" ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {row.content?.imageUrl ? (
                            <a href={row.content.imageUrl} target="_blank" rel="noreferrer" className="block w-20">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={row.content.imageUrl}
                                alt={row.content.imageAlt || row.hook}
                                className="h-16 w-20 rounded object-cover border border-[var(--fitdog-border,#e6e8eb)]"
                              />
                              <span className="mt-1 block text-[10px] text-[var(--fitdog-muted,#6b7280)]">
                                {(row.content.imageSourceKind || "photo").replace(/_/g, " ")}
                              </span>
                            </a>
                          ) : (
                            <span className="text-xs text-[var(--fitdog-muted,#6b7280)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--fitdog-muted,#6b7280)]">{row.visual_direction}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="blog-dash-toolbar-btn"
                            onClick={() => {
                              const tags = asStringArray(row.hashtags)
                                .map((h) => (h.startsWith("#") ? h : `#${h}`))
                                .join(" ");
                              const text = [row.hook, "", row.body, "", tags, row.content?.imageUrl ? `\nIMAGE: ${row.content.imageUrl}` : ""]
                                .join("\n")
                                .trim();
                              void navigator.clipboard.writeText(text);
                            }}
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-[var(--fitdog-muted,#6b7280)]" colSpan={7}>
                        Generate a pack to fill this table.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
