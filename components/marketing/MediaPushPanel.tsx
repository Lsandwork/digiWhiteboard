"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MARKETING_DESTINATION_LABELS,
  MARKETING_PRIORITY_LABELS,
  MARKETING_REQUEST_TYPE_LABELS,
  MARKETING_ROUTES,
  type MarketingDestination,
  type MarketingRequestPriority,
  type MarketingRequestType
} from "@/lib/marketing/constants";
import { useToast } from "@/components/admin/ui/ToastProvider";

type DogOption = {
  dogId: string;
  dogName: string;
  dogPhotoUrl?: string | null;
  displayStatus?: string;
  gingrAnimalId?: string | null;
};

export function MediaPushPanel() {
  const { showToast } = useToast();
  const router = useRouter();
  const [dogs, setDogs] = useState<DogOption[]>([]);
  const [query, setQuery] = useState("");
  const [selectedDogId, setSelectedDogId] = useState("");
  const [requestType, setRequestType] = useState<MarketingRequestType>("photo_session");
  const [destination, setDestination] = useState<MarketingDestination>("photo_box");
  const [customDestination, setCustomDestination] = useState("");
  const [priority, setPriority] = useState<MarketingRequestPriority>("standard");
  const [requestedDeadline, setRequestedDeadline] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/marketing/dogs", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load dogs.");
      setDogs(body.dogs ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load dogs.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDogs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDogs]);

  const filteredDogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return dogs;
    return dogs.filter((dog) => dog.dogName.toLowerCase().includes(needle));
  }, [dogs, query]);

  const selectedDog = dogs.find((dog) => dog.dogId === selectedDogId) ?? null;

  async function submit() {
    if (!selectedDog) {
      showToast("Select a checked-in dog.", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/marketing/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          idempotencyKey: crypto.randomUUID(),
          dogGingrId: selectedDog.gingrAnimalId ?? selectedDog.dogId,
          dogName: selectedDog.dogName,
          dogPhotoUrl: selectedDog.dogPhotoUrl ?? null,
          dogLocation: selectedDog.displayStatus ?? null,
          requestType,
          destination,
          customDestination: destination === "custom" ? customDestination : null,
          priority,
          requestedDeadline: requestedDeadline || null,
          instructions: instructions || null
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create request.");
      showToast(`Media request sent for ${selectedDog.dogName}.`, "success");
      router.push(MARKETING_ROUTES.requests);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create request.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="marketing-card max-w-3xl">
      <h2 className="marketing-card__title mb-4">Request a Dog for Media</h2>
      {loading ? <div className="marketing-empty">Loading checked-in dogs…</div> : null}
      <div className="marketing-form-grid">
        <label>
          Search checked-in dog
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a dog name" />
        </label>
        <label>
          Dog
          <select value={selectedDogId} onChange={(e) => setSelectedDogId(e.target.value)}>
            <option value="">Select a dog</option>
            {filteredDogs.map((dog) => (
              <option key={dog.dogId} value={dog.dogId}>
                {dog.dogName} {dog.displayStatus ? `· ${dog.displayStatus}` : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedDog ? (
          <div className="marketing-dog-chip">
            {selectedDog.dogPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedDog.dogPhotoUrl} alt={selectedDog.dogName} />
            ) : (
              <div className="marketing-dog-chip__fallback">{selectedDog.dogName.charAt(0)}</div>
            )}
            <div>
              <strong>{selectedDog.dogName}</strong>
              <div className="text-sm text-slate-500">{selectedDog.displayStatus ?? "Checked in"}</div>
            </div>
          </div>
        ) : null}
        <label>
          Request type
          <select value={requestType} onChange={(e) => setRequestType(e.target.value as MarketingRequestType)}>
            {Object.entries(MARKETING_REQUEST_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <select value={destination} onChange={(e) => setDestination(e.target.value as MarketingDestination)}>
            {Object.entries(MARKETING_DESTINATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {destination === "custom" ? (
          <label>
            Custom location
            <input value={customDestination} onChange={(e) => setCustomDestination(e.target.value)} />
          </label>
        ) : null}
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as MarketingRequestPriority)}>
            {Object.entries(MARKETING_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Requested time or deadline (optional)
          <input type="datetime-local" value={requestedDeadline} onChange={(e) => setRequestedDeadline(e.target.value)} />
        </label>
        <label>
          Instructions (optional)
          <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </label>
        <button type="button" className="marketing-btn marketing-btn--primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Sending…" : "Send Media Request"}
        </button>
      </div>
    </div>
  );
}
