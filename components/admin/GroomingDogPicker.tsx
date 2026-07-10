"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, PawPrint, RefreshCw, Search } from "lucide-react";
import type { GroomingPushActiveDog, GroomingPushDogGroup } from "@/lib/grooming-push-active-dogs";
import { groomingInstruction } from "@/lib/staff/grooming-push-notices";

const GROUP_LABELS: Record<GroomingPushDogGroup, string> = {
  checked_in: "Checked In",
  grooming_appointments: "Grooming Appointments",
  reservations: "Today's Reservations",
  other_appointments: "Other Appointments"
};

const GROUP_ORDER: GroomingPushDogGroup[] = [
  "checked_in",
  "grooming_appointments",
  "reservations",
  "other_appointments"
];

type GroomingDogPickerProps = {
  value: GroomingPushActiveDog | null;
  onChange: (dog: GroomingPushActiveDog | null) => void;
  disabled?: boolean;
};

export function GroomingDogPicker({ value, onChange, disabled = false }: GroomingDogPickerProps) {
  const [dogs, setDogs] = useState<GroomingPushActiveDog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useMemo(
    () => async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/gingr/active-dogs-for-grooming-push", { cache: "no-store", signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load dogs from Gingr.");
        setDogs(body.dogs ?? []);
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load dogs from Gingr.");
          setDogs([]);
        }
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, load]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dogs;
    return dogs.filter((dog) => {
      const haystack = [dog.dogName, dog.ownerName, dog.displayStatus, dog.reservationType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [dogs, query]);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      items: filtered.filter((dog) => dog.group === group)
    })).filter((section) => section.items.length > 0);
  }, [filtered]);

  return (
    <div className="grooming-dog-picker" ref={rootRef}>
      <label className="block">
        <span className="admin-label">Select dog from Gingr</span>
        <button
          type="button"
          className="grooming-dog-picker__trigger admin-input"
          disabled={disabled || loading}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="min-w-0 truncate text-left">
            {value ? `${value.dogName}${value.ownerName ? ` • ${value.ownerName}` : ""}` : "Search checked-in dogs, reservations, and appointments…"}
          </span>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-admin-muted" /> : <ChevronDown className="h-4 w-4 text-admin-muted" />}
        </button>
      </label>

      {open ? (
        <div className="grooming-dog-picker__menu crossover-card">
          <div className="grooming-dog-picker__search-wrap">
            <Search className="h-4 w-4 text-admin-muted" />
            <input
              className="grooming-dog-picker__search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by dog or owner name"
              autoFocus
            />
            <button
              type="button"
              className="crossover-btn crossover-btn--ghost ml-auto inline-flex items-center gap-1 text-xs"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Sync
            </button>
          </div>

          <div className="grooming-dog-picker__list">
            {loading ? (
              <p className="grooming-dog-picker__empty"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading dogs checked in to Gingr…</p>
            ) : error ? (
              <p className="grooming-dog-picker__empty grooming-dog-picker__empty--error">{error}</p>
            ) : grouped.length === 0 ? (
              <p className="grooming-dog-picker__empty">No dogs are available from Gingr right now. Check back after the next board sync.</p>
            ) : (
              grouped.map((section) => (
                <div key={section.group} className="grooming-dog-picker__group">
                  <p className="grooming-dog-picker__group-label">{section.label}</p>
                  {section.items.map((dog) => (
                    <button
                      key={`${dog.dogId}-${dog.reservationId ?? dog.appointmentId ?? "row"}`}
                      type="button"
                      className={`grooming-dog-picker__option ${value?.dogId === dog.dogId && value?.reservationId === dog.reservationId ? "grooming-dog-picker__option--active" : ""}`}
                      onClick={() => {
                        onChange(dog);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <DogThumb photoUrl={dog.dogPhotoUrl} name={dog.dogName} />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block font-bold text-white">{dog.dogName}</span>
                        <span className="block text-xs text-admin-muted">
                          {dog.ownerName ? `${dog.ownerName} • ` : ""}{dog.displayStatus}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {value ? <GroomingDogPreviewCard dog={value} /> : null}
    </div>
  );
}

function DogThumb({ photoUrl, name }: { photoUrl?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className="grooming-dog-picker__thumb" loading="lazy" onError={() => setFailed(true)} />
    );
  }
  return (
    <span className="grooming-dog-picker__thumb grooming-dog-picker__thumb--fallback" aria-hidden>
      {name.charAt(0).toUpperCase() || <PawPrint className="h-4 w-4" />}
    </span>
  );
}

export function GroomingDogPreviewCard({ dog }: { dog: GroomingPushActiveDog }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grooming-dog-preview crossover-card p-4">
      <div className="grooming-dog-preview__grid">
        <div className="grooming-dog-preview__photo-wrap">
          {dog.dogPhotoUrl && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dog.dogPhotoUrl} alt={dog.dogName} className="grooming-dog-preview__photo" onError={() => setFailed(true)} />
          ) : (
            <div className="grooming-dog-preview__photo grooming-dog-preview__photo--fallback">
              <PawPrint className="h-10 w-10 text-fitdog-orange" />
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-fitdog-orange">Grooming Push Preview</p>
          <h4 className="mt-1 text-2xl font-black text-white">{dog.dogName}</h4>
          {dog.ownerName ? <p className="text-sm text-admin-muted">Owner: {dog.ownerName}</p> : null}
          <p className="mt-2 inline-flex rounded-full border border-fitdog-orange/30 bg-fitdog-orange/10 px-3 py-1 text-xs font-bold text-fitdog-orange">
            {dog.displayStatus}
          </p>
        </div>
      </div>
      <div className="grooming-dog-preview__message mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-fitdog-orange">Grooming Push</p>
        <p className="mt-2 text-lg font-black text-white">{groomingInstruction({ dog_name: dog.dogName })}</p>
      </div>
    </div>
  );
}

export function GroomingManualOverrideFields({
  enabled,
  dogAndOwner,
  onDogAndOwnerChange
}: {
  enabled: boolean;
  dogAndOwner: string;
  onDogAndOwnerChange: (value: string) => void;
}) {
  if (!enabled) return null;
  return (
    <label className="block">
      <span className="admin-label">Manual override — dog name &amp; owner last name</span>
      <input
        className="admin-input"
        value={dogAndOwner}
        onChange={(event) => onDogAndOwnerChange(event.target.value)}
        placeholder="e.g. Jasper Sandoval"
      />
      <p className="mt-1 text-xs text-amber-200">Use this if the dog isn&apos;t in the Gingr list. Prefer selecting from Gingr when possible.</p>
    </label>
  );
}
