"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import type { LobbySlideshowUploadRecord } from "@/lib/lobby/slideshow-uploads";
import { uploadLobbySlideshowMedia } from "@/lib/lobby/slideshow-upload-client";

type LobbySlideshowUploadPanelProps = {
  onToast: (message: string, type?: "success" | "error" | "info") => void;
};

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LobbySlideshowUploadPanel({ onToast }: LobbySlideshowUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<LobbySlideshowUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUploads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/lobby-slideshow", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load slideshow uploads.");
      setUploads(body.uploads ?? []);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to load slideshow uploads.", "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  async function handleFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    setUploading(true);
    let successCount = 0;

    try {
      for (const file of files) {
        await uploadLobbySlideshowMedia(file);
        successCount += 1;
      }
      onToast(
        successCount === 1
          ? "Added to the lobby slideshow."
          : `Added ${successCount} items to the lobby slideshow.`,
        "success"
      );
      await loadUploads();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to upload slideshow media.", "error");
      if (successCount > 0) await loadUploads();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeUpload(id: string) {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/lobby-slideshow/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to remove upload.");
      onToast("Removed from the lobby slideshow.", "success");
      setUploads((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to remove upload.", "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="crossover-card">
        <div className="crossover-card__header">
          <div>
            <p className="crossover-card__eyebrow">Lobby Slideshow</p>
            <h2 className="crossover-card__title">Upload Photos & Videos</h2>
            <p className="crossover-card__subtitle">
              Drop files here to add them to the lobby digital whiteboard slideshow. Uploads are appended to the existing
              slideshow — nothing is replaced.
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
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <div className="lobby-slideshow-upload-drop__icon" aria-hidden>
            {uploading ? <Loader2 className="h-10 w-10 animate-spin" /> : <UploadCloud className="h-10 w-10" />}
          </div>
          <p className="lobby-slideshow-upload-drop__title">
            {uploading ? "Uploading to slideshow…" : "Drag photos or videos here"}
          </p>
          <p className="lobby-slideshow-upload-drop__hint">
            JPG, PNG, WebP, GIF, MP4, WebM, or MOV. Photos up to 15MB, videos up to 100MB.
          </p>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary mt-4"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            Choose Files
          </button>
        </label>
      </section>

      <section className="crossover-card">
        <div className="crossover-card__header">
          <div>
            <h3 className="crossover-card__title">Your Slideshow Uploads</h3>
            <p className="crossover-card__subtitle">
              These play after the built-in Fitdog slides on the lobby whiteboard.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-admin-muted">Loading uploads…</p>
        ) : uploads.length ? (
          <div className="lobby-slideshow-upload-grid">
            {uploads.map((upload) => (
              <article key={upload.id} className="lobby-slideshow-upload-card">
                <div className="lobby-slideshow-upload-card__preview">
                  {upload.media_type === "video" ? (
                    <video src={upload.media_url} muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={upload.media_url} alt={upload.title} />
                  )}
                </div>
                <div className="lobby-slideshow-upload-card__meta">
                  <p className="lobby-slideshow-upload-card__title">{upload.title}</p>
                  <p className="lobby-slideshow-upload-card__detail">
                    {upload.media_type === "video" ? "Video" : "Photo"}
                    {upload.file_size_bytes ? ` • ${formatFileSize(upload.file_size_bytes)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="crossover-btn crossover-btn--ghost lobby-slideshow-upload-card__delete"
                  disabled={deletingId === upload.id}
                  onClick={() => void removeUpload(upload.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingId === upload.id ? "Removing…" : "Remove"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-admin-muted">No uploads yet. Add photos or videos above to start building the slideshow.</p>
        )}
      </section>
    </div>
  );
}
