"use client";

import { Download, Film, ImagePlus, Play, X } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import type { MediaLibraryItem } from "@/lib/media-library/types";

type MediaViewerModalProps = {
  item: MediaLibraryItem | null;
  canDownload: boolean;
  onClose: () => void;
};

function formatBytes(size: number | null | undefined) {
  if (!size || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function MediaViewerModal({ item, canDownload, onClose }: MediaViewerModalProps) {
  if (!item) return null;

  const isVideo = item.media_kind === "video";
  const mediaUrl = item.original_url || item.thumbnail_url || "";
  const duration = formatDuration(item.duration_seconds);

  return (
    <Modal open={Boolean(item)} title={item.original_filename} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-admin-border bg-black/40">
          {isVideo && mediaUrl ? (
            <video
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              poster={item.thumbnail_url || undefined}
              className="max-h-[70vh] w-full bg-black object-contain"
            />
          ) : mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt={item.original_filename} className="max-h-[70vh] w-full object-contain" />
          ) : (
            <div className="flex min-h-[240px] items-center justify-center text-admin-muted">
              <ImagePlus className="h-10 w-10" />
            </div>
          )}
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-admin-muted">Uploaded</dt>
            <dd>{item.created_at ? new Date(item.created_at).toLocaleString() : "—"}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Type</dt>
            <dd className="capitalize">{item.media_kind}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Size</dt>
            <dd>{formatBytes(item.file_size)}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Uploaded by</dt>
            <dd>{item.uploader_label || item.uploaded_by_name || item.photographer_name || "—"}</dd>
          </div>
          {item.service_date ? (
            <div>
              <dt className="text-admin-muted">Service date</dt>
              <dd>{item.service_date}</dd>
            </div>
          ) : null}
          {duration ? (
            <div>
              <dt className="text-admin-muted">Duration</dt>
              <dd>{duration}</dd>
            </div>
          ) : null}
        </dl>

        {canDownload && mediaUrl ? (
          <button
            type="button"
            className="admin-btn-primary min-h-11"
            onClick={() => triggerDownload(mediaUrl, item.original_filename)}
          >
            <Download className="h-4 w-4" />
            Download original
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

type MediaLibraryCardProps = {
  item: MediaLibraryItem;
  onOpen: (item: MediaLibraryItem) => void;
};

export function MediaLibraryCard({ item, onOpen }: MediaLibraryCardProps) {
  const isVideo = item.media_kind === "video";
  const duration = formatDuration(item.duration_seconds);

  return (
    <article className="overflow-hidden rounded-xl border border-admin-border bg-black/10">
      <button type="button" className="group relative block w-full" onClick={() => onOpen(item)}>
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt=""
            className="aspect-square w-full object-cover transition group-hover:opacity-90"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex aspect-square items-center justify-center bg-black/30 text-admin-muted">
            {isVideo ? <Film className="h-10 w-10" /> : <ImagePlus className="h-10 w-10" />}
          </div>
        )}
        {isVideo ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100">
            <span className="rounded-full bg-black/70 p-3 text-white">
              <Play className="h-6 w-6" />
            </span>
          </span>
        ) : null}
        {duration ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-2 py-0.5 text-xs text-white">
            {duration}
          </span>
        ) : null}
      </button>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium text-white">{item.original_filename}</p>
        <p className="text-xs text-admin-muted">
          {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
          {item.uploader_label ? ` · ${item.uploader_label}` : ""}
        </p>
      </div>
    </article>
  );
}

export function MediaLibraryEmptyState({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-admin-border px-4 py-12 text-center">
      <ImagePlus className="mx-auto mb-3 h-8 w-8 text-admin-muted" />
      <p className="admin-empty-state-text">No media matches your filters.</p>
      {onClearFilters ? (
        <button type="button" className="admin-btn-secondary mt-4 min-h-10" onClick={onClearFilters}>
          <X className="h-4 w-4" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
