"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Library, RefreshCw } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { UploadZone, type PendingUpload } from "@/components/admin/photo-upload-queue/UploadZone";
import {
  getPhotoBatch,
  preparePhotoExport,
  purgeDuplicatePhotos,
  uploadPhotoFiles
} from "@/components/admin/photo-upload-queue/api";
import { isVideoFile, uploadMediaVideoDirect } from "@/lib/media-library/upload-client";
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

export function BulkPhotoLibrary({ onOpenMediaLibrary }: { onOpenMediaLibrary?: () => void }) {
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
  /** Parallel upload workers — phones stay responsive while 50–100 photos stream. */
  const UPLOAD_CONCURRENCY = 4;
  const UPLOAD_BATCH_SIZE = 6;

  const items = batch?.items ?? [];
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Remove existing content-hash duplicates (keep oldest) before showing the gallery.
      try {
        const purged = await purgeDuplicatePhotos();
        if (purged.deleted > 0) {
          showToast(
            `Removed ${purged.deleted} duplicate photo${purged.deleted === 1 ? "" : "s"} from the library.`,
            "success"
          );
        }
      } catch {
        // Non-blocking — library still loads if purge fails.
      }

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
    let uploadedSinceRefresh = 0;
    try {
      const claimQueuedBatch = () => {
        const claimed: PendingUpload[] = [];
        const abort = new AbortController();
        pendingRef.current = pendingRef.current.map((item) => {
          if (item.status !== "queued" || claimed.length >= UPLOAD_BATCH_SIZE) return item;
          const next = { ...item, status: "uploading" as const, progress: 35, abort };
          claimed.push(next);
          return next;
        });
        if (claimed.length) {
          const ids = new Set(claimed.map((item) => item.id));
          setPendingUploads((prev) =>
            prev.map((item) => (ids.has(item.id) ? { ...item, status: "uploading", progress: 35, abort } : item))
          );
        }
        return { claimed, abort };
      };

      const runWorker = async () => {
        while (batchIdRef.current) {
          const { claimed: batchItems, abort } = claimQueuedBatch();
          if (!batchItems.length) return;

          const ids = new Set(batchItems.map((item) => item.id));

          try {
            const photoFiles = batchItems.filter((item) => !isVideoFile(item.file));
            const videoFiles = batchItems.filter((item) => isVideoFile(item.file));
            const results: Array<{
              fileName: string;
              ok: boolean;
              skipped?: boolean;
              item?: PhotoUploadItem;
              error?: string;
            }> = [];

            if (photoFiles.length) {
              const photoResults = await uploadPhotoFiles(
                batchIdRef.current,
                photoFiles.map((item) => item.file),
                abort.signal,
                { fastLibrary: true }
              );
              results.push(...photoResults);
            }

            for (const pending of videoFiles) {
              if (abort.signal.aborted) {
                results.push({ fileName: pending.file.name, ok: false, error: "Cancelled" });
                continue;
              }
              try {
                setPendingUploads((prev) =>
                  prev.map((item) =>
                    item.id === pending.id ? { ...item, status: "uploading", progress: 65 } : item
                  )
                );
                const uploaded = await uploadMediaVideoDirect(pending.file, batchIdRef.current);
                if (uploaded.skipped) {
                  results.push({
                    fileName: pending.file.name,
                    ok: true,
                    skipped: true,
                    error: uploaded.message || "Skipped duplicate video."
                  });
                } else {
                  results.push({
                    fileName: pending.file.name,
                    ok: true,
                    item: uploaded.item as PhotoUploadItem
                  });
                }
              } catch (error) {
                results.push({
                  fileName: pending.file.name,
                  ok: false,
                  error: error instanceof Error ? error.message : "Video upload failed."
                });
              }
            }

            const byName = new Map(results.map((row) => [row.fileName, row]));
            const newItems: PhotoUploadItem[] = [];
            let skippedCount = 0;
            setPendingUploads((prev) =>
              prev.map((item) => {
                if (!ids.has(item.id)) return item;
                const result =
                  byName.get(item.file.name) ||
                  results.find((row) => row.fileName === item.file.name);
                if (result?.ok && result.skipped) {
                  skippedCount += 1;
                  return {
                    ...item,
                    status: "done" as const,
                    progress: 100,
                    error: result.error || "Skipped duplicate.",
                    abort: undefined
                  };
                }
                if (result?.ok && result.item) {
                  newItems.push(result.item as PhotoUploadItem);
                  return { ...item, status: "done" as const, progress: 100, error: undefined, abort: undefined };
                }
                return {
                  ...item,
                  status: "error" as const,
                  error: result?.error || "Upload failed.",
                  progress: 0,
                  abort: undefined
                };
              })
            );
            if (skippedCount > 0) {
              showToast(
                `Skipped ${skippedCount} duplicate image${skippedCount === 1 ? "" : "s"}.`,
                "info"
              );
            }
            if (newItems.length) {
              setBatch((prev) => {
                if (!prev) return prev;
                const existing = new Set((prev.items || []).map((row) => row.id));
                const merged = [...newItems.filter((row) => !existing.has(row.id)), ...(prev.items || [])];
                return { ...prev, items: merged };
              });
              uploadedSinceRefresh += newItems.length;
            }
            // Full refresh only periodically — not after every photo.
            if (uploadedSinceRefresh >= 24 && batchIdRef.current) {
              uploadedSinceRefresh = 0;
              const detail = await getPhotoBatch(batchIdRef.current);
              setBatch(detail.batch);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Upload failed.";
            setPendingUploads((prev) =>
              prev.map((item) => {
                if (!ids.has(item.id)) return item;
                if (abort.signal.aborted) {
                  return { ...item, status: "cancelled", error: "Cancelled", progress: 0, abort: undefined };
                }
                return { ...item, status: "error", error: message, progress: 0, abort: undefined };
              })
            );
          }
        }
      };

      await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, () => runWorker()));

      if (batchIdRef.current) {
        const detail = await getPhotoBatch(batchIdRef.current);
        setBatch(detail.batch);
      }
      // Drop finished pending previews to free mobile memory.
      setPendingUploads((prev) => {
        for (const item of prev) {
          if ((item.status === "done" || item.status === "cancelled") && item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        }
        return prev.filter((item) => item.status === "queued" || item.status === "uploading" || item.status === "error");
      });
    } finally {
      uploadQueueRunning.current = false;
      // If more files were queued while workers finished, drain again.
      if (pendingRef.current.some((item) => item.status === "queued")) {
        window.setTimeout(() => void processUploadQueue(), 0);
      }
    }
  }, [showToast]);

  function queueFiles(files: File[]) {
    if (!files.length) return;
    // Limit live object-URL previews on big mobile batches to avoid memory thrash.
    const previewBudget = files.length > 24 ? 0 : 12;
    const next: PendingUpload[] = files.map((file, index) => ({
      id: makePendingId(),
      file,
      previewUrl: index < previewBudget ? URL.createObjectURL(file) : "",
      status: "queued" as const,
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
          triggerBrowserDownload(
            only.original_url.includes("?")
              ? `${only.original_url}&download=1`
              : `${only.original_url}?download=1`,
            only.original_filename
          );
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
      triggerBrowserDownload(
        item.original_url.includes("?")
          ? `${item.original_url}&download=1`
          : `${item.original_url}?download=1`,
        item.original_filename
      );
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
            Fast bulk upload for photos and videos. Original quality is preserved — we only compress thumbnails.{" "}
            {canDownload
              ? "Download one-by-one or ZIP when ready."
              : "Uploads & viewing for all staff; downloads require Team Lead / Admin access."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenMediaLibrary ? (
            <button type="button" className="admin-btn-primary min-h-11" onClick={onOpenMediaLibrary}>
              <Library className="h-4 w-4" />
              Media Library
            </button>
          ) : null}
          <button type="button" className="admin-btn-secondary min-h-11" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
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
                    <img
                      src={item.thumbnail_url}
                      alt=""
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                        const fallback = event.currentTarget.nextElementSibling;
                        if (fallback instanceof HTMLElement) fallback.hidden = false;
                      }}
                    />
                  ) : null}
                  <div
                    className={`flex aspect-square items-center justify-center bg-black/30 text-admin-muted ${
                      item.thumbnail_url ? "hidden" : ""
                    }`}
                    hidden={Boolean(item.thumbnail_url)}
                  >
                    <ImagePlus className="h-8 w-8" />
                  </div>
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
export function GingrPhotoUploadQueue({ onOpenMediaLibrary }: { onOpenMediaLibrary?: () => void }) {
  return <BulkPhotoLibrary onOpenMediaLibrary={onOpenMediaLibrary} />;
}
