"use client";

import { useEffect, useState } from "react";

function WordPressTestBlock({
  message,
  setMessage
}: {
  message: string | null;
  setMessage: (value: string | null) => void;
}) {
  const [testing, setTesting] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-[#fafbfc] p-4">
      <p className="text-sm font-medium text-[var(--fitdog-heading,#121417)]">WordPress connection</p>
      <p className="mt-1 text-xs text-[var(--fitdog-muted,#6b7280)]">
        Uses WORDPRESS_URL, WORDPRESS_USERNAME, and WORDPRESS_APPLICATION_PASSWORD. Canonical URL points back to the Fitdog blog.
      </p>
      <button
        type="button"
        disabled={testing}
        className="blog-dash-toolbar-btn mt-3 w-fit disabled:opacity-50"
        onClick={() => {
          void (async () => {
            setTesting(true);
            setMessage(null);
            try {
              const res = await fetch("/api/blog/publishing/wordpress-test", { method: "POST" });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || json.message || "Test failed");
              setMessage(json.message || "WordPress OK");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "WordPress test failed");
            } finally {
              setTesting(false);
            }
          })();
        }}
      >
        {testing ? "Testing…" : "Test WordPress connection"}
      </button>
      {message ? <p className="mt-2 text-sm text-emerald-800">{message}</p> : null}
    </div>
  );
}

export function BlogSettingsPanel({ focus }: { focus?: string }) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/blog/settings");
      const json = await res.json();
      if (res.ok) setSettings(json.settings);
    })();
  }, []);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/blog/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSettings(json.settings);
      setMessage("Settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">Loading settings…</p>;

  return (
    <div className="blog-dash-panel space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">
          {focus === "brand-voice"
            ? "Brand Voice"
            : focus === "editorial"
              ? "Editorial Standards"
              : focus === "publishing"
                ? "Publishing Connections"
                : focus === "automation"
                  ? "Automation Rules"
                  : "Settings"}
        </h2>
        <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">
          Full-auto SEO posting uses score gates (topic ≥ 85, human ≥ 90). Emergency stop still blocks everything.
        </p>
      </div>

      <div className="blog-dash-form-panel">
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--fitdog-heading,#121417)]">
          <span className="font-medium">Emergency stop (blocks generation & publishing)</span>
          <input
            type="checkbox"
            checked={Boolean(settings.emergency_off)}
            onChange={(e) => void save({ emergency_off: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--fitdog-heading,#121417)]">
          <span className="font-medium">Full-auto SEO scheduler (generate → schedule → post)</span>
          <input
            type="checkbox"
            checked={Boolean(settings.full_auto_enabled)}
            onChange={(e) => void save({ full_auto_enabled: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--fitdog-heading,#121417)]">
          <span className="font-medium">Automatic publishing (cron publishes due slots)</span>
          <input
            type="checkbox"
            checked={Boolean(settings.auto_publish_enabled)}
            onChange={(e) => void save({ auto_publish_enabled: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--fitdog-heading,#121417)]">
          <span className="font-medium">Mirror publishes to WordPress</span>
          <input
            type="checkbox"
            checked={Boolean(settings.wordpress_mirror_enabled)}
            onChange={(e) => void save({ wordpress_mirror_enabled: e.target.checked })}
          />
        </label>
        {(focus === "automation" || focus === "publishing" || !focus || focus === "settings") && (
          <>
            <label className="block">
              <span className="blog-dash-label">Posts per week (human-like cadence)</span>
              <input
                type="number"
                min={1}
                max={14}
                className="blog-dash-input"
                value={Number(settings.posts_per_week || 3)}
                onChange={(e) => setSettings({ ...settings, posts_per_week: Number(e.target.value) })}
                onBlur={() => void save({ posts_per_week: Number(settings.posts_per_week || 3) })}
              />
            </label>
            <label className="block">
              <span className="blog-dash-label">Minimum hours between posts</span>
              <input
                type="number"
                min={6}
                max={72}
                className="blog-dash-input"
                value={Number(settings.min_hours_between_posts || 20)}
                onChange={(e) => setSettings({ ...settings, min_hours_between_posts: Number(e.target.value) })}
                onBlur={() => void save({ min_hours_between_posts: Number(settings.min_hours_between_posts || 20) })}
              />
            </label>
          </>
        )}
        {(focus === "publishing" || focus === "settings") && (
          <WordPressTestBlock message={message} setMessage={setMessage} />
        )}
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--fitdog-heading,#121417)]">
          <span className="font-medium">AI-generated images</span>
          <input
            type="checkbox"
            checked={Boolean(settings.ai_images_enabled)}
            onChange={(e) => void save({ ai_images_enabled: e.target.checked })}
          />
        </label>
        <label className="block">
          <span className="blog-dash-label">Human Editorial Score threshold</span>
          <input
            type="number"
            className="blog-dash-input"
            value={Number(settings.human_score_threshold || 90)}
            onChange={(e) => setSettings({ ...settings, human_score_threshold: Number(e.target.value) })}
            onBlur={() => void save({ human_score_threshold: Number(settings.human_score_threshold) })}
          />
        </label>
        <label className="block">
          <span className="blog-dash-label">Topic Quality Score threshold</span>
          <input
            type="number"
            className="blog-dash-input"
            value={Number(settings.topic_score_threshold || 85)}
            onChange={(e) => setSettings({ ...settings, topic_score_threshold: Number(e.target.value) })}
            onBlur={() => void save({ topic_score_threshold: Number(settings.topic_score_threshold) })}
          />
        </label>
        <label className="block">
          <span className="blog-dash-label">Publish provider</span>
          <select
            className="blog-dash-select"
            value={String(settings.publish_provider || "native")}
            onChange={(e) => void save({ publish_provider: e.target.value })}
          >
            <option value="native">Native Fitdog blog (/blog)</option>
            <option value="wordpress">WordPress REST</option>
            <option value="webhook">Protected webhook</option>
          </select>
        </label>
        <label className="block">
          <span className="blog-dash-label">Help overview video URL (optional)</span>
          <input
            type="url"
            className="blog-dash-input"
            placeholder="https://…/blog-generator-overview.mp4"
            value={String(
              ((settings.provider_config as Record<string, unknown> | undefined)?.help_tutorial_video_url as string) || ""
            )}
            onChange={(e) =>
              setSettings({
                ...settings,
                provider_config: {
                  ...((settings.provider_config as Record<string, unknown>) || {}),
                  help_tutorial_video_url: e.target.value
                }
              })
            }
            onBlur={() =>
              void save({
                provider_config: {
                  ...((settings.provider_config as Record<string, unknown>) || {}),
                  help_tutorial_video_url: String(
                    ((settings.provider_config as Record<string, unknown> | undefined)?.help_tutorial_video_url as string) ||
                      ""
                  ).trim() || null
                }
              })
            }
          />
          <span className="mt-1 block text-xs text-[var(--fitdog-muted,#6b7280)]">
            Powers the “Watch 2-Minute Overview” button on the How to Use guide. Leave blank to show setup instructions in the modal.
          </span>
        </label>
        <label className="block">
          <span className="blog-dash-label">Public AI disclosure (optional)</span>
          <textarea
            className="blog-dash-textarea blog-dash-textarea--compact"
            rows={4}
            value={String(settings.public_ai_disclosure || "")}
            onChange={(e) => setSettings({ ...settings, public_ai_disclosure: e.target.value })}
            onBlur={() => void save({ public_ai_disclosure: settings.public_ai_disclosure })}
            placeholder="Shown only when configured by Super Admin"
          />
        </label>
        <label className="block">
          <span className="blog-dash-label">Voice sliders (JSON)</span>
          <textarea
            className="blog-dash-textarea blog-dash-textarea--body"
            rows={8}
            value={JSON.stringify(settings.voice_sliders || {}, null, 2)}
            onChange={(e) => {
              try {
                setSettings({ ...settings, voice_sliders: JSON.parse(e.target.value) });
              } catch {
                // keep typing
              }
            }}
            onBlur={() => void save({ voice_sliders: settings.voice_sliders })}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void save({
              max_cost_per_article_cents: settings.max_cost_per_article_cents,
              daily_cost_limit_cents: settings.daily_cost_limit_cents,
              weekly_cost_limit_cents: settings.weekly_cost_limit_cents,
              monthly_cost_limit_cents: settings.monthly_cost_limit_cents
            })
          }
          className="blog-dash-toolbar-btn blog-dash-toolbar-btn--success w-fit disabled:opacity-50"
        >
          Save cost limits
        </button>
      </div>
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
    </div>
  );
}
