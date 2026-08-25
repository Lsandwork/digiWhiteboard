"use client";

import { readResponseJson } from "@/lib/http/read-response-json";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
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
import {
  CAST_TV_ADMIN_PAGE_SIZE,
  toCastTvAdminListItem,
  type CastTvAdminListItem,
  type CastTvMediaCounts
} from "@/lib/cast-tv/admin-list";
import { castTvFileThumbSrc } from "@/lib/cast-tv/thumbs";
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
const EMPTY_COUNTS: CastTvMediaCounts = { active: 0, disabled: 0, missing: 0, total: 0 };

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "—";
  return date.toLocaleString();
}

function previewSrc(item: CastTvAdminListItem) {
  if (item.media_type === "video") return item.public_url ?? "";
  if (item.public_url?.startsWith("/assets/")) return item.public_url;
  return `/api/cast-tv/media/file?id=${encodeURIComponent(item.id)}&v=${encodeURIComponent(item.updated_at)}`;
}

function uploadNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isGeneratedCastTvName(name: string) {
  const stem = (name.trim().split("/").pop() || name).replace(/\.[^.]+$/, "");
  return /^[0-9a-f]{8}[- ][0-9a-f]{4}[- ][0-9a-f]{4}[- ][0-9a-f]{4}[- ][0-9a-f]{12}$/i.test(stem);
}

function isDuplicateUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /already on CAST-TV|already exists in the CAST-TV/i.test(message);
}

function isInteractiveCastTvTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, button, select, textarea, a, label, [data-no-row-select]"));
}

function AdminThumb({ item }: { item: CastTvAdminListItem }) {
  const [src, setSrc] = useState(item.thumb_url || castTvFileThumbSrc(item));
  const [failed, setFailed] = useState(item.storage_missing === true);
  const fallbackUsed = useRef(false);

  useEffect(() => {
    setFailed(item.storage_missing === true);
    fallbackUsed.current = false;
    setSrc(item.thumb_url || castTvFileThumbSrc(item));
  }, [item.id, item.thumb_url, item.updated_at, item.storage_missing]);

  if (item.media_type === "video") {
    return (
      <div className="cast-tv-admin-card__thumb is-video" aria-hidden>
        Video
      </div>
    );
  }

  if (failed) {
    return (
      <div className="cast-tv-admin-card__thumb is-missing" aria-hidden>
        Missing file
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={item.display_name ?? item.file_name}
      className="cast-tv-admin-card__thumb"
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => {
        if (item.storage_missing || fallbackUsed.current || src.includes("fallback=1")) {
          setFailed(true);
          return;
        }
        fallbackUsed.current = true;
        setSrc(castTvFileThumbSrc(item));
      }}
    />
  );
}

type CastTvMediaRowProps = {
  item: CastTvAdminListItem;
  index: number;
  listLength: number;
  selected: boolean;
  busy: boolean;
  sortable?: boolean;
  dragHandle?: ReactNode;
  previewListeners?: Record<string, unknown>;
  style?: CSSProperties;
  className?: string;
  setNodeRef?: (node: HTMLElement | null) => void;
  onToggleSelect: (id: string, index: number, checked: boolean, shiftKey: boolean) => void;
  onRowSelect: (id: string, index: number, shiftKey: boolean) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onPreview: (item: CastTvAdminListItem) => void;
  onReplace: (id: string) => void;
  onToggleEnabled: (item: CastTvAdminListItem) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, value: string) => void;
  onDuration: (id: string, seconds: CastTvImageDuration) => void;
};

function CastTvMediaRow({
  item,
  index,
  listLength,
  selected,
  busy,
  sortable = false,
  dragHandle,
  previewListeners,
  style,
  className = "",
  setNodeRef,
  onToggleSelect,
  onRowSelect,
  onMove,
  onPreview,
  onReplace,
  onToggleEnabled,
  onDelete,
  onRename,
  onDuration
}: CastTvMediaRowProps) {
  function stopRowSelect(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`cast-tv-admin-card ${selected ? "is-selected" : ""} ${sortable ? "is-sortable" : ""} ${className}`.trim()}
      onClick={(event) => {
        if (isInteractiveCastTvTarget(event.target)) return;
        onRowSelect(item.id, index, event.shiftKey);
      }}
    >
      {dragHandle ?? <span className="cast-tv-admin-card__drag is-spacer" aria-hidden />}
      <label className="cast-tv-admin-card__select" onClick={stopRowSelect}>
        <input
          type="checkbox"
          checked={selected}
          disabled={busy}
          onChange={(event) =>
            onToggleSelect(item.id, index, event.target.checked, Boolean((event.nativeEvent as { shiftKey?: boolean }).shiftKey))
          }
          onClick={(event) => {
            if (event.shiftKey) event.preventDefault();
          }}
          aria-label={`Select ${item.display_name ?? item.file_name}`}
        />
      </label>
      <div
        className="cast-tv-admin-card__preview"
        data-no-row-select=""
        title={sortable ? "Drag to reorder" : undefined}
        {...(previewListeners ?? {})}
      >
        <AdminThumb item={item} />
      </div>
      <div className="cast-tv-admin-card__body">
        <div className="cast-tv-admin-card__title-row">
          <input
            className="cast-tv-admin-card__name-input"
            defaultValue={item.display_name ?? item.file_name}
            onClick={stopRowSelect}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== (item.display_name ?? item.file_name)) {
                onRename(item.id, value);
              }
            }}
          />
          <span className={`cast-tv-admin-card__status ${item.is_enabled ? "is-enabled" : "is-disabled"}`}>
            {item.storage_missing ? "Missing" : item.is_enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="cast-tv-admin-card__meta">
          {item.media_type.toUpperCase()} · {formatFileSize(item.file_size_bytes)} · Uploaded {formatDateTime(item.created_at)}
          {item.uploaded_by_name ? ` · ${item.uploaded_by_name}` : ""}
        </p>
        <div className="cast-tv-admin-card__controls" onClick={stopRowSelect}>
          {item.media_type === "image" ? (
            <label className="cast-tv-admin-card__duration">
              Duration
              <select
                value={item.image_display_seconds}
                disabled={busy}
                onChange={(event) => onDuration(item.id, Number(event.target.value) as CastTvImageDuration)}
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
            <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy || index === 0} onClick={() => onMove(item.id, "up")}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="crossover-btn crossover-btn--ghost"
              disabled={busy || index === listLength - 1}
              onClick={() => onMove(item.id, "down")}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => onPreview(item)}>
              <Eye className="h-4 w-4" />
            </button>
            <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => onReplace(item.id)}>
              <ImagePlus className="h-4 w-4" />
            </button>
            <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => onToggleEnabled(item)}>
              {item.is_enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => onDelete(item.id)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function CastTvSortableMediaRow(
  props: Omit<CastTvMediaRowProps, "sortable" | "dragHandle" | "previewListeners" | "style" | "className" | "setNodeRef">
) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    disabled: props.busy
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
    zIndex: isDragging ? 2 : undefined
  };

  return (
    <CastTvMediaRow
      {...props}
      sortable
      setNodeRef={setNodeRef}
      style={style}
      className={isDragging ? "is-dragging" : ""}
      previewListeners={listeners as Record<string, unknown>}
      dragHandle={
        <button
          type="button"
          className="cast-tv-admin-card__drag"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          data-no-row-select=""
          disabled={props.busy}
          aria-label={`Drag to reorder ${props.item.display_name ?? props.item.file_name}`}
          title="Drag to reorder"
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      }
    />
  );
}

export function CastTvPanel({ onToast }: CastTvPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const onToastRef = useRef(onToast);
  const mediaRevisionRef = useRef<string | null>(null);
  onToastRef.current = onToast;

  const [activeMedia, setActiveMedia] = useState<CastTvAdminListItem[]>([]);
  const [disabledMedia, setDisabledMedia] = useState<CastTvAdminListItem[]>([]);
  const [counts, setCounts] = useState<CastTvMediaCounts>(EMPTY_COUNTS);
  const [activeHasMore, setActiveHasMore] = useState(false);
  const [disabledHasMore, setDisabledHasMore] = useState(false);
  const [disabledOpen, setDisabledOpen] = useState(false);
  const [settings, setSettings] = useState<CastTvSettings | null>(null);
  const [heartbeat, setHeartbeat] = useState<{ online: boolean; last_seen_at: string | null }>({
    online: false,
    last_seen_at: null
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDisabled, setLoadingDisabled] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<CastTvAdminListItem | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const lastActiveSelectIndexRef = useRef<number | null>(null);
  const lastDisabledSelectIndexRef = useRef<number | null>(null);

  const selectedCount = selectedIds.size;
  const allActiveSelected = Boolean(activeMedia.length) && activeMedia.every((item) => selectedIds.has(item.id));
  const allDisabledSelected =
    Boolean(disabledMedia.length) && disabledMedia.every((item) => selectedIds.has(item.id));
  const activeIds = useMemo(() => activeMedia.map((item) => item.id), [activeMedia]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const knownIds = useMemo(
    () => new Set([...activeMedia, ...disabledMedia].map((item) => item.id)),
    [activeMedia, disabledMedia]
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => knownIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [knownIds]);

  const applyPage = useCallback(
    (
      status: "active" | "disabled",
      body: {
        items?: CastTvAdminListItem[];
        page?: { hasMore?: boolean };
        counts?: CastTvMediaCounts;
        mediaRevision?: string;
      },
      append: boolean
    ) => {
      const items = Array.isArray(body.items) ? body.items : [];
      if (status === "active") {
        setActiveMedia((current) => (append ? [...current, ...items.filter((item) => !current.some((row) => row.id === item.id))] : items));
        setActiveHasMore(Boolean(body.page?.hasMore));
      } else {
        setDisabledMedia((current) => (append ? [...current, ...items.filter((item) => !current.some((row) => row.id === item.id))] : items));
        setDisabledHasMore(Boolean(body.page?.hasMore));
      }
      if (body.counts) setCounts(body.counts);
      if (body.mediaRevision) mediaRevisionRef.current = body.mediaRevision;
    },
    []
  );

  const fetchMediaPage = useCallback(
    async (input: {
      status: "active" | "disabled";
      offset: number;
      append?: boolean;
      probe?: boolean;
      signal?: AbortSignal;
    }) => {
      const params = new URLSearchParams({
        status: input.status,
        limit: String(CAST_TV_ADMIN_PAGE_SIZE),
        offset: String(input.offset)
      });
      if (input.probe) params.set("probe", "1");
      const response = await fetch(`/api/cast-tv/media?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
        signal: input.signal
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error ?? "Unable to load CAST-TV media.");
      applyPage(input.status, body, Boolean(input.append));
    },
    [applyPage]
  );

  const fetchSettings = useCallback(async (signal?: AbortSignal) => {
    const settingsResponse = await fetch("/api/cast-tv/settings?heartbeat=1", {
      cache: "no-store",
      credentials: "include",
      signal
    });
    const settingsBody = await readResponseJson(settingsResponse);
    if (!settingsResponse.ok) return null;
    setSettings(settingsBody.settings ?? null);
    if (settingsBody.heartbeat) {
      setHeartbeat({
        online: Boolean(settingsBody.heartbeat.online),
        last_seen_at: settingsBody.heartbeat.last_seen_at ?? null
      });
    }
    if (typeof settingsBody.mediaRevision === "string") {
      mediaRevisionRef.current = settingsBody.mediaRevision;
      return settingsBody.mediaRevision;
    }
    return null;
  }, []);

  const reloadVisible = useCallback(
    async (signal?: AbortSignal) => {
      await fetchMediaPage({ status: "active", offset: 0, probe: true, signal });
      if (disabledOpen) {
        await fetchMediaPage({ status: "disabled", offset: 0, probe: true, signal });
      }
    },
    [disabledOpen, fetchMediaPage]
  );

  const disabledOpenRef = useRef(false);
  disabledOpenRef.current = disabledOpen;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function initialLoad() {
      try {
        const revision = await Promise.all([
          fetchSettings(controller.signal).catch(() => null),
          fetchMediaPage({ status: "active", offset: 0, probe: true, signal: controller.signal })
        ]).then(([value]) => value);
        if (revision) mediaRevisionRef.current = revision;
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        onToastRef.current(error instanceof Error ? error.message : "Unable to load CAST-TV.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialLoad();

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void (async () => {
        try {
          const revision = await fetchSettings(controller.signal);
          if (controller.signal.aborted) return;
          if (revision && mediaRevisionRef.current && revision === mediaRevisionRef.current) return;
          await fetchMediaPage({ status: "active", offset: 0, signal: controller.signal });
          if (disabledOpenRef.current) {
            await fetchMediaPage({ status: "disabled", offset: 0, signal: controller.signal });
          }
        } catch {
          /* silent poll — do not toast timeouts */
        }
      })();
    }, 30_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [fetchMediaPage, fetchSettings]);

  async function handleFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(0);
    let successCount = 0;
    let skippedCount = 0;
    const seenNames = new Set(
      [...activeMedia, ...disabledMedia]
        .map((item) => uploadNameKey(item.file_name))
        .filter((name) => name && !isGeneratedCastTvName(name))
    );

    try {
      for (const file of files) {
        const nameKey = uploadNameKey(file.name);
        if (nameKey && seenNames.has(nameKey)) {
          skippedCount += 1;
          continue;
        }
        try {
          const uploaded = await uploadCastTvMedia(file, undefined, (pct) => setUploadProgress(pct));
          successCount += 1;
          if (nameKey) seenNames.add(nameKey);
          if (uploaded?.id) {
            const now = new Date().toISOString();
            setActiveMedia((current) => {
              const nextItem: CastTvAdminListItem = {
                id: uploaded.id,
                display_name: uploaded.display_name ?? file.name,
                file_name: file.name,
                storage_path: "",
                bucket: null,
                public_url: uploaded.public_url ?? "",
                thumb_url: uploaded.public_url?.startsWith("/assets/") ? uploaded.public_url : null,
                media_type: uploaded.media_type,
                mime_type: file.type || null,
                file_size_bytes: file.size,
                image_display_seconds: 10,
                display_order: current.length + 1,
                is_enabled: true,
                uploaded_by_name: null,
                created_at: now,
                updated_at: now,
                storage_missing: false
              };
              return [nextItem, ...current.filter((item) => item.id !== uploaded.id)];
            });
          }
        } catch (error) {
          if (isDuplicateUploadError(error)) {
            skippedCount += 1;
            if (nameKey) seenNames.add(nameKey);
            continue;
          }
          throw error;
        }
      }
      if (successCount > 0) {
        onToast(
          successCount === 1 ? "Media uploaded to CAST-TV." : `Uploaded ${successCount} files to CAST-TV.`,
          "success"
        );
      }
      if (skippedCount > 0) {
        onToast(
          skippedCount === 1
            ? "Skipped a duplicate photo that is already on CAST-TV."
            : `Skipped ${skippedCount} duplicate photos that are already on CAST-TV.`,
          successCount > 0 ? "info" : "error"
        );
      }
      if (successCount > 0 || skippedCount > 0) await reloadVisible();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Upload failed.", "error");
      if (successCount > 0) await reloadVisible();
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
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error ?? "Update failed.");
      if (body.media && typeof patch.is_enabled === "boolean") {
        await reloadVisible();
      } else if (body.media) {
        const next = toCastTvAdminListItem(body.media);
        setActiveMedia((current) => current.map((item) => (item.id === id ? next : item)));
        setDisabledMedia((current) => current.map((item) => (item.id === id ? next : item)));
      }
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
      const response = await fetch(`/api/cast-tv/media/${id}`, { method: "DELETE", credentials: "include" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error ?? "Delete failed.");
      setActiveMedia((current) => current.filter((item) => item.id !== id));
      setDisabledMedia((current) => current.filter((item) => item.id !== id));
      setCounts((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        active: Math.max(0, current.active - (activeMedia.some((item) => item.id === id) ? 1 : 0)),
        disabled: Math.max(0, current.disabled - (disabledMedia.some((item) => item.id === id) ? 1 : 0))
      }));
      onToast("Media deleted.", "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Delete failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(list: "active" | "disabled", id: string, index: number, checked: boolean, shiftKey: boolean) {
    const items = list === "active" ? activeMedia : disabledMedia;
    const anchorRef = list === "active" ? lastActiveSelectIndexRef : lastDisabledSelectIndexRef;
    setSelectedIds((current) => {
      if (shiftKey && anchorRef.current !== null) {
        const start = Math.min(anchorRef.current, index);
        const end = Math.max(anchorRef.current, index);
        const next = new Set(current);
        for (let i = start; i <= end; i += 1) {
          const row = items[i];
          if (row) next.add(row.id);
        }
        return next;
      }
      anchorRef.current = index;
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleRowSelected(list: "active" | "disabled", id: string, index: number, shiftKey: boolean) {
    const items = list === "active" ? activeMedia : disabledMedia;
    const anchorRef = list === "active" ? lastActiveSelectIndexRef : lastDisabledSelectIndexRef;
    setSelectedIds((current) => {
      if (shiftKey && anchorRef.current !== null) {
        const start = Math.min(anchorRef.current, index);
        const end = Math.max(anchorRef.current, index);
        const next = new Set(current);
        for (let i = start; i <= end; i += 1) {
          const row = items[i];
          if (row) next.add(row.id);
        }
        return next;
      }
      anchorRef.current = index;
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(items: CastTvAdminListItem[], currentlyAllSelected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (currentlyAllSelected) {
        for (const item of items) next.delete(item.id);
      } else {
        for (const item of items) next.add(item.id);
      }
      return next;
    });
  }

  function toggleSelectAllActive() {
    toggleSelectAll(activeMedia, allActiveSelected);
  }

  function toggleSelectAllDisabled() {
    toggleSelectAll(disabledMedia, allDisabledSelected);
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} item${ids.length === 1 ? "" : "s"} from CAST-TV? This cannot be undone.`)) {
      return;
    }
    setBulkDeleting(true);
    try {
      const response = await fetch("/api/cast-tv/media/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids })
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error ?? "Delete failed.");
      const removed = new Set(ids);
      setActiveMedia((current) => current.filter((item) => !removed.has(item.id)));
      setDisabledMedia((current) => current.filter((item) => !removed.has(item.id)));
      setSelectedIds(new Set());
      lastActiveSelectIndexRef.current = null;
      lastDisabledSelectIndexRef.current = null;
      onToast(ids.length === 1 ? "Media deleted." : `Deleted ${ids.length} items from CAST-TV.`, "success");
      await reloadVisible();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Delete failed.", "error");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function persistActiveOrder(next: CastTvAdminListItem[], previous: CastTvAdminListItem[]) {
    setReordering(true);
    setActiveMedia(next);
    try {
      const response = await fetch("/api/cast-tv/reorder", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((item) => item.id) })
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error ?? "Reorder failed.");
    } catch (error) {
      setActiveMedia(previous);
      onToast(error instanceof Error ? error.message : "Reorder failed.", "error");
    } finally {
      setReordering(false);
    }
  }

  async function moveMedia(id: string, direction: "up" | "down", list: "active" | "disabled") {
    if (list === "disabled") {
      setBusyId(id);
      try {
        const response = await fetch("/api/cast-tv/reorder", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, direction })
        });
        const body = await readResponseJson(response);
        if (!response.ok) throw new Error(body.error ?? "Reorder failed.");
        if (disabledOpen) await fetchMediaPage({ status: "disabled", offset: 0 });
      } catch (error) {
        onToast(error instanceof Error ? error.message : "Reorder failed.", "error");
      } finally {
        setBusyId(null);
      }
      return;
    }

    const index = activeMedia.findIndex((item) => item.id === id);
    if (index < 0) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= activeMedia.length) return;
    const previous = activeMedia;
    const next = arrayMove(activeMedia, index, swapIndex);
    await persistActiveOrder(next, previous);
  }

  function handleActiveDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || reordering || bulkDeleting) return;
    const oldIndex = activeMedia.findIndex((item) => item.id === active.id);
    const newIndex = activeMedia.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const previous = activeMedia;
    const next = arrayMove(activeMedia, oldIndex, newIndex);
    void persistActiveOrder(next, previous);
  }

  async function saveSettings(patch: Partial<CastTvSettings>) {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/cast-tv/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = await readResponseJson(response);
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
      setActiveMedia((current) =>
        current.map((item) => (item.id === replaceTargetId ? { ...item, ...mediaItem, updated_at: new Date().toISOString() } : item))
      );
      setDisabledMedia((current) =>
        current.map((item) => (item.id === replaceTargetId ? { ...item, ...mediaItem, updated_at: new Date().toISOString() } : item))
      );
      onToast("Media replaced.", "success");
      await reloadVisible();
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

  async function loadMoreActive() {
    setLoadingMore(true);
    try {
      await fetchMediaPage({ status: "active", offset: activeMedia.length, append: true });
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to load more CAST-TV media.", "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMoreDisabled() {
    setLoadingMore(true);
    try {
      await fetchMediaPage({ status: "disabled", offset: disabledMedia.length, append: true });
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to load more CAST-TV media.", "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openDisabled() {
    const nextOpen = !disabledOpen;
    setDisabledOpen(nextOpen);
    if (!nextOpen || disabledMedia.length) return;
    setLoadingDisabled(true);
    try {
      await fetchMediaPage({ status: "disabled", offset: 0, probe: true });
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to load disabled CAST-TV media.", "error");
      setDisabledOpen(false);
    } finally {
      setLoadingDisabled(false);
    }
  }

  function renderMediaRow(item: CastTvAdminListItem, index: number, list: "active" | "disabled") {
    const items = list === "active" ? activeMedia : disabledMedia;
    const busy = busyId === item.id || bulkDeleting || (list === "active" && reordering);
    const shared = {
      item,
      index,
      listLength: items.length,
      selected: selectedIds.has(item.id),
      busy,
      onToggleSelect: (id: string, rowIndex: number, checked: boolean, shiftKey: boolean) =>
        toggleSelected(list, id, rowIndex, checked, shiftKey),
      onRowSelect: (id: string, rowIndex: number, shiftKey: boolean) => toggleRowSelected(list, id, rowIndex, shiftKey),
      onMove: (id: string, direction: "up" | "down") => void moveMedia(id, direction, list),
      onPreview: setPreviewItem,
      onReplace: (id: string) => {
        setReplaceTargetId(id);
        replaceInputRef.current?.click();
      },
      onToggleEnabled: (row: CastTvAdminListItem) => void patchMedia(row.id, { is_enabled: !row.is_enabled }),
      onDelete: (id: string) => void deleteMedia(id),
      onRename: (id: string, value: string) => void patchMedia(id, { display_name: value }),
      onDuration: (id: string, seconds: CastTvImageDuration) => void patchMedia(id, { image_display_seconds: seconds })
    };
    if (list === "active") {
      return <CastTvSortableMediaRow key={item.id} {...shared} />;
    }
    return <CastTvMediaRow key={item.id} {...shared} />;
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
              JPG, JPEG, PNG, WEBP, HEIC, MP4, WEBM, or MOV. Images up to 20MB, videos up to 250MB. Duplicate photos are skipped.
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
            accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.webm,.mov"
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
        <div className="cast-tv-admin__playlist-header">
          <h3 className="crossover-card__title">Active Playlist ({counts.active})</h3>
          <div className="cast-tv-admin__bulk-bar">
            <label className="cast-tv-admin__checkbox">
              <input
                type="checkbox"
                checked={allActiveSelected}
                disabled={!activeMedia.length || bulkDeleting}
                onChange={() => toggleSelectAllActive()}
              />
              Select all
            </label>
            <button
              type="button"
              className="crossover-btn crossover-btn--ghost"
              disabled={!selectedCount || bulkDeleting}
              onClick={() => void deleteSelected()}
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {selectedCount ? `Delete selected (${selectedCount})` : "Delete selected"}
            </button>
          </div>
        </div>
        <p className="cast-tv-admin__hint">
          Drag photos or videos to change play order. Click a row, then Shift-click another to select the range.
        </p>
        {loading ? <p className="cast-tv-admin__empty">Loading media…</p> : null}
        {!loading && !activeMedia.length ? <p className="cast-tv-admin__empty">No enabled media yet.</p> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActiveDragEnd}>
          <SortableContext items={activeIds} strategy={verticalListSortingStrategy}>
            <div className="cast-tv-admin__grid">{activeMedia.map((item, index) => renderMediaRow(item, index, "active"))}</div>
          </SortableContext>
        </DndContext>
        {activeHasMore ? (
          <button type="button" className="crossover-btn crossover-btn--ghost mt-4" disabled={loadingMore} onClick={() => void loadMoreActive()}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load more
          </button>
        ) : null}
      </section>

      {counts.disabled ? (
        <section className="crossover-card">
          <div className="cast-tv-admin__playlist-header">
            <h3 className="crossover-card__title">Disabled Media ({counts.disabled})</h3>
            <div className="cast-tv-admin__bulk-bar">
              <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => void openDisabled()}>
                {disabledOpen ? "Hide" : "Show"}
              </button>
              {disabledOpen ? (
                <label className="cast-tv-admin__checkbox">
                  <input
                    type="checkbox"
                    checked={allDisabledSelected}
                    disabled={bulkDeleting || !disabledMedia.length}
                    onChange={() => toggleSelectAllDisabled()}
                  />
                  Select all
                </label>
              ) : null}
              {disabledOpen ? (
                <button
                  type="button"
                  className="crossover-btn crossover-btn--ghost"
                  disabled={!selectedCount || bulkDeleting}
                  onClick={() => void deleteSelected()}
                >
                  {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {selectedCount ? `Delete selected (${selectedCount})` : "Delete selected"}
                </button>
              ) : null}
            </div>
          </div>
          {disabledOpen ? (
            <>
              {loadingDisabled ? <p className="cast-tv-admin__empty">Loading disabled media…</p> : null}
              <div className="cast-tv-admin__grid">{disabledMedia.map((item, index) => renderMediaRow(item, index, "disabled"))}</div>
              {disabledHasMore ? (
                <button type="button" className="crossover-btn crossover-btn--ghost mt-4" disabled={loadingMore} onClick={() => void loadMoreDisabled()}>
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Load more
                </button>
              ) : null}
            </>
          ) : (
            <p className="cast-tv-admin__empty">Disabled media loads only when you open this section.</p>
          )}
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
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.webm,.mov"
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
            ) : previewItem.storage_missing ? (
              <p className="cast-tv-admin__empty">This file is missing from storage.</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc(previewItem)} alt="" className="cast-tv-admin__preview-media" />
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
