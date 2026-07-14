"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Monitor,
  Pause,
  Play,
  Trash2,
  UploadCloud
} from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { uploadCastTvMedia, replaceCastTvMedia } from "@/lib/cast-tv/upload-client";
import type { CastTvMediaRecord } from "@/lib/cast-tv/types";
import {
  CAST_TV_IMAGE_DURATION_OPTIONS,
  type CastTvImageDuration,
  type CastTvSettings,
  type CastTvTransitionStyle
} from "@/lib/cast-tv/types";

type CastTvPanelProps = {
  onToast: (message: string, type?: "success" | "error" | "info") => void;
};

const DISPLAY_URL = "https://casttv.ruffops.com";
const FALLBACK_DISPLAY_URL = "/cast-tv";

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function CastTvPanel({ onToast }: CastTvPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<CastTvMediaRecord[]>([]);
  const [settings, setSettings] = useState<CastTvSettings | null>(null);
  const [heartbeat, setHeartbeat] = useState<{ online: boolean; last_seen_at: string | null }>({
    online: false,
    last_seen_at: null
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<CastTvMediaRecord | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const activeMedia = useMemo(() => media.filter((item) => item.is_enabled), [media]);
  const disabledMedia = useMemo(() => media.filter((item) => !item.is_enabled), [media]);

  const loadData = useCallback(async () => {
    try {
      const [mediaResponse, settingsResponse] = await Promise.all([
        fetch("/api/cast-tv/media", { cache: "no-store" }),
        fetch("/api/cast-tv/settings?heartbeat=1", { cache: "no-store" })
      ]);
      const mediaBody = await mediaResponse.json();
      const settingsBody = await settingsResponse.json();

      if (!mediaResponse.ok) throw new Error(mediaBody.error ?? "Unable to load CAST-TV media.");
      if (!settingsResponse.ok) throw new Error(settingsBody.error ?? "Unable to load CAST-TV settings.");

      setMedia(mediaBody.media ?? []);
      setSettings(settingsBody.settings ?? null);
      if (settingsBody.heartbeat) {
        setHeartbeat({
          online: Boolean(settingsBody.heartbeat.online),
          last_seen_at: settingsBody.heartbeat.last_seen_at ?? null
        });
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to load CAST-TV.", "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => {
      void loadData();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  async function handleFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(0);
    let successCount = 0;

    try {
      for (const file of files) {
        await uploadCastTvMedia(file, undefined, (pct) => setUploadProgress(pct));
        successCount += 1;
      }
      onToast(
        successCount === 1 ? "Media uploaded to CAST-TV." : `Uploaded ${successCount} files to CAST-TV.`,
        "success"
      );
      await loadData();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Upload failed.", "error");
      if (successCount > 0) await loadData();
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function patchMedia(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/cast-tv/media/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Update failed.");
      setMedia((current) => current.map((item) => (item.id === id ? body.media : item)));
      onToast("Media updated.", "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Update failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMedia(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/cast-tv/media/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Delete failed.");
      setMedia((current) => current.filter((item) => item.id !== id));
      onToast("Media deleted.", "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Delete failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function moveMedia(id: string, direction: "up" | "down") {
    setBusyId(id);
    try {
      const response = await fetch("/api/cast-tv/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, direction })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Reorder failed.");
      setMedia(body.media ?? []);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Reorder failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function saveSettings(patch: Partial<CastTvSettings>) {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/cast-tv/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Settings update failed.");
      setSettings(body.settings);
      onToast("CAST-TV settings saved.", "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Settings update failed.", "error");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleReplace(file: File) {
    if (!replaceTargetId) return;
    setBusyId(replaceTargetId);
    try {
      const mediaItem = await replaceCastTvMedia(replaceTargetId, file);
      setMedia((current) =>
        current.map((item) => (item.id === replaceTargetId ? { ...item, ...mediaItem } : item))
      );
      onToast("Media replaced.", "success");
      await loadData();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Replace failed.", "error");
    } finally {
      setBusyId(null);
      setReplaceTargetId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  async function copyDisplayUrl() {
    const url = DISPLAY_URL;
    try {
      await navigator.clipboard.writeText(url);
      onToast("CAST-TV display URL copied.", "success");
    } catch {
      onToast(url, "info");
    }
  }

  function renderMediaRow(item: CastTvMediaRecord, index: number, list: CastTvMediaRecord[]) {
    const busy = busyId === item.id;
    return (
      <article key={item.id} className="cast-tv-admin-card">
        <div className="cast-tv-admin-card__preview">
          {item.media_type === "video" ? (
            <video src={item.public_url ?? ""} muted playsInline preload="metadata" className="cast-tv-admin-card__thumb" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.public_url ?? ""} alt="" className="cast-tv-admin-card__thumb" />
          )}
        </div>
        <div className="cast-tv-admin-card__body">
          <div className="cast-tv-admin-card__title-row">
            <input
              className="cast-tv-admin-card__name-input"
              defaultValue={item.display_name ?? item.file_name}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== (item.display_name ?? item.file_name)) {
                  void patchMedia(item.id, { display_name: value });
                }
              }}
            />
            <span className={`cast-tv-admin-card__status ${item.is_enabled ? "is-enabled" : "is-disabled"}`}>
              {item.is_enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="cast-tv-admin-card__meta">
            {item.media_type.toUpperCase()} · {formatFileSize(item.file_size_bytes)} · Uploaded {formatDateTime(item.created_at)}
            {item.uploaded_by_name ? ` · ${item.uploaded_by_name}` : ""}
          </p>
          <div className="cast-tv-admin-card__controls">
            {item.media_type === "image" ? (
              <label className="cast-tv-admin-card__duration">
                Duration
                <select
                  value={item.image_display_seconds}
                  disabled={busy}
                  onChange={(event) =>
                    void patchMedia(item.id, {
                      image_display_seconds: Number(event.target.value) as CastTvImageDuration
                    })
                  }
                >
                  {CAST_TV_IMAGE_DURATION_OPTIONS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds}s
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="cast-tv-admin-card__duration">Full video length</span>
            )}
            <div className="cast-tv-admin-card__actions">
              <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy || index === 0} onClick={() => void moveMedia(item.id, "up")}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="crossover-btn crossover-btn--ghost"
                disabled={busy || index === list.length - 1}
                onClick={() => void moveMedia(item.id, "down")}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => setPreviewItem(item)}>
                <Eye className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="crossover-btn crossover-btn--ghost"
                disabled={busy}
                onClick={() => {
                  setReplaceTargetId(item.id);
                  replaceInputRef.current?.click();
                }}
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="crossover-btn crossover-btn--ghost"
                disabled={busy}
                onClick={() => void patchMedia(item.id, { is_enabled: !item.is_enabled })}
              >
                {item.is_enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void deleteMedia(item.id)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="cast-tv-admin space-y-5">
      <section className="crossover-card">
        <div className="crossover-card__header">
          <div>
            <p className="crossover-card__eyebrow">Digital Signage</p>
            <h2 className="crossover-card__title">CAST-TV</h2>
            <p className="crossover-card__subtitle">
              Manage the photo and video playlist shown on the CAST-TV display.
            </p>
          </div>
          <div className="cast-tv-admin__status">
            <Monitor className="h-4 w-4" />
            <span className={heartbeat.online ? "is-online" : "is-offline"}>
              {heartbeat.online ? "CAST-TV Online" : "CAST-TV Offline"}
            </span>
            <span className="cast-tv-admin__last-seen">
              {heartbeat.last_seen_at ? `Last seen ${formatDateTime(heartbeat.last_seen_at)}` : "No display connected yet"}
            </span>
          </div>
        </div>

        <div className="cast-tv-admin__toolbar">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => void copyDisplayUrl()}>
            <Copy className="h-4 w-4" />
            Copy Display URL
          </button>
          <a href={DISPLAY_URL} target="_blank" rel="noreferrer" className="crossover-btn crossover-btn--ghost">
            <ExternalLink className="h-4 w-4" />
            Open CAST-TV
          </a>
          <a href={FALLBACK_DISPLAY_URL} target="_blank" rel="noreferrer" className="crossover-btn crossover-btn--ghost">
            <ExternalLink className="h-4 w-4" />
            Open /cast-tv
          </a>
          <a href={DISPLAY_URL} target="_blank" rel="noreferrer" className="crossover-btn crossover-btn--primary">
            <Eye className="h-4 w-4" />
            Preview CAST-TV
          </a>
        </div>
      </section>

      <section className="crossover-card">
        <div className="crossover-card__header">
          <div>
            <h3 className="crossover-card__title">Media Upload</h3>
            <p className="crossover-card__subtitle">
              JPG, JPEG, PNG, WEBP, MP4, WEBM, or MOV. Images up to 20MB, videos up to 250MB.
            </p>
          </div>
        </div>

        <label
          className={`lobby-slideshow-upload-drop ${dragActive ? "is-drag-active" : ""} ${uploading ? "is-busy" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (!uploading) void handleFiles(event.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <div className="lobby-slideshow-upload-drop__icon" aria-hidden>
            {uploading ? <Loader2 className="h-10 w-10 animate-spin" /> : <UploadCloud className="h-10 w-10" />}
          </div>
          <p className="lobby-slideshow-upload-drop__title">
            {uploading ? `Uploading… ${uploadProgress}%` : "Drag photos or videos here"}
          </p>
          <p className="lobby-slideshow-upload-drop__hint">Single or multiple files supported.</p>
          <button type="button" className="crossover-btn crossover-btn--primary mt-4" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" />
            Choose Files
          </button>
        </label>
      </section>

      <section className="crossover-card">
        <h3 className="crossover-card__title">Active Playlist ({activeMedia.length})</h3>
        {loading ? <p className="cast-tv-admin__empty">Loading media…</p> : null}
        {!loading && !activeMedia.length ? <p className="cast-tv-admin__empty">No enabled media yet.</p> : null}
        <div className="cast-tv-admin__grid">{activeMedia.map((item, index) => renderMediaRow(item, index, activeMedia))}</div>
      </section>

      {disabledMedia.length ? (
        <section className="crossover-card">
          <h3 className="crossover-card__title">Disabled Media ({disabledMedia.length})</h3>
          <div className="cast-tv-admin__grid">{disabledMedia.map((item, index) => renderMediaRow(item, index, disabledMedia))}</div>
        </section>
      ) : null}

      {settings ? (
        <section className="crossover-card">
          <h3 className="crossover-card__title">Settings</h3>
          <div className="cast-tv-admin__settings-grid">
            <label>
              Default image duration
              <select
                value={settings.default_image_seconds}
                disabled={savingSettings}
                onChange={(event) =>
                  void saveSettings({ default_image_seconds: Number(event.target.value) as CastTvImageDuration })
                }
              >
                {CAST_TV_IMAGE_DURATION_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} seconds
                  </option>
                ))}
              </select>
            </label>
            <label>
              Transition duration (ms)
              <input
                type="number"
                min={0}
                max={5000}
                step={100}
                value={settings.transition_ms}
                disabled={savingSettings}
                onChange={(event) => void saveSettings({ transition_ms: Number(event.target.value) })}
              />
            </label>
            <label>
              Transition style
              <select
                value={settings.transition_style}
                disabled={savingSettings}
                onChange={(event) =>
                  void saveSettings({ transition_style: event.target.value as CastTvTransitionStyle })
                }
              >
                <option value="fade">Fade</option>
                <option value="crossfade">Crossfade</option>
                <option value="none">None</option>
              </select>
            </label>
            <label>
              Image display mode
              <select
                value={settings.object_fit}
                disabled={savingSettings}
                onChange={(event) => void saveSettings({ object_fit: event.target.value as "contain" | "cover" })}
              >
                <option value="contain">Contain (no crop)</option>
                <option value="cover">Cover</option>
              </select>
            </label>
            <label className="cast-tv-admin__checkbox">
              <input
                type="checkbox"
                checked={settings.show_standby_logo}
                disabled={savingSettings}
                onChange={(event) => void saveSettings({ show_standby_logo: event.target.checked })}
              />
              Show standby logo
            </label>
            <div className="cast-tv-admin__pause-row">
              <button
                type="button"
                className="crossover-btn crossover-btn--ghost"
                disabled={savingSettings}
                onClick={() => void saveSettings({ is_paused: !settings.is_paused })}
              >
                {settings.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {settings.is_paused ? "Resume slideshow" : "Pause slideshow"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleReplace(file);
        }}
      />

      <Modal open={Boolean(previewItem)} onClose={() => setPreviewItem(null)} title="Preview">
        {previewItem ? (
          <div className="cast-tv-admin__preview-modal">
            {previewItem.media_type === "video" ? (
              <video src={previewItem.public_url ?? ""} controls autoPlay muted className="cast-tv-admin__preview-media" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewItem.public_url ?? ""} alt="" className="cast-tv-admin__preview-media" />
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
