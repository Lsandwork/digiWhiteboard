"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Scissors, Send, XCircle } from "lucide-react";
import {
  GROOMING_SAFETY_TAG_OPTIONS,
  GROOMING_SERVICE_OPTIONS,
  groomingInstruction,
  parseDogAndOwnerLastName,
  type GroomingPushNotice
} from "@/lib/staff/grooming-push-notices";
import { GroomingDogPicker, GroomingManualOverrideFields } from "@/components/admin/GroomingDogPicker";
import type { GroomingPushActiveDog } from "@/lib/grooming-push-active-dogs";
import { canUseGroomingPush, canClearGroomingPush, type UserAccess } from "@/lib/admin/permissions";
import { useToast } from "@/components/admin/ui/ToastProvider";

type GroomingPayload = {
  activeNotice: GroomingPushNotice | null;
  queue: GroomingPushNotice[];
  recent: GroomingPushNotice[];
  currentUser: {
    email: string | null;
    role: string | null;
    access?: UserAccess | null;
  };
};

const emptyForm = {
  selectedDog: null as GroomingPushActiveDog | null,
  manualOverride: false,
  dog_and_owner: "",
  service: "Bath + Brush",
  notes: "",
  safety_tags: [] as string[],
  custom_service: "",
  custom_tag: ""
};

export function GroomingPushPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<GroomingPayload | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/grooming-push", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load grooming push notices.");
      setData(body as GroomingPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load grooming push notices.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const canPush = useMemo(() => {
    if (!data) return false;
    return canUseGroomingPush(data.currentUser.access ?? null, data.currentUser.role);
  }, [data]);

  const canClear = useMemo(() => {
    if (!data) return false;
    return canClearGroomingPush(data.currentUser.access ?? null, data.currentUser.role);
  }, [data]);

  const canManualOverride = useMemo(() => canPush, [canPush]);

  const parsedManualDog = useMemo(() => parseDogAndOwnerLastName(form.dog_and_owner), [form.dog_and_owner]);

  const selectedDogReady = form.manualOverride
    ? Boolean(parsedManualDog.dog_name)
    : Boolean(form.selectedDog?.dogName);

  function toggleTag(tag: string) {
    setForm((current) => ({
      ...current,
      safety_tags: current.safety_tags.includes(tag)
        ? current.safety_tags.filter((item) => item !== tag)
        : [...current.safety_tags, tag]
    }));
  }

  async function pushNotice() {
    setBusy(true);
    try {
      const service = form.service === "Custom" ? form.custom_service.trim() : form.service;
      const safety_tags = [
        ...form.safety_tags,
        ...(form.custom_tag.trim() ? [form.custom_tag.trim()] : [])
      ];

      const payload = form.manualOverride
        ? {
            manual_override: true,
            dog_name: parsedManualDog.dog_name,
            owner_name: parsedManualDog.owner_name,
            owner_initial: parsedManualDog.owner_initial,
            service,
            notes: form.notes || null,
            safety_tags
          }
        : {
            dog_id: form.selectedDog?.gingrAnimalId ?? form.selectedDog?.dogId,
            dog_name: form.selectedDog!.dogName,
            owner_name: form.selectedDog?.ownerName ?? null,
            dog_photo_url: form.selectedDog?.dogPhotoUrl ?? null,
            reservation_id: form.selectedDog?.reservationId,
            appointment_id: form.selectedDog?.appointmentId,
            gingr_display_status: form.selectedDog?.displayStatus,
            service,
            notes: form.notes || null,
            safety_tags
          };

      const response = await fetch("/api/admin/grooming-push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to push grooming notice.");

      const pushedName = form.manualOverride ? parsedManualDog.dog_name : form.selectedDog?.dogName;
      showToast(`Grooming request pushed for ${pushedName}.`, "success");
      setData((current) => current ? { ...current, activeNotice: body.activeNotice ?? body.notice, queue: body.queue ?? [] } : current);
      setForm({
        ...emptyForm,
        service: form.service,
        safety_tags: form.safety_tags
      });
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to push grooming notice.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearActive() {
    if (!data?.activeNotice) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/grooming-push/${data.activeNotice.id}/clear`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to clear grooming notice.");
      showToast("Grooming notice cleared.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to clear grooming notice.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crossover-dashboard space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Grooming Push</h2>
          <p className="admin-page-subtitle">Select a dog checked in to Gingr and send a high-priority handler alert to the Staff Digital Whiteboard.</p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="crossover-card crossover-card--conversations p-5">
          <div className="mb-5">
            <h3 className="crossover-card__title">Push to Staff Whiteboard</h3>
            <p className="crossover-card__subtitle">Creates a 5-minute full-screen grooming request with the dog&apos;s real Gingr profile photo.</p>
          </div>

          <div className="grid gap-4">
            {canManualOverride ? (
              <label className="inline-flex items-center gap-2 text-sm text-admin-muted">
                <input
                  type="checkbox"
                  checked={form.manualOverride}
                  onChange={(event) => setForm({ ...form, manualOverride: event.target.checked, selectedDog: null, dog_and_owner: "" })}
                />
                Type dog manually (can&apos;t find in Gingr list)
              </label>
            ) : null}

            {form.manualOverride ? (
              <GroomingManualOverrideFields
                enabled
                dogAndOwner={form.dog_and_owner}
                onDogAndOwnerChange={(value) => setForm({ ...form, dog_and_owner: value })}
              />
            ) : (
              <GroomingDogPicker
                value={form.selectedDog}
                onChange={(selectedDog) => setForm({ ...form, selectedDog })}
                disabled={busy}
              />
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label">Service</span>
                <select className="admin-input" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
                  {GROOMING_SERVICE_OPTIONS.map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                </select>
              </label>
              {form.service === "Custom" ? (
                <label className="block">
                  <span className="admin-label">Custom service</span>
                  <input className="admin-input" value={form.custom_service} onChange={(e) => setForm({ ...form, custom_service: e.target.value })} />
                </label>
              ) : null}
            </div>

            <div>
              <span className="admin-label">Safety tags</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {GROOMING_SAFETY_TAG_OPTIONS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${form.safety_tags.includes(tag) ? "border-fitdog-orange bg-fitdog-orange/20 text-white" : "border-admin-border text-admin-muted"}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <input className="admin-input mt-3" value={form.custom_tag} onChange={(e) => setForm({ ...form, custom_tag: e.target.value })} placeholder="Custom safety tag (optional)" />
            </div>

            <label className="block">
              <span className="admin-label">Optional note</span>
              <textarea className="admin-input min-h-24" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>

            <button
              type="button"
              className="crossover-btn crossover-btn--primary inline-flex items-center justify-center gap-2"
              disabled={busy || !canPush || !selectedDogReady}
              onClick={() => void pushNotice()}
            >
              <Send className="h-4 w-4" /> Push to Staff Whiteboard
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <section className="crossover-card crossover-card--sidebar p-5">
            <h3 className="crossover-card__title">Active Request</h3>
            <p className="crossover-card__subtitle mb-4">Currently displayed on the Staff Digital Whiteboard.</p>
            {loading ? (
              <p className="text-sm text-admin-muted">Loading…</p>
            ) : data?.activeNotice ? (
              <div className="space-y-3">
                <p className="text-2xl font-black text-white">{data.activeNotice.dog_name}</p>
                <p className="text-sm text-admin-muted">{data.activeNotice.service} • Groomer: {data.activeNotice.groomer_name}</p>
                <p className="inline-flex items-center gap-2 text-sm text-fitdog-orange"><Clock3 className="h-4 w-4" /> Expires {new Date(data.activeNotice.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                {data.queue.length ? <p className="text-xs text-admin-muted">{data.queue.length} more request(s) queued.</p> : null}
                <button type="button" className="crossover-btn crossover-btn--outline inline-flex w-full items-center justify-center gap-2" disabled={busy || !canClear} onClick={() => void clearActive()}>
                  <XCircle className="h-4 w-4" /> Groomer Clear Screen
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-admin-border bg-white/[0.03] p-4 text-sm text-admin-muted">
                No active grooming push notice.
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="crossover-card crossover-card--conversations p-5">
        <div className="mb-4 flex items-center gap-2">
          <Scissors className="h-5 w-5 text-fitdog-orange" />
          <h3 className="crossover-card__title">Recent Grooming Requests</h3>
        </div>
        {(data?.recent ?? []).length ? (
          <div className="space-y-2">
            {data!.recent.slice(0, 8).map((notice) => (
              <div key={notice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-admin-border px-4 py-3">
                <div>
                  <p className="font-bold text-white">{notice.dog_name}</p>
                  <p className="text-sm text-admin-muted">{notice.service} • {notice.groomer_name}</p>
                </div>
                <span className={`admin-badge ${notice.status === "active" ? "admin-badge--amber" : notice.status === "cleared" ? "admin-badge--green" : ""}`}>
                  {notice.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-admin-muted">No grooming requests yet.</p>
        )}
      </section>

      {!canPush ? (
        <p className="inline-flex items-center gap-2 text-sm text-amber-200"><AlertTriangle className="h-4 w-4" /> You can view this page but do not have permission to push grooming notices.</p>
      ) : null}
    </div>
  );
}
