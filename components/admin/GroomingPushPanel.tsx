"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, PawPrint, Scissors, Send, XCircle } from "lucide-react";
import {
  GROOMING_SAFETY_TAG_OPTIONS,
  GROOMING_SERVICE_OPTIONS,
  type GroomingDogOption,
  type GroomingPushNotice
} from "@/lib/staff/grooming-push-notices";
import { groomingInstruction } from "@/lib/staff/grooming-push-notices";
import { hasPermission, type UserAccess } from "@/lib/admin/permissions";
import { useToast } from "@/components/admin/ui/ToastProvider";

type GroomingPayload = {
  activeNotice: GroomingPushNotice | null;
  queue: GroomingPushNotice[];
  recent: GroomingPushNotice[];
  dogs: GroomingDogOption[];
  currentUser: {
    email: string | null;
    role: string | null;
    access?: UserAccess | null;
  };
};

const emptyForm = {
  dog_id: "",
  dog_name: "",
  dog_photo_url: "",
  owner_name: "",
  owner_initial: "",
  service: "Bath + Brush",
  groomer_name: "",
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
    return hasPermission(data.currentUser.access ?? null, "push_grooming_request")
      || ["owner_admin", "manager_admin", "front_desk_coordinator", "team_leader", "groomer"].includes(data.currentUser.role ?? "");
  }, [data]);

  const canClear = useMemo(() => {
    if (!data) return false;
    return hasPermission(data.currentUser.access ?? null, "clear_grooming_request")
      || ["owner_admin", "manager_admin", "front_desk_coordinator", "team_leader", "groomer"].includes(data.currentUser.role ?? "");
  }, [data]);

  const selectedDog = useMemo(
    () => data?.dogs.find((dog) => dog.id === form.dog_id) ?? null,
    [data?.dogs, form.dog_id]
  );

  function selectDog(dog: GroomingDogOption) {
    setForm((current) => ({
      ...current,
      dog_id: dog.id,
      dog_name: dog.dog_name,
      dog_photo_url: dog.photo_url ?? "",
      owner_name: dog.owner_name ?? "",
      owner_initial: dog.owner_name?.trim().charAt(0).toUpperCase() ?? ""
    }));
  }

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
      const response = await fetch("/api/admin/grooming-push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dog_id: form.dog_id || null,
          dog_name: form.dog_name,
          dog_photo_url: form.dog_photo_url || null,
          owner_name: form.owner_name || null,
          owner_initial: form.owner_initial || null,
          service,
          groomer_name: form.groomer_name,
          notes: form.notes || null,
          safety_tags
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to push grooming notice.");
      showToast(`Grooming request pushed for ${body.notice?.dog_name ?? form.dog_name}.`, "success");
      setData((current) => current ? { ...current, activeNotice: body.activeNotice ?? body.notice, queue: body.queue ?? [] } : current);
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
          <p className="admin-page-subtitle">Send a high-priority handler alert to the Staff Digital Whiteboard when a dog needs to go to Catch.</p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="crossover-card crossover-card--conversations p-5">
          <div className="mb-5">
            <h3 className="crossover-card__title">Push to Staff Whiteboard</h3>
            <p className="crossover-card__subtitle">Creates a 5-minute full-screen grooming request for handlers.</p>
          </div>

          <div className="grid gap-4">
            <label className="block">
              <span className="admin-label">Dog on property</span>
              <select
                className="admin-input"
                value={form.dog_id}
                onChange={(event) => {
                  const dog = data?.dogs.find((item) => item.id === event.target.value);
                  if (dog) selectDog(dog);
                  else setForm((current) => ({ ...current, dog_id: "", dog_name: "", dog_photo_url: "", owner_name: "", owner_initial: "" }));
                }}
              >
                <option value="">Select a checked-in dog…</option>
                {(data?.dogs ?? []).map((dog) => (
                  <option key={dog.id} value={dog.id}>{dog.dog_name}{dog.owner_name ? ` — ${dog.owner_name}` : ""}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label">Dog name</span>
                <input className="admin-input" value={form.dog_name} onChange={(e) => setForm({ ...form, dog_name: e.target.value })} />
              </label>
              <label className="block">
                <span className="admin-label">Owner name / initial</span>
                <input className="admin-input" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value, owner_initial: e.target.value.trim().charAt(0).toUpperCase() })} />
              </label>
            </div>

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
              ) : (
                <label className="block">
                  <span className="admin-label">Groomer</span>
                  <input className="admin-input" value={form.groomer_name} onChange={(e) => setForm({ ...form, groomer_name: e.target.value })} placeholder="Sarah" />
                </label>
              )}
            </div>

            {form.service === "Custom" ? (
              <label className="block">
                <span className="admin-label">Groomer</span>
                <input className="admin-input" value={form.groomer_name} onChange={(e) => setForm({ ...form, groomer_name: e.target.value })} placeholder="Sarah" />
              </label>
            ) : null}

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

            {form.dog_name ? (
              <div className="rounded-xl border border-[rgba(245,158,11,0.22)] bg-black/20 p-4 text-sm text-admin-muted">
                <p className="font-bold text-white">Preview message</p>
                <p className="mt-2 text-white">{groomingInstruction({ dog_name: form.dog_name })}</p>
              </div>
            ) : null}

            <button
              type="button"
              className="crossover-btn crossover-btn--primary inline-flex items-center justify-center gap-2"
              disabled={busy || !canPush || !form.dog_name.trim() || !form.groomer_name.trim()}
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

          <section className="crossover-card crossover-card--sidebar p-5">
            <h3 className="crossover-card__title">Checked-In Dogs</h3>
            <p className="crossover-card__subtitle mb-4">Loaded from cached live board data — no extra Gingr polling.</p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(data?.dogs ?? []).length ? data!.dogs.map((dog) => (
                <button
                  key={dog.id}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${form.dog_id === dog.id ? "border-fitdog-orange bg-fitdog-orange/10" : "border-admin-border"}`}
                  onClick={() => selectDog(dog)}
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-fitdog-orange/15 text-sm font-black text-white">{dog.dog_name.charAt(0)}</span>
                  <span>
                    <span className="block font-bold text-white">{dog.dog_name}</span>
                    <span className="block text-xs text-admin-muted">{dog.owner_name ?? "Owner unknown"}</span>
                  </span>
                </button>
              )) : (
                <p className="text-sm text-admin-muted">No checked-in dogs found on the live board cache.</p>
              )}
            </div>
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
