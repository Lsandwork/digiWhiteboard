"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, RefreshCw } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { UploadZone, type PendingUpload } from "@/components/admin/photo-upload-queue/UploadZone";
import {
  getPhotoBatch,
  preparePhotoExport,
  uploadPhotoFiles
} from "@/components/admin/photo-upload-queue/api";
import type { PhotoUploadBatch, PhotoUploadItem } from "@/lib/photo-upload-queue/types";

function makePendingId() {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function triggerBrowserDownload(url: string, fileName?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function BulkPhotoLibrary() {
  const { showToast } = useToast();
  const [batch, setBatch] = useState<PhotoUploadBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [canDownload, setCanDownload] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [busyDownload, setBusyDownload] = useState(false);
  const pendingRef = useRef<PendingUpload[]>([]);
  const uploadQueueRunning = useRef(false);
  const batchIdRef = useRef<string | null>(null);

  const items = batch?.items ?? [];
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const ensure = await fetch("/api/admin/photo-upload-queue?ensure_today=1", { cache: "no-store" });
      const ensureBody = await ensure.json();
      if (!ensure.ok) throw new Error(ensureBody.error || "Unable to open photo library.");
      setCanDownload(Boolean(ensureBody.permissions?.can_download));

      const todayId = String(ensureBody.today_batch?.id || "");
      if (!todayId) throw new Error("Unable to create today's photo library.");
      batchIdRef.current = todayId;
      const detail = await getPhotoBatch(todayId);
      setBatch(detail.batch);
      if ((detail as { permissions?: { can_download?: boolean } }).permissions?.can_download != null) {
        setCanDownload(Boolean((detail as { permissions?: { can_download?: boolean } }).permissions?.can_download));
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load photo library.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    pendingRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      for (const item of pendingRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const processUploadQueue = useCallback(async () => {
    if (uploadQueueRunning.current) return;
    uploadQueueRunning.current = true;
    try {
      while (true) {
        const next = pendingRef.current.find((item) => item.status === "queued");
        if (!next || !batchIdRef.current) break;

        const abort = new AbortController();
        setPendingUploads((prev) =>
          prev.map((item) =>
            item.id === next.id ? { ...item, status: "uploading", progress: 20, abort } : item
          )
        );

        try {
          const results = await uploadPhotoFiles(batchIdRef.current, [next.file], abort.signal);
          const fileResult = results[0];
          if (!fileResult?.ok) throw new Error(fileResult?.error || "Upload failed.");

          setPendingUploads((prev) =>
            prev.map((item) =>
              item.id === next.id ? { ...item, status: "done", progress: 100, error: undefined, abort: undefined } : item
            )
          );
          const detail = await getPhotoBatch(batchIdRef.current);
          setBatch(detail.batch);
        } catch (error) {
          if (abort.signal.aborted) {
            setPendingUploads((prev) =>
              prev.map((item) =>
                item.id === next.id ? { ...item, status: "cancelled", error: "Cancelled", progress: 0, abort: undefined } : item
              )
            );
          } else {
            const message = error instanceof Error ? error.message : "Upload failed.";
            setPendingUploads((prev) =>
              prev.map((item) =>
                item.id === next.id ? { ...item, status: "error", error: message, progress: 0, abort: undefined } : item
              )
            );
          }
        }
      }
    } finally {
      uploadQueueRunning.current = false;
    }
  }, []);

  function queueFiles(files: File[]) {
    if (!files.length) return;
    const next: PendingUpload[] = files.map((file) => ({
      id: makePendingId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      progress: 0
    }));
    setPendingUploads((prev) => [...next, ...prev]);
    window.setTimeout(() => void processUploadQueue(), 0);
  }

  function toggleSelect(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function downloadSelected() {
    if (!batch || !canDownload) return;
    const ids = selectedItems.length ? selectedItems.map((item) => item.id) : items.map((item) => item.id);
    if (!ids.length) {
      showToast("No photos to download.", "error");
      return;
    }
    setBusyDownload(true);
    try {
      if (ids.length === 1) {
        const only = items.find((item) => item.id === ids[0]);
        if (only?.original_url) {
          triggerBrowserDownload(only.original_url, only.original_filename);
          showToast("Download started.", "success");
          return;
        }
      }
      const result = await preparePhotoExport(batch.id, ids);
      const url = result.zip_url || result.download_url;
      if (!url) throw new Error("Download URL was not returned.");
      triggerBrowserDownload(url, result.single_file ? undefined : `${batch.batch_name || "photos"}.zip`);
      showToast(result.single_file ? "Download started." : "ZIP download started.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to download photos.", "error");
    } finally {
      setBusyDownload(false);
    }
  }

  async function downloadOne(item: PhotoUploadItem) {
    if (!canDownload) return;
    if (item.original_url) {
      triggerBrowserDownload(item.original_url, item.original_filename);
      return;
    }
    if (!batch) return;
    setBusyDownload(true);
    try {
      const result = await preparePhotoExport(batch.id, [item.id]);
      const url = result.download_url || result.zip_url;
      if (!url) throw new Error("Download URL was not returned.");
      triggerBrowserDownload(url, item.original_filename);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to download photo.", "error");
    } finally {
      setBusyDownload(false);
    }
  }

  return (
    <section className="crossover-card space-y-5 p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="admin-page-title">Bulk Photo Upload</h2>
          <p className="admin-page-subtitle mt-1 max-w-2xl">
            Upload photos in bulk and store them securely in Digi-Board.{" "}
            {canDownload
              ? "You can view and download photos one by one or as a ZIP."
              : "You can upload and view photos. Downloads are limited to Team Leads, Front Desk Coordinators, Admins, Management, and Super Admins."}
          </p>
        </div>
        <button type="button" className="admin-btn-secondary min-h-11" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <UploadZone
        disabled={loading || !batch}
        pending={pendingUploads}
        onFilesSelected={queueFiles}
        onCancel={(id) => {
          const target = pendingRef.current.find((item) => item.id === id);
          target?.abort?.abort();
          setPendingUploads((prev) =>
            prev.map((item) =>
              item.id === id && (item.status === "queued" || item.status === "uploading")
                ? { ...item, status: "cancelled", error: "Cancelled", progress: 0 }
                : item
            )
          );
        }}
        onRetry={(id) => {
          setPendingUploads((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: "queued", error: undefined, progress: 0 } : item
            )
          );
          window.setTimeout(() => void processUploadQueue(), 0);
        }}
        onRemove={(id) => {
          const target = pendingRef.current.find((item) => item.id === id);
          if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
          setPendingUploads((prev) => prev.filter((item) => item.id !== id));
        }}
      />

      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-admin-border bg-[color:var(--admin-panel,#111)]/95 p-3 backdrop-blur">
        <button
          type="button"
          className="admin-btn-secondary min-h-10"
          onClick={() => setSelectedIds(new Set(items.map((item) => item.id)))}
          disabled={!items.length}
        >
          Select all
        </button>
        <button
          type="button"
          className="admin-btn-secondary min-h-10"
          onClick={() => setSelectedIds(new Set())}
          disabled={!selectedIds.size}
        >
          Clear
        </button>
        {canDownload ? (
          <button
            type="button"
            className="admin-btn-primary min-h-10"
            onClick={() => void downloadSelected()}
            disabled={busyDownload || !items.length}
          >
            <Download className="h-4 w-4" />
            {selectedItems.length ? `Download selected (${selectedItems.length})` : "Download all"}
          </button>
        ) : (
          <span className="text-xs text-admin-muted">
            View only — downloads require Team Lead / Coordinator / Admin access.
          </span>
        )}
        <span className="ml-auto text-xs text-admin-muted">
          {items.length} photo{items.length === 1 ? "" : "s"} stored today
        </span>
      </div>

      {loading ? (
        <p className="admin-empty-state-text">Loading photo library…</p>
      ) : !items.length ? (
        <div className="rounded-xl border border-dashed border-admin-border px-4 py-10 text-center">
          <ImagePlus className="mx-auto mb-3 h-8 w-8 text-admin-muted" />
          <p className="admin-empty-state-text">No photos stored yet. Drop files above to upload.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <article
                key={item.id}
                className={`overflow-hidden rounded-xl border ${
                  selected ? "border-fitdog-orange/60" : "border-admin-border"
                }`}
              >
                <button type="button" className="block w-full" onClick={() => toggleSelect(item.id)}>
                  {item.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnail_url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-black/30 text-admin-muted">
                      <ImagePlus className="h-8 w-8" />
                    </div>
                  )}
                </button>
                <div className="space-y-2 p-3">
                  <p className="truncate text-sm font-medium text-white">{item.original_filename}</p>
                  <p className="text-xs text-admin-muted">
                    {item.file_size ? `${Math.round(item.file_size / 1024)} KB` : "Stored"}
                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ""}
                  </p>
                  {canDownload ? (
                    <button
                      type="button"
                      className="admin-btn-secondary min-h-10 w-full"
                      onClick={() => void downloadOne(item)}
                      disabled={busyDownload}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Kept for AdminDashboard / HandlerBasicPanels wiring. */
export function GingrPhotoUploadQueue() {
  return <BulkPhotoLibrary />;
}
