"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  ImagePlus,
  Package,
  Plus,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { Modal } from "@/components/admin/ui/Modal";
import {
  createPhotoBatch,
  emptyBatchCounts,
  fetchCheckedInDogs,
  getPhotoBatch,
  listPhotoBatches,
  markPhotosUploaded,
  patchPhotoItems,
  preparePhotoExport,
  reopenPhotoBatch,
  updatePhotoBatch,
  uploadPhotoFiles,
  type DogAssignmentPayload
} from "@/components/admin/photo-upload-queue/api";
import { BatchHistoryList } from "@/components/admin/photo-upload-queue/BatchHistoryList";
import { DogPicker } from "@/components/admin/photo-upload-queue/DogPicker";
import { PhotoReviewModal } from "@/components/admin/photo-upload-queue/PhotoReviewModal";
import {
  DuplicateWarningBadge,
  PhotoBatchStatusBadge,
  PhotoItemStatusBadge
} from "@/components/admin/photo-upload-queue/StatusBadge";
import { TransferToGingrPanel } from "@/components/admin/photo-upload-queue/TransferToGingrPanel";
import { UploadZone, type PendingUpload } from "@/components/admin/photo-upload-queue/UploadZone";
import {
  getGingrBulkPhotoUrl,
  suggestedBatchName,
  type PhotoUploadBatch,
  type PhotoUploadCheckedInDog,
  type PhotoUploadExport,
  type PhotoUploadItem,
  type PhotoUploadOption
} from "@/lib/photo-upload-queue/types";

const DOGS_WARNING =
  "Checked-in dogs could not be loaded from Gingr. You can still enter dog names manually.";

const MARK_UPLOADED_COPY =
  "Confirm that these photos were successfully transferred into Gingr. This action records the upload but does not upload files to Gingr automatically.";

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function optionLabel(options: PhotoUploadOption[], key: string | null | undefined) {
  if (!key) return "—";
  return options.find((option) => option.key === key)?.label ?? key;
}

function isBatchLocked(status: PhotoUploadBatch["status"]) {
  return status === "uploaded_to_gingr" || status === "archived";
}

function makePendingId() {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function GingrPhotoUploadQueue() {
  const { showToast } = useToast();
  const gingrUrl = useMemo(() => getGingrBulkPhotoUrl(), []);

  const [view, setView] = useState<"history" | "batch">("history");
  const [batches, setBatches] = useState<PhotoUploadBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "",
    photographer: "",
    service_date_from: "",
    service_date_to: "",
    q: ""
  });

  const [categories, setCategories] = useState<PhotoUploadOption[]>([]);
  const [yards, setYards] = useState<PhotoUploadOption[]>([]);
  const [batch, setBatch] = useState<PhotoUploadBatch | null>(null);
  const [exports, setExports] = useState<PhotoUploadExport[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const [meta, setMeta] = useState({
    service_date: todayIsoDate(),
    batch_name: "",
    photographer_name: "",
    default_yard: "big_side",
    default_category: "daycare",
    internal_note: ""
  });
  const [nameTouched, setNameTouched] = useState(false);
  const [defaultPhotographer, setDefaultPhotographer] = useState("");
  const [canReopen, setCanReopen] = useState(false);
  const [actorName, setActorName] = useState("Staff");

  const [checkedInDogs, setCheckedInDogs] = useState<PhotoUploadCheckedInDog[]>([]);
  const [dogsWarning, setDogsWarning] = useState<string | null>(null);
  const [recentDogs, setRecentDogs] = useState<PhotoUploadCheckedInDog[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const pendingRef = useRef<PendingUpload[]>([]);
  const uploadQueueRunning = useRef(false);
  const batchIdRef = useRef<string | null>(null);

  const [reviewItemId, setReviewItemId] = useState<string | null>(null);
  const [bulkDogsOpen, setBulkDogsOpen] = useState(false);
  const [bulkDogs, setBulkDogs] = useState<DogAssignmentPayload[]>([]);
  const [bulkFieldOpen, setBulkFieldOpen] = useState<"yard" | "category" | "photographer" | null>(null);
  const [bulkFieldValue, setBulkFieldValue] = useState("");
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excludeReason, setExcludeReason] = useState("");
  const [markUploadedOpen, setMarkUploadedOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [exportNotReadyOpen, setExportNotReadyOpen] = useState(false);
  const [exportReadyIds, setExportReadyIds] = useState<string[]>([]);
  const [latestDownload, setLatestDownload] = useState<PhotoUploadExport | null>(null);

  useEffect(() => {
    pendingRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    batchIdRef.current = batch?.id ?? null;
  }, [batch?.id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [sessionRes, profileRes] = await Promise.all([
          fetch("/api/admin/session", { cache: "no-store" }),
          fetch("/api/admin/profile", { cache: "no-store" })
        ]);
        if (!active) return;
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const role = String(session.role ?? "");
          const permissions: string[] = session.access?.permissions ?? [];
          setCanReopen(role === "super_admin" || permissions.includes("reopen_photo_upload_batches"));
        }
        if (profileRes.ok) {
          const profile = await profileRes.json();
          const name = String(profile.fullName ?? "").trim();
          if (name) {
            setDefaultPhotographer(name);
            setActorName(name);
            setMeta((current) =>
              current.photographer_name
                ? current
                : {
                    ...current,
                    photographer_name: name,
                    batch_name: current.batch_name || suggestedBatchName(current.service_date, name)
                  }
            );
          }
        }
      } catch {
        // non-blocking
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await listPhotoBatches({
        status: filters.status || undefined,
        photographer: filters.photographer || undefined,
        service_date_from: filters.service_date_from || undefined,
        service_date_to: filters.service_date_to || undefined,
        q: filters.q || undefined,
        page_size: 50
      });
      setBatches(data.batches ?? []);
      if (data.categories?.length) setCategories(data.categories);
      if (data.yards?.length) setYards(data.yards);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load upload history.", "error");
      setBatches([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [filters, showToast]);

  useEffect(() => {
    if (view !== "history") return;
    const timer = window.setTimeout(() => {
      void loadHistory();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [view, loadHistory]);

  const loadBatch = useCallback(
    async (batchId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setBatchLoading(true);
      try {
        const data = await getPhotoBatch(batchId);
        setBatch(data.batch);
        setExports(data.exports ?? []);
        if (data.categories?.length) setCategories(data.categories);
        if (data.yards?.length) setYards(data.yards);
        setMeta({
          service_date: data.batch.service_date,
          batch_name: data.batch.batch_name,
          photographer_name: data.batch.photographer_name,
          default_yard: data.batch.default_yard,
          default_category: data.batch.default_category,
          internal_note: data.batch.internal_note ?? ""
        });
        setNameTouched(true);
        const latest = (data.exports ?? []).slice().sort((a, b) => b.export_number - a.export_number)[0] ?? null;
        if (latest) setLatestDownload(latest);
        setView("batch");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load batch.", "error");
      } finally {
        if (!opts?.silent) setBatchLoading(false);
      }
    },
    [showToast]
  );

  const loadDogs = useCallback(async (serviceDate: string) => {
    try {
      const data = await fetchCheckedInDogs(serviceDate);
      setCheckedInDogs(data.dogs ?? []);
      setDogsWarning(data.warning || null);
    } catch {
      setCheckedInDogs([]);
      setDogsWarning(DOGS_WARNING);
    }
  }, []);

  useEffect(() => {
    if (view !== "batch" || !meta.service_date) return;
    void loadDogs(meta.service_date);
  }, [view, meta.service_date, loadDogs]);

  useEffect(() => {
    if (nameTouched) return;
    setMeta((current) => ({
      ...current,
      batch_name: suggestedBatchName(current.service_date, current.photographer_name || defaultPhotographer || "Photographer")
    }));
  }, [meta.service_date, meta.photographer_name, defaultPhotographer, nameTouched]);

  const items = batch?.items ?? [];
  const counts = batch?.counts ?? emptyBatchCounts();
  const locked = batch ? isBatchLocked(batch.status) : false;
  const showTransfer =
    Boolean(batch) &&
    (batch!.status === "exported" ||
      batch!.status === "partially_uploaded" ||
      batch!.status === "uploaded_to_gingr" ||
      Boolean(latestDownload));

  const reviewItem = useMemo(
    () => items.find((item) => item.id === reviewItemId) ?? null,
    [items, reviewItemId]
  );

  function rememberDogs(dogs: DogAssignmentPayload[]) {
    const mapped: PhotoUploadCheckedInDog[] = dogs
      .filter((dog) => dog.gingr_pet_id)
      .map((dog) => ({
        dogId: dog.gingr_pet_id!,
        dogName: dog.dog_name,
        ownerName: dog.owner_name ?? undefined,
        dogPhotoUrl: dog.dog_photo_url ?? undefined,
        status: "checked_in",
        displayStatus: "Checked in",
        reservationType: dog.reservation_type ?? undefined,
        gingrAnimalId: dog.gingr_pet_id ?? undefined
      }));
    if (!mapped.length) return;
    setRecentDogs((current) => {
      const next = [...mapped, ...current];
      const seen = new Set<string>();
      return next.filter((dog) => {
        if (seen.has(dog.dogId)) return false;
        seen.add(dog.dogId);
        return true;
      }).slice(0, 8);
    });
  }

  async function startNewBatch() {
    const photographer = meta.photographer_name.trim() || defaultPhotographer || "Photographer";
    const serviceDate = meta.service_date || todayIsoDate();
    const payload = {
      service_date: serviceDate,
      photographer_name: photographer,
      batch_name: meta.batch_name.trim() || suggestedBatchName(serviceDate, photographer),
      default_yard: meta.default_yard || "big_side",
      default_category: meta.default_category || "daycare",
      internal_note: meta.internal_note.trim() || null
    };
    setBusyAction(true);
    try {
      const created = await createPhotoBatch(payload);
      setSelectedIds(new Set());
      setPendingUploads([]);
      setLatestDownload(null);
      setExports([]);
      await loadBatch(created.id);
      showToast("Batch created.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create batch.", "error");
    } finally {
      setBusyAction(false);
    }
  }

  async function saveBatchMeta() {
    if (!batch || locked) return;
    setSavingMeta(true);
    try {
      const updated = await updatePhotoBatch(batch.id, {
        batch_name: meta.batch_name.trim(),
        service_date: meta.service_date,
        photographer_name: meta.photographer_name.trim(),
        default_yard: meta.default_yard,
        default_category: meta.default_category,
        internal_note: meta.internal_note.trim() || null
      });
      setBatch((current) => (current ? { ...current, ...updated, items: current.items, counts: current.counts } : updated));
      showToast("Batch details saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save batch.", "error");
    } finally {
      setSavingMeta(false);
    }
  }

  function updatePending(id: string, patch: Partial<PendingUpload>) {
    setPendingUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function processUploadQueue() {
    if (uploadQueueRunning.current || !batchIdRef.current) return;
    uploadQueueRunning.current = true;
    try {
      while (true) {
        const activeBatchId = batchIdRef.current;
        const next = pendingRef.current.find((item) => item.status === "queued");
        if (!next || !activeBatchId) break;
        const controller = new AbortController();
        updatePending(next.id, { status: "uploading", progress: 15, abort: controller, error: undefined });
        const progressTimer = window.setInterval(() => {
          setPendingUploads((current) =>
            current.map((item) =>
              item.id === next.id && item.status === "uploading"
                ? { ...item, progress: Math.min(90, item.progress + 8) }
                : item
            )
          );
        }, 400);
        try {
          const results = await uploadPhotoFiles(activeBatchId, [next.file], controller.signal);
          clearInterval(progressTimer);
          const result = results[0];
          if (!result?.ok) {
            updatePending(next.id, {
              status: "error",
              progress: 100,
              error: result?.error || "Upload failed",
              abort: undefined
            });
            continue;
          }
          updatePending(next.id, { status: "done", progress: 100, abort: undefined });
          await loadBatch(activeBatchId, { silent: true });
        } catch (error) {
          clearInterval(progressTimer);
          if (controller.signal.aborted) {
            updatePending(next.id, { status: "cancelled", progress: 0, abort: undefined, error: "Cancelled" });
          } else {
            updatePending(next.id, {
              status: "error",
              progress: 100,
              abort: undefined,
              error: error instanceof Error ? error.message : "Upload failed"
            });
          }
        }
      }
    } finally {
      uploadQueueRunning.current = false;
      setPendingUploads((current) => current.filter((item) => item.status !== "done"));
    }
  }

  function enqueueFiles(files: File[]) {
    if (!batch || locked) {
      showToast("Create or open a batch before uploading photos.", "info");
      return;
    }
    const next: PendingUpload[] = files.map((file) => ({
      id: makePendingId(),
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: "queued"
    }));
    setPendingUploads((current) => [...current, ...next]);
    window.setTimeout(() => void processUploadQueue(), 0);
  }

  function cancelPending(id: string) {
    const item = pendingRef.current.find((entry) => entry.id === id);
    item?.abort?.abort();
    updatePending(id, { status: "cancelled", progress: 0, abort: undefined });
  }

  function retryPending(id: string) {
    updatePending(id, { status: "queued", progress: 0, error: undefined });
    window.setTimeout(() => void processUploadQueue(), 0);
  }

  function removePending(id: string) {
    setPendingUploads((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  useEffect(() => {
    return () => {
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }

  async function applyBulkPatch(patch: Parameters<typeof patchPhotoItems>[1]) {
    if (!batch || locked) return;
    setBusyAction(true);
    try {
      const result = await patchPhotoItems(batch.id, patch);
      if (result.batch) {
        setBatch(result.batch);
      } else {
        await loadBatch(batch.id, { silent: true });
      }
      if (patch.dogs?.length) rememberDogs(patch.dogs);
      showToast("Photos updated.", "success");
      setSelectedIds(new Set());
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update photos.", "error");
    } finally {
      setBusyAction(false);
    }
  }

  async function handlePrepareExport(onlyReadyIds?: string[]) {
    if (!batch || locked) return;
    const targetIds = onlyReadyIds?.length
      ? onlyReadyIds
      : selectedIds.size
        ? Array.from(selectedIds)
        : items.filter((item) => item.status === "ready_for_gingr").map((item) => item.id);

    if (!onlyReadyIds) {
      const selectedItems = targetIds.length
        ? items.filter((item) => targetIds.includes(item.id))
        : items;
      const ready = selectedItems.filter((item) => item.status === "ready_for_gingr").map((item) => item.id);
      const notReady = selectedItems.filter((item) => item.status !== "ready_for_gingr");
      if (!ready.length) {
        showToast("No photos are ready for Gingr yet.", "error");
        return;
      }
      if (notReady.length) {
        setExportReadyIds(ready);
        setExportNotReadyOpen(true);
        return;
      }
      targetIds.splice(0, targetIds.length, ...ready);
    }

    setBusyAction(true);
    try {
      const result = await preparePhotoExport(batch.id, targetIds);
      if (result.batch) setBatch(result.batch);
      else await loadBatch(batch.id, { silent: true });
      const exportRecord = result.export
        ? {
            ...result.export,
            zip_url: result.download_url || result.zip_url || result.export.zip_url || null
          }
        : null;
      if (exportRecord) {
        setLatestDownload(exportRecord);
        setExports((current) => [exportRecord, ...current.filter((item) => item.id !== exportRecord.id)]);
      }
      if (exportRecord?.zip_url) {
        window.open(exportRecord.zip_url, "_blank", "noopener,noreferrer");
      }
      showToast("Gingr upload package prepared.", "success");
      setExportNotReadyOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to prepare export.", "error");
    } finally {
      setBusyAction(false);
    }
  }

  async function confirmMarkUploaded() {
    if (!batch) return;
    setBusyAction(true);
    try {
      const updated = await markPhotosUploaded(batch.id, {
        confirm: true,
        export_id: latestDownload?.id,
        item_ids: selectedIds.size ? Array.from(selectedIds) : undefined
      });
      setBatch((current) => (current ? { ...current, ...updated, items: current.items, counts: updated.counts ?? current.counts } : updated));
      await loadBatch(batch.id, { silent: true });
      showToast("Batch marked as uploaded to Gingr.", "success");
      setMarkUploadedOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to mark uploaded.", "error");
    } finally {
      setBusyAction(false);
    }
  }

  async function confirmReopen() {
    if (!batch || !reopenReason.trim()) return;
    setBusyAction(true);
    try {
      await reopenPhotoBatch(batch.id, reopenReason.trim());
      await loadBatch(batch.id, { silent: true });
      showToast("Batch reopened.", "success");
      setReopenOpen(false);
      setReopenReason("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to reopen batch.", "error");
    } finally {
      setBusyAction(false);
    }
  }

  const summaryCards = [
    { id: "total", label: "Total", value: counts.total },
    { id: "processing", label: "Processing", value: counts.processing },
    { id: "needs_assignment", label: "Needs assignment", value: counts.needs_dog_assignment },
    { id: "needs_review", label: "Needs review", value: counts.needs_review },
    { id: "ready", label: "Ready", value: counts.ready_for_gingr },
    { id: "uploaded", label: "Uploaded", value: counts.uploaded_to_gingr },
    { id: "excluded", label: "Excluded", value: counts.excluded },
    { id: "failed", label: "Failed", value: counts.failed }
  ];

  return (
    <div className="space-y-5">
      <section className="crossover-card p-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <ImagePlus className="mt-1 h-5 w-5 shrink-0 text-fitdog-orange" />
            <div>
              <h2 className="admin-page-title">Gingr Photo Upload Queue</h2>
              <p className="admin-page-subtitle">
                Upload, organize, prepare, and track report-card photos before transferring them into Gingr.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {view === "batch" ? (
              <button
                type="button"
                className="admin-btn-secondary min-h-11"
                onClick={() => {
                  setView("history");
                  setBatch(null);
                  setSelectedIds(new Set());
                  void loadHistory();
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Upload History
              </button>
            ) : null}
            <button type="button" className="admin-btn-primary min-h-11" onClick={() => void startNewBatch()} disabled={busyAction}>
              <Plus className="h-4 w-4" />
              New Batch
            </button>
            <a href={gingrUrl} target="_blank" rel="noopener noreferrer" className="admin-btn-secondary min-h-11">
              <ExternalLink className="h-4 w-4" />
              Open Gingr
            </a>
          </div>
        </header>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            This tool prepares and tracks photo batches for Gingr. Photos must still be transferred through Gingr’s Bulk
            Photo Upload page.
          </p>
        </div>
      </section>

      {view === "history" ? (
        <BatchHistoryList
          batches={batches}
          loading={historyLoading}
          filters={filters}
          onFiltersChange={setFilters}
          onOpenBatch={(batchId) => void loadBatch(batchId)}
        />
      ) : null}

      {view === "batch" ? (
        <>
          {batchLoading && !batch ? (
            <section className="crossover-card p-5">
              <p className="admin-empty-state-text">Loading batch…</p>
            </section>
          ) : null}

          {batch ? (
            <>
              <section className="crossover-card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">Batch details</h3>
                    <div className="mt-2">
                      <PhotoBatchStatusBadge status={batch.status} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canReopen && locked ? (
                      <button type="button" className="admin-btn-secondary min-h-11" onClick={() => setReopenOpen(true)}>
                        <RefreshCw className="h-4 w-4" />
                        Reopen batch
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-btn-primary min-h-11"
                      onClick={() => void saveBatchMeta()}
                      disabled={savingMeta || locked}
                    >
                      {savingMeta ? "Saving…" : "Save details"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      Service date
                    </span>
                    <input
                      type="date"
                      className="admin-input w-full"
                      value={meta.service_date}
                      disabled={locked}
                      onChange={(e) => setMeta((current) => ({ ...current, service_date: e.target.value }))}
                    />
                  </label>
                  <label className="block md:col-span-2 xl:col-span-2">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      Batch name
                    </span>
                    <input
                      className="admin-input w-full"
                      value={meta.batch_name}
                      disabled={locked}
                      onChange={(e) => {
                        setNameTouched(true);
                        setMeta((current) => ({ ...current, batch_name: e.target.value }));
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      Photographer
                    </span>
                    <input
                      className="admin-input w-full"
                      value={meta.photographer_name}
                      disabled={locked}
                      onChange={(e) => setMeta((current) => ({ ...current, photographer_name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      Default yard
                    </span>
                    <select
                      className="admin-input w-full"
                      value={meta.default_yard}
                      disabled={locked}
                      onChange={(e) => setMeta((current) => ({ ...current, default_yard: e.target.value }))}
                    >
                      {yards.map((option) => (
                        <option key={option.id} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                      {!yards.length ? <option value="big_side">Big Side</option> : null}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      Default category
                    </span>
                    <select
                      className="admin-input w-full"
                      value={meta.default_category}
                      disabled={locked}
                      onChange={(e) => setMeta((current) => ({ ...current, default_category: e.target.value }))}
                    >
                      {categories.map((option) => (
                        <option key={option.id} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                      {!categories.length ? <option value="daycare">Daycare</option> : null}
                    </select>
                  </label>
                  <label className="block md:col-span-2 xl:col-span-3">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">
                      Internal note
                    </span>
                    <textarea
                      className="admin-input min-h-20 w-full"
                      value={meta.internal_note}
                      disabled={locked}
                      onChange={(e) => setMeta((current) => ({ ...current, internal_note: e.target.value }))}
                    />
                  </label>
                </div>

                {dogsWarning ? (
                  <p className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    {dogsWarning === DOGS_WARNING || dogsWarning.includes("could not")
                      ? DOGS_WARNING
                      : dogsWarning}
                  </p>
                ) : null}
              </section>

              {!locked ? (
                <section className="crossover-card p-5">
                  <h3 className="mb-3 text-lg font-bold text-white">Upload photos</h3>
                  <UploadZone
                    pending={pendingUploads}
                    onFilesSelected={enqueueFiles}
                    onCancel={cancelPending}
                    onRetry={retryPending}
                    onRemove={removePending}
                  />
                </section>
              ) : null}

              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
                {summaryCards.map((card) => (
                  <article key={card.id} className="crossover-card p-3 text-center">
                    <p className="text-2xl font-extrabold text-white">{card.value}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-admin-muted">{card.label}</p>
                  </article>
                ))}
              </section>

              <div className="sticky top-2 z-20 rounded-2xl border border-admin-border bg-[rgba(28,20,14,0.94)] p-3 shadow-lg backdrop-blur">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="admin-btn-secondary min-h-11" onClick={selectAllVisible} disabled={!items.length}>
                    Select all
                  </button>
                  <button
                    type="button"
                    className="admin-btn-secondary min-h-11"
                    disabled={!selectedIds.size || locked || busyAction}
                    onClick={() => {
                      setBulkDogs([]);
                      setBulkDogsOpen(true);
                    }}
                  >
                    Bulk assign dogs
                  </button>
                  <button
                    type="button"
                    className="admin-btn-secondary min-h-11"
                    disabled={!selectedIds.size || locked || busyAction}
                    onClick={() => {
                      setBulkFieldValue(meta.default_yard);
                      setBulkFieldOpen("yard");
                    }}
                  >
                    Set yard
                  </button>
                  <button
                    type="button"
                    className="admin-btn-secondary min-h-11"
                    disabled={!selectedIds.size || locked || busyAction}
                    onClick={() => {
                      setBulkFieldValue(meta.default_category);
                      setBulkFieldOpen("category");
                    }}
                  >
                    Set category
                  </button>
                  <button
                    type="button"
                    className="admin-btn-secondary min-h-11"
                    disabled={!selectedIds.size || locked || busyAction}
                    onClick={() => {
                      setBulkFieldValue(meta.photographer_name);
                      setBulkFieldOpen("photographer");
                    }}
                  >
                    Set photographer
                  </button>
                  <button
                    type="button"
                    className="admin-btn-secondary min-h-11"
                    disabled={!selectedIds.size || locked || busyAction}
                    onClick={() => {
                      setExcludeReason("");
                      setExcludeOpen(true);
                    }}
                  >
                    Exclude
                  </button>
                  <button
                    type="button"
                    className="admin-btn-primary min-h-11"
                    disabled={locked || busyAction}
                    onClick={() => void handlePrepareExport()}
                  >
                    <Package className="h-4 w-4" />
                    Prepare Gingr Upload
                  </button>
                </div>
                {selectedIds.size ? (
                  <p className="mt-2 text-xs text-admin-muted">{selectedIds.size} photo(s) selected</p>
                ) : null}
              </div>

              <section className="crossover-card p-5">
                {!items.length ? (
                  <p className="admin-empty-state-text">No photos in this batch yet. Upload images to get started.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {items.map((item) => (
                      <PhotoGridCard
                        key={item.id}
                        item={item}
                        selected={selectedIds.has(item.id)}
                        yards={yards}
                        categories={categories}
                        onToggle={() => toggleSelected(item.id)}
                        onOpen={() => setReviewItemId(item.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {showTransfer ? (
                <TransferToGingrPanel
                  batch={batch}
                  latestExport={latestDownload}
                  gingrUrl={gingrUrl}
                  disabled={busyAction || batch.status === "uploaded_to_gingr"}
                  onMarkUploaded={() => setMarkUploadedOpen(true)}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      <PhotoReviewModal
        open={Boolean(reviewItem)}
        item={reviewItem}
        yards={yards}
        categories={categories}
        dogs={checkedInDogs}
        dogsWarning={dogsWarning}
        recentlySelected={recentDogs}
        busy={busyAction}
        readOnly={locked}
        onClose={() => setReviewItemId(null)}
        onSave={(patch) => {
          if (!batch || !reviewItem) return;
          void (async () => {
            await applyBulkPatch({
              item_ids: [reviewItem.id],
              yard: patch.yard,
              category: patch.category,
              photographer_name: patch.photographer_name,
              internal_note: patch.internal_note,
              dogs: patch.dogs,
              duplicate_override: patch.duplicate_override,
              exclude: patch.exclude,
              excluded_reason: patch.excluded_reason
            });
            setReviewItemId(null);
          })();
        }}
      />

      <Modal
        open={bulkDogsOpen}
        title="Bulk assign dogs"
        description={`Assign dogs to ${selectedIds.size} selected photo(s).`}
        onClose={() => setBulkDogsOpen(false)}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => setBulkDogsOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={!bulkDogs.length || busyAction}
              onClick={() => {
                void applyBulkPatch({
                  item_ids: Array.from(selectedIds),
                  dogs: bulkDogs.map((dog) => ({ ...dog, assignment_source: "bulk" as const }))
                }).then(() => setBulkDogsOpen(false));
              }}
            >
              Assign
            </button>
          </div>
        }
      >
        <DogPicker
          dogs={checkedInDogs}
          selected={bulkDogs}
          onChange={setBulkDogs}
          warning={dogsWarning}
          recentlySelected={recentDogs}
        />
      </Modal>

      <Modal
        open={Boolean(bulkFieldOpen)}
        title={
          bulkFieldOpen === "yard"
            ? "Set yard"
            : bulkFieldOpen === "category"
              ? "Set category"
              : "Set photographer"
        }
        onClose={() => setBulkFieldOpen(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => setBulkFieldOpen(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={busyAction || !bulkFieldValue.trim()}
              onClick={() => {
                const ids = Array.from(selectedIds);
                const patch =
                  bulkFieldOpen === "yard"
                    ? { item_ids: ids, yard: bulkFieldValue }
                    : bulkFieldOpen === "category"
                      ? { item_ids: ids, category: bulkFieldValue }
                      : { item_ids: ids, photographer_name: bulkFieldValue };
                void applyBulkPatch(patch).then(() => setBulkFieldOpen(null));
              }}
            >
              Apply
            </button>
          </div>
        }
      >
        {bulkFieldOpen === "yard" ? (
          <select className="admin-input w-full" value={bulkFieldValue} onChange={(e) => setBulkFieldValue(e.target.value)}>
            {yards.map((option) => (
              <option key={option.id} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        {bulkFieldOpen === "category" ? (
          <select className="admin-input w-full" value={bulkFieldValue} onChange={(e) => setBulkFieldValue(e.target.value)}>
            {categories.map((option) => (
              <option key={option.id} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        {bulkFieldOpen === "photographer" ? (
          <input className="admin-input w-full" value={bulkFieldValue} onChange={(e) => setBulkFieldValue(e.target.value)} />
        ) : null}
      </Modal>

      <Modal
        open={excludeOpen}
        title="Exclude photos"
        description={`Exclude ${selectedIds.size} selected photo(s) from the Gingr upload.`}
        onClose={() => setExcludeOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => setExcludeOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn-danger"
              disabled={busyAction}
              onClick={() => {
                void applyBulkPatch({
                  item_ids: Array.from(selectedIds),
                  exclude: true,
                  excluded_reason: excludeReason.trim() || "Excluded by staff"
                }).then(() => setExcludeOpen(false));
              }}
            >
              Exclude
            </button>
          </div>
        }
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Reason</span>
          <input
            className="admin-input w-full"
            value={excludeReason}
            onChange={(e) => setExcludeReason(e.target.value)}
            placeholder="Optional reason"
          />
        </label>
      </Modal>

      <ConfirmDialog
        open={exportNotReadyOpen}
        title="Some photos are not ready"
        description="Some selected photos are not ready for Gingr. Continue with only the ready photos?"
        confirmLabel="Continue with ready photos"
        busy={busyAction}
        onCancel={() => setExportNotReadyOpen(false)}
        onConfirm={() => void handlePrepareExport(exportReadyIds)}
      />

      <Modal
        open={markUploadedOpen}
        title="Mark as Uploaded to Gingr"
        description={MARK_UPLOADED_COPY}
        onClose={() => setMarkUploadedOpen(false)}
        closeOnBackdrop={!busyAction}
        closeOnEscape={!busyAction}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="admin-btn-secondary" disabled={busyAction} onClick={() => setMarkUploadedOpen(false)}>
              Cancel
            </button>
            <button type="button" className="admin-btn-primary" disabled={busyAction} onClick={() => void confirmMarkUploaded()}>
              {busyAction ? "Saving…" : "Confirm uploaded"}
            </button>
          </div>
        }
      >
        {batch ? (
          <div className="space-y-2 text-sm text-admin-muted">
            <p>
              <span className="font-semibold text-white">Batch:</span> {batch.batch_name}
            </p>
            <p>
              <span className="font-semibold text-white">Photos:</span>{" "}
              {selectedIds.size || latestDownload?.total_items || counts.included_in_export || counts.total}
            </p>
            <p>
              <span className="font-semibold text-white">Service date:</span> {batch.service_date}
            </p>
            <p>
              <span className="font-semibold text-white">Export date:</span>{" "}
              {latestDownload?.created_at
                ? new Date(latestDownload.created_at).toLocaleString()
                : batch.exported_at
                  ? new Date(batch.exported_at).toLocaleString()
                  : "—"}
            </p>
            <p>
              <span className="font-semibold text-white">Marked by:</span> {actorName}
            </p>
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-50">{MARK_UPLOADED_COPY}</p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={reopenOpen}
        title="Reopen batch"
        description="Provide a reason for reopening this completed batch. This will be recorded in the audit log."
        onClose={() => setReopenOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => setReopenOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-btn-primary"
              disabled={!reopenReason.trim() || busyAction}
              onClick={() => void confirmReopen()}
            >
              Reopen
            </button>
          </div>
        }
      >
        <textarea
          className="admin-input min-h-28 w-full"
          value={reopenReason}
          onChange={(e) => setReopenReason(e.target.value)}
          placeholder="Reason required"
        />
      </Modal>
    </div>
  );
}

function PhotoGridCard({
  item,
  selected,
  yards,
  categories,
  onToggle,
  onOpen
}: {
  item: PhotoUploadItem;
  selected: boolean;
  yards: PhotoUploadOption[];
  categories: PhotoUploadOption[];
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-black/20 ${
        selected ? "border-fitdog-orange/60 ring-2 ring-fitdog-orange/30" : "border-admin-border"
      }`}
    >
      <div className="relative">
        <button type="button" className="block w-full" onClick={onOpen}>
          {item.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnail_url}
              alt={item.original_filename}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-black/30 text-sm text-admin-muted">
              No thumbnail
            </div>
          )}
        </button>
        <label className="absolute left-3 top-3 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-black/55 backdrop-blur">
          <input type="checkbox" className="h-5 w-5" checked={selected} onChange={onToggle} aria-label={`Select ${item.original_filename}`} />
        </label>
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-semibold text-white" title={item.original_filename}>
          {item.original_filename}
        </p>
        <PhotoItemStatusBadge status={item.status} />
        {item.duplicate_of_item_id ? <DuplicateWarningBadge /> : null}
        <div className="flex flex-wrap gap-1.5">
          {(item.dogs ?? []).length ? (
            (item.dogs ?? []).map((dog) => (
              <span
                key={dog.id}
                className="inline-flex max-w-full truncate rounded-full border border-admin-border bg-black/25 px-2 py-1 text-[11px] text-white"
              >
                {dog.dog_name}
              </span>
            ))
          ) : (
            <span className="text-xs text-admin-muted">No dogs assigned</span>
          )}
        </div>
        <p className="text-xs text-admin-muted">
          {optionLabel(yards, item.yard)} · {optionLabel(categories, item.category)}
        </p>
      </div>
    </article>
  );
}
