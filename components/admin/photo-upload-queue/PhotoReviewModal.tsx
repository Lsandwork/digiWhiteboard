"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/admin/ui/Modal";
import { DogPicker } from "@/components/admin/photo-upload-queue/DogPicker";
import { DuplicateWarningBadge, PhotoItemStatusBadge } from "@/components/admin/photo-upload-queue/StatusBadge";
import type { DogAssignmentPayload } from "@/components/admin/photo-upload-queue/api";
import type {
  PhotoUploadCheckedInDog,
  PhotoUploadItem,
  PhotoUploadOption
} from "@/lib/photo-upload-queue/types";

type PhotoReviewModalProps = {
  open: boolean;
  item: PhotoUploadItem | null;
  yards: PhotoUploadOption[];
  categories: PhotoUploadOption[];
  dogs: PhotoUploadCheckedInDog[];
  dogsWarning?: string | null;
  recentlySelected?: PhotoUploadCheckedInDog[];
  busy?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (patch: {
    yard: string | null;
    category: string | null;
    photographer_name: string | null;
    internal_note: string | null;
    dogs: DogAssignmentPayload[];
    duplicate_override?: boolean;
    exclude?: boolean;
    excluded_reason?: string | null;
  }) => void;
};

function assignmentsFromItem(item: PhotoUploadItem | null): DogAssignmentPayload[] {
  return (item?.dogs ?? []).map((dog) => ({
    gingr_pet_id: dog.gingr_pet_id,
    dog_name: dog.dog_name,
    owner_name: dog.owner_name,
    dog_photo_url: dog.dog_photo_url,
    reservation_type: dog.reservation_type,
    assignment_source: dog.assignment_source
  }));
}

export function PhotoReviewModal({
  open,
  item,
  yards,
  categories,
  dogs,
  dogsWarning,
  recentlySelected,
  busy,
  readOnly,
  onClose,
  onSave
}: PhotoReviewModalProps) {
  const [yard, setYard] = useState("");
  const [category, setCategory] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [note, setNote] = useState("");
  const [assigned, setAssigned] = useState<DogAssignmentPayload[]>([]);
  const [excludeReason, setExcludeReason] = useState("");

  useEffect(() => {
    if (!item) return;
    setYard(item.yard ?? "");
    setCategory(item.category ?? "");
    setPhotographer(item.photographer_name ?? "");
    setNote(item.internal_note ?? "");
    setAssigned(assignmentsFromItem(item));
    setExcludeReason(item.excluded_reason ?? "");
  }, [item]);

  if (!item) return null;

  const imageUrl = item.original_url || item.thumbnail_url;

  return (
    <Modal
      open={open}
      title="Review photo"
      description={item.original_filename}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      footer={
        readOnly ? (
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Close
          </button>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="admin-btn-secondary min-h-11" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {item.duplicate_of_item_id && !item.duplicate_override ? (
              <button
                type="button"
                className="admin-btn-secondary min-h-11"
                disabled={busy}
                onClick={() =>
                  onSave({
                    yard: yard || null,
                    category: category || null,
                    photographer_name: photographer || null,
                    internal_note: note || null,
                    dogs: assigned,
                    duplicate_override: true
                  })
                }
              >
                Keep anyway
              </button>
            ) : null}
            <button
              type="button"
              className="admin-btn-secondary min-h-11"
              disabled={busy}
              onClick={() =>
                onSave({
                  yard: yard || null,
                  category: category || null,
                  photographer_name: photographer || null,
                  internal_note: note || null,
                  dogs: assigned,
                  exclude: true,
                  excluded_reason: excludeReason || "Excluded from review"
                })
              }
            >
              Exclude
            </button>
            <button
              type="button"
              className="admin-btn-primary min-h-11"
              disabled={busy}
              onClick={() =>
                onSave({
                  yard: yard || null,
                  category: category || null,
                  photographer_name: photographer || null,
                  internal_note: note || null,
                  dogs: assigned
                })
              }
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={item.original_filename} className="max-h-[420px] w-full rounded-xl object-contain bg-black/30" />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-admin-border text-admin-muted">
              Thumbnail unavailable
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <PhotoItemStatusBadge status={item.status} />
            {item.duplicate_of_item_id ? <DuplicateWarningBadge /> : null}
          </div>
          {item.duplicate_info ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-50">
              <p className="font-semibold">Previous record</p>
              <p className="mt-1 text-admin-muted">
                Batch: {item.duplicate_info.previous_batch_name || "Unknown"} · File:{" "}
                {item.duplicate_info.previous_filename || "Unknown"}
              </p>
              <p className="text-admin-muted">
                Service date: {item.duplicate_info.previous_service_date || "—"} · Status:{" "}
                {item.duplicate_info.previous_status || "—"}
              </p>
              <p className="text-admin-muted">
                Uploaded:{" "}
                {item.duplicate_info.previous_uploaded_at
                  ? new Date(item.duplicate_info.previous_uploaded_at).toLocaleString()
                  : "Not marked uploaded"}
              </p>
            </div>
          ) : null}
          {item.failure_reason ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              {item.failure_reason}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Yard</span>
            <select className="admin-input w-full" value={yard} onChange={(e) => setYard(e.target.value)} disabled={readOnly || busy}>
              <option value="">Select yard</option>
              {yards.map((option) => (
                <option key={option.id} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Category</span>
            <select
              className="admin-input w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={readOnly || busy}
            >
              <option value="">Select category</option>
              {categories.map((option) => (
                <option key={option.id} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Photographer</span>
            <input
              className="admin-input w-full"
              value={photographer}
              onChange={(e) => setPhotographer(e.target.value)}
              disabled={readOnly || busy}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Internal note</span>
            <textarea
              className="admin-input min-h-24 w-full"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={readOnly || busy}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">
              Exclude reason (if excluding)
            </span>
            <input
              className="admin-input w-full"
              value={excludeReason}
              onChange={(e) => setExcludeReason(e.target.value)}
              disabled={readOnly || busy}
            />
          </label>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">Dogs</p>
            <DogPicker
              dogs={dogs}
              selected={assigned}
              onChange={setAssigned}
              disabled={readOnly || busy}
              warning={dogsWarning}
              recentlySelected={recentlySelected}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
