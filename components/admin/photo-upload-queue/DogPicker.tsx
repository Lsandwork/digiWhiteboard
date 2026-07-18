"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { PhotoUploadCheckedInDog } from "@/lib/photo-upload-queue/types";
import type { DogAssignmentPayload } from "@/components/admin/photo-upload-queue/api";

type DogPickerProps = {
  dogs: PhotoUploadCheckedInDog[];
  selected: DogAssignmentPayload[];
  onChange: (dogs: DogAssignmentPayload[]) => void;
  disabled?: boolean;
  warning?: string | null;
  recentlySelected?: PhotoUploadCheckedInDog[];
};

function dogKey(dog: { gingr_pet_id?: string | null; dog_name: string }) {
  return `${dog.gingr_pet_id ?? ""}:${dog.dog_name.toLowerCase()}`;
}

export function DogPicker({
  dogs,
  selected,
  onChange,
  disabled,
  warning,
  recentlySelected = []
}: DogPickerProps) {
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dogs;
    return dogs.filter((dog) => {
      const haystack = [dog.dogName, dog.ownerName, dog.reservationType, dog.displayStatus, dog.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [dogs, query]);

  function isSelected(dog: PhotoUploadCheckedInDog) {
    const key = dogKey({ gingr_pet_id: dog.gingrAnimalId ?? dog.dogId, dog_name: dog.dogName });
    return selected.some((item) => dogKey(item) === key);
  }

  function toggleDog(dog: PhotoUploadCheckedInDog) {
    if (disabled) return;
    const payload: DogAssignmentPayload = {
      gingr_pet_id: dog.gingrAnimalId ?? dog.dogId,
      dog_name: dog.dogName,
      owner_name: dog.ownerName ?? null,
      dog_photo_url: dog.dogPhotoUrl ?? null,
      reservation_type: dog.reservationType ?? null,
      assignment_source: "checked_in"
    };
    const key = dogKey(payload);
    if (selected.some((item) => dogKey(item) === key)) {
      onChange(selected.filter((item) => dogKey(item) !== key));
      return;
    }
    onChange([...selected, payload]);
  }

  function addManual() {
    const name = manualName.trim();
    if (!name || disabled) return;
    const payload: DogAssignmentPayload = {
      gingr_pet_id: null,
      dog_name: name,
      owner_name: null,
      dog_photo_url: null,
      reservation_type: null,
      assignment_source: "manual"
    };
    const key = dogKey(payload);
    if (!selected.some((item) => dogKey(item) === key)) {
      onChange([...selected, payload]);
    }
    setManualName("");
  }

  function removeSelected(dog: DogAssignmentPayload) {
    if (disabled) return;
    const key = dogKey(dog);
    onChange(selected.filter((item) => dogKey(item) !== key));
  }

  return (
    <div className="space-y-3">
      {warning ? (
        <p className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {warning}
        </p>
      ) : null}

      {selected.length ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((dog) => (
            <button
              key={dogKey(dog)}
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-admin-border bg-black/20 px-3 text-sm text-white"
              onClick={() => removeSelected(dog)}
              disabled={disabled}
            >
              <span>{dog.dog_name}</span>
              {dog.owner_name ? <span className="text-admin-muted">({dog.owner_name})</span> : null}
              <X className="h-3.5 w-3.5 text-admin-muted" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-muted">Search dogs</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
          <input
            className="admin-input w-full pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Dog name, owner, or reservation type"
            disabled={disabled}
          />
        </div>
      </label>

      {recentlySelected.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">Recently selected</p>
          <div className="flex flex-wrap gap-2">
            {recentlySelected.map((dog) => (
              <button
                key={`recent-${dog.dogId}`}
                type="button"
                className="admin-btn-secondary min-h-10 px-3 text-xs"
                onClick={() => toggleDog(dog)}
                disabled={disabled || isSelected(dog)}
              >
                {dog.dogName}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-admin-border p-2">
        {!filtered.length ? (
          <p className="admin-empty-state-text px-2 py-3">
            {dogs.length
              ? "No dogs match your search."
              : "No checked-in dogs loaded for this date. Use manual entry below."}
          </p>
        ) : (
          filtered.map((dog) => {
            const active = isSelected(dog);
            return (
              <button
                key={dog.dogId}
                type="button"
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  active
                    ? "border-fitdog-orange/50 bg-fitdog-orange/10"
                    : "border-transparent hover:border-admin-border hover:bg-black/20"
                }`}
                onClick={() => toggleDog(dog)}
                disabled={disabled}
              >
                {dog.dogPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dog.dogPhotoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-sm font-bold text-admin-muted">
                    {dog.dogName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{dog.dogName}</span>
                  <span className="block truncate text-xs text-admin-muted">
                    {[dog.ownerName, dog.reservationType, dog.displayStatus || dog.status]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={`h-5 w-5 shrink-0 rounded border ${
                    active ? "border-fitdog-orange bg-fitdog-orange" : "border-admin-border"
                  }`}
                  aria-hidden
                />
              </button>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="admin-input min-h-11 flex-1"
          value={manualName}
          onChange={(event) => setManualName(event.target.value)}
          placeholder="Manual dog name"
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addManual();
            }
          }}
        />
        <button type="button" className="admin-btn-secondary min-h-11" onClick={addManual} disabled={disabled || !manualName.trim()}>
          <Plus className="h-4 w-4" />
          Add name
        </button>
      </div>
    </div>
  );
}
