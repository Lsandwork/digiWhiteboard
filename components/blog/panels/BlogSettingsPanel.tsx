"use client";

import { useEffect, useState } from "react";

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

  if (!settings) return <p className="text-sm text-slate-600">Loading settings…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">
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
        <p className="text-sm text-slate-600">
          Defaults protect quality: auto-publish off, AI images off, human score ≥ 90, topic score ≥ 85.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Emergency stop (blocks generation & publishing)</span>
          <input
            type="checkbox"
            checked={Boolean(settings.emergency_off)}
            onChange={(e) => void save({ emergency_off: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Automatic publishing</span>
          <input
            type="checkbox"
            checked={Boolean(settings.auto_publish_enabled)}
            onChange={(e) => void save({ auto_publish_enabled: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>AI-generated images</span>
          <input
            type="checkbox"
            checked={Boolean(settings.ai_images_enabled)}
            onChange={(e) => void save({ ai_images_enabled: e.target.checked })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Human Editorial Score threshold</span>
          <input
            type="number"
            className="w-full rounded border px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            value={Number(settings.human_score_threshold || 90)}
            onChange={(e) => setSettings({ ...settings, human_score_threshold: Number(e.target.value) })}
            onBlur={() => void save({ human_score_threshold: Number(settings.human_score_threshold) })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Topic Quality Score threshold</span>
          <input
            type="number"
            className="w-full rounded border px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            value={Number(settings.topic_score_threshold || 85)}
            onChange={(e) => setSettings({ ...settings, topic_score_threshold: Number(e.target.value) })}
            onBlur={() => void save({ topic_score_threshold: Number(settings.topic_score_threshold) })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Publish provider</span>
          <select
            className="w-full rounded border px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            value={String(settings.publish_provider || "native")}
            onChange={(e) => void save({ publish_provider: e.target.value })}
          >
            <option value="native">Native Fitdog blog (/blog)</option>
            <option value="wordpress">WordPress REST</option>
            <option value="webhook">Protected webhook</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Public AI disclosure (optional)</span>
          <textarea
            className="w-full rounded border px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            rows={3}
            value={String(settings.public_ai_disclosure || "")}
            onChange={(e) => setSettings({ ...settings, public_ai_disclosure: e.target.value })}
            onBlur={() => void save({ public_ai_disclosure: settings.public_ai_disclosure })}
            placeholder="Shown only when configured by Super Admin"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Voice sliders (JSON)</span>
          <textarea
            className="w-full rounded border px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-950"
            rows={6}
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
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Save cost limits
        </button>
      </div>
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
    </div>
  );
}
