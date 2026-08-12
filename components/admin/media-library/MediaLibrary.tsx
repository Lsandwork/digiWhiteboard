"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { listMediaLibrary } from "@/components/admin/media-library/api";
import { purgeDuplicatePhotos } from "@/components/admin/photo-upload-queue/api";
import {
  MediaLibraryCard,
  MediaLibraryEmptyState,
  MediaViewerModal
} from "@/components/admin/media-library/MediaLibraryParts";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { MediaDatePreset, MediaLibraryItem, MediaTypeFilter } from "@/lib/media-library/types";

const DATE_PRESETS: { id: MediaDatePreset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "older", label: "Older" },
  { id: "custom", label: "Custom" }
];

const MEDIA_FILTERS: { id: MediaTypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" }
];

export function MediaLibraryPanel() {
  const { showToast } = useToast();
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
  const [selected, setSelected] = useState<MediaLibraryItem | null>(null);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all");
  const [datePreset, setDatePreset] = useState<MediaDatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const filters = useMemo(
    () => ({ q, mediaType, datePreset, dateFrom, dateTo }),
    [dateFrom, datePreset, dateTo, mediaType, q]
  );

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        if (!append && nextPage === 1) {
          try {
            const purged = await purgeDuplicatePhotos();
            if (purged.deleted > 0) {
              showToast(
                `Removed ${purged.deleted} duplicate image${purged.deleted === 1 ? "" : "s"} from the media library.`,
                "success"
              );
            }
          } catch {
            // Non-blocking — gallery still loads if purge fails.
          }
        }

        const result = await listMediaLibrary({
          page: nextPage,
          pageSize: 48,
          q: filters.q || undefined,
          mediaType: filters.mediaType,
          datePreset: filters.datePreset,
          dateFrom: filters.datePreset === "custom" ? filters.dateFrom || undefined : undefined,
          dateTo: filters.datePreset === "custom" ? filters.dateTo || undefined : undefined
        });

        setCanDownload(Boolean(result.permissions?.can_download));
        setTotal(result.total);
        setHasMore(result.has_more);
        setPage(result.page);
        setItems((prev) => {
          if (!append) return result.items;
          const seen = new Set(prev.map((row) => row.id));
          return [...prev, ...result.items.filter((row) => !seen.has(row.id))];
        });
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load media library.", "error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, showToast]
  );

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadPage(page + 1, true);
        }
      },
      { rootMargin: "240px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadPage, loading, loadingMore, page]);

  function clearFilters() {
    setSearchInput("");
    setQ("");
    setMediaType("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <section className="crossover-card space-y-5 p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="admin-page-title">Media Library</h2>
          <p className="admin-page-subtitle mt-1 max-w-3xl">
            RuffOps cloud archive of uploaded photos and videos. Thumbnails load first; full media opens on demand.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn-secondary min-h-11"
          onClick={() => void loadPage(1, false)}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-end">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-admin-muted">Search filename</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by filename…"
              className="admin-input w-full pl-10"
            />
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-admin-muted">Media type</span>
          <select
            value={mediaType}
            onChange={(event) => setMediaType(event.target.value as MediaTypeFilter)}
            className="admin-input min-h-11"
          >
            {MEDIA_FILTERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-admin-muted">Date</span>
          <select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as MediaDatePreset)}
            className="admin-input min-h-11"
          >
            {DATE_PRESETS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {datePreset === "custom" ? (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-admin-muted">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="admin-input min-h-11"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-admin-muted">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="admin-input min-h-11"
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-admin-muted">
        <span>
          {total.toLocaleString()} item{total === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>Sorted newest to oldest</span>
        {!canDownload ? (
          <>
            <span>·</span>
            <span>View only — downloads require Team Lead / Admin access.</span>
          </>
        ) : null}
      </div>

      {loading && !items.length ? (
        <p className="admin-empty-state-text">Loading media library…</p>
      ) : !items.length ? (
        <MediaLibraryEmptyState onClearFilters={clearFilters} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <MediaLibraryCard key={item.id} item={item} onOpen={setSelected} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex min-h-10 items-center justify-center">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2 text-sm text-admin-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more…
              </span>
            ) : hasMore ? (
              <span className="text-xs text-admin-muted">Scroll for more</span>
            ) : (
              <span className="text-xs text-admin-muted">End of library</span>
            )}
          </div>
        </>
      )}

      <MediaViewerModal item={selected} canDownload={canDownload} onClose={() => setSelected(null)} />
    </section>
  );
}
