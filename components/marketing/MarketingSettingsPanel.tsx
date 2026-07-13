"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/ui/ToastProvider";

export function MarketingSettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [profile, setProfile] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/marketing/settings", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Unable to load settings.", "error");
    else {
      setSettings(body.settings ?? {});
      setProfile(body.profile ?? {});
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    const response = await fetch("/api/marketing/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        defaultDestination: settings.default_destination,
        defaultUploadTags: settings.default_upload_tags,
        thumbnailDensity: settings.thumbnail_density,
        notifyHandlerUpdates: settings.notify_handler_updates,
        notifyUploadResults: settings.notify_upload_results,
        notifyCampaignDeadlines: settings.notify_campaign_deadlines
      })
    });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Unable to save settings.", "error");
    else {
      setSettings(body.settings ?? {});
      showToast("Settings saved.", "success");
    }
  }

  return (
    <div className="marketing-card max-w-2xl">
      <h2 className="marketing-card__title mb-4">Personal Settings</h2>
      <p className="mb-4 text-sm text-slate-600">Signed in as {String(profile.email ?? "")}</p>
      <div className="marketing-form-grid">
        <label>
          Default request destination
          <select
            value={String(settings.default_destination ?? "photo_box")}
            onChange={(e) => setSettings((current) => ({ ...current, default_destination: e.target.value }))}
          >
            <option value="photo_box">Photo Box</option>
            <option value="grooming_area">Grooming Area</option>
            <option value="lobby">Lobby</option>
            <option value="training_room">Training Room</option>
            <option value="custom">Custom Location</option>
          </select>
        </label>
        <label>
          Thumbnail density
          <select
            value={String(settings.thumbnail_density ?? "comfortable")}
            onChange={(e) => setSettings((current) => ({ ...current, thumbnail_density: e.target.value }))}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(settings.notify_handler_updates ?? true)}
            onChange={(e) => setSettings((current) => ({ ...current, notify_handler_updates: e.target.checked }))}
          />
          Notify me about handler updates
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(settings.notify_upload_results ?? true)}
            onChange={(e) => setSettings((current) => ({ ...current, notify_upload_results: e.target.checked }))}
          />
          Notify me about upload results
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(settings.notify_campaign_deadlines ?? true)}
            onChange={(e) => setSettings((current) => ({ ...current, notify_campaign_deadlines: e.target.checked }))}
          />
          Notify me about campaign deadlines
        </label>
        <p className="text-sm text-slate-500">Password changes use the existing admin account password flow from your profile in the main admin center.</p>
        <button type="button" className="marketing-btn marketing-btn--primary" onClick={() => void save()}>Save preferences</button>
      </div>
    </div>
  );
}
