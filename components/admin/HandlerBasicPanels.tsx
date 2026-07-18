"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, ImagePlus } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { AddShiftLogEntryCard, type ShiftLogFormShape } from "@/components/admin/front-desk/FrontDeskLogUI";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";
import type { HandlerDailyChecklistItem } from "@/lib/staff/handler-checklist-daily";
import type { ManagementReport } from "@/lib/staff/management-reports";
import { shiftLogSubmittedBy } from "@/lib/staff/front-desk-log";
import { serializeTemplateFieldValues } from "@/lib/frontDeskLog/logTemplates";

const CHECKLIST_ITEMS = [
  "Clock in and confirm yard assignment.",
  "Check leash/fanny-pack supplies and report missing items.",
  "Review dogs that need special handling today.",
  "Log behavior/safety notes before shift end."
];

type ChecklistItemState = {
  checked: boolean;
  timestamp: string;
};

type ChecklistState = Record<string, ChecklistItemState>;

const emptyShiftForm: ShiftLogFormShape = {
  log_type: "Daycare Note",
  subject: "",
  details: "",
  priority: "Normal",
  status: "Open",
  assigned_to: "",
  related_dog_name: "",
  related_owner_name: "",
  department_area: "Daycare",
  due_at: "",
  reminder_at: "",
  needs_management_review: false,
  urgent: false,
  create_owner_follow_up: false,
  create_active_issue: false,
  template_title: null,
  template_id: null,
  template_fields: {},
  field_errors: {}
};

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

export function HandlerChecklistPanel() {
  const { showToast } = useToast();
  const [items, setItems] = useState<string[]>(CHECKLIST_ITEMS);
  const [dailyItems, setDailyItems] = useState<HandlerDailyChecklistItem[]>([]);
  const [shiftDate, setShiftDate] = useState<string | null>(null);
  const [checked, setChecked] = useState<ChecklistState>({});
  const [loadingDaily, setLoadingDaily] = useState(true);

  useEffect(() => {
    let active = true;
    const loadChecklist = async () => {
      try {
        const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load checklist items.");
        const currentEmail = String(body.currentUser?.email ?? "").trim().toLowerCase();
        const currentId = String(body.currentUser?.adminUserId ?? "").trim();
        const matched = (body.staff_directory ?? []).find((member: { email?: string | null; admin_user_id?: string | null }) => {
          const memberEmail = String(member.email ?? "").trim().toLowerCase();
          const memberAdminId = String(member.admin_user_id ?? "").trim();
          return (currentEmail && memberEmail && memberEmail === currentEmail) || (currentId && memberAdminId && memberAdminId === currentId);
        });
        const assigned = Array.isArray(matched?.checklist_items)
          ? (matched.checklist_items as unknown[]).map((item) => String(item).trim()).filter(Boolean)
          : [];
        if (!active) return;
        setItems(assigned.length ? assigned : CHECKLIST_ITEMS);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load checklist items.", "error");
      }
    };
    void loadChecklist();
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    let active = true;
    const loadSavedState = async () => {
      setLoadingDaily(true);
      try {
        const response = await fetch("/api/admin/handler-checklist", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load checklist progress.");
        if (!active) return;
        const parsed = (body.checklist_state ?? {}) as ChecklistState;
        const nextDaily = Array.isArray(body.daily_items) ? (body.daily_items as HandlerDailyChecklistItem[]) : [];
        window.setTimeout(() => {
          setChecked(parsed);
          setDailyItems(nextDaily);
          setShiftDate(typeof body.shift_date === "string" ? body.shift_date : null);
          setLoadingDaily(false);
        }, 0);
      } catch {
        try {
          const raw = window.localStorage.getItem("fitdog_handler_checklist");
          if (!raw || !active) return;
          const parsed = JSON.parse(raw) as Record<string, boolean | ChecklistItemState>;
          const now = new Date().toISOString();
          const normalized: ChecklistState = {};
          for (const item of items) {
            const value = parsed[item];
            if (value && typeof value === "object" && "checked" in value && "timestamp" in value) {
              normalized[item] = {
                checked: Boolean(value.checked),
                timestamp: typeof value.timestamp === "string" ? value.timestamp : now
              };
              continue;
            }
            normalized[item] = {
              checked: Boolean(value),
              timestamp: now
            };
          }
          window.setTimeout(() => {
            setChecked(normalized);
            setLoadingDaily(false);
          }, 0);
        } catch {
          if (active) setLoadingDaily(false);
        }
      }
    };
    void loadSavedState();
    return () => {
      active = false;
    };
  }, [items]);

  async function persistChecklistState(next: ChecklistState) {
    setChecked(next);
    try {
      window.localStorage.setItem("fitdog_handler_checklist", JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
    try {
      await fetch("/api/admin/handler-checklist", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checklist_state: next })
      });
    } catch {
      // local copy remains; server sync can retry on next toggle
    }
  }

  function toggle(item: string) {
    const next: ChecklistState = {
      ...checked,
      [item]: {
        checked: !checked[item]?.checked,
        timestamp: new Date().toISOString()
      }
    };
    void persistChecklistState(next);
  }

  const dailyDoneCount = useMemo(
    () => dailyItems.filter((item) => Boolean(checked[item.key]?.checked)).length,
    [checked, dailyItems]
  );

  return (
    <section className="crossover-card p-5">
      <header className="mb-4 flex items-center gap-3">
        <CheckSquare className="h-5 w-5 text-fitdog-orange" />
        <div>
          <h2 className="admin-page-title">Check List</h2>
          <p className="admin-page-subtitle">
            Mark today&apos;s daily push notices complete, then finish your shift checklist.
            {shiftDate ? ` (${shiftDate})` : ""}
          </p>
        </div>
      </header>

      <div className="mb-6 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-admin-ink">Today&apos;s daily push notices</h3>
          {!loadingDaily && dailyItems.length > 0 ? (
            <span className="text-xs text-admin-muted">
              {dailyDoneCount}/{dailyItems.length} completed
            </span>
          ) : null}
        </div>
        {loadingDaily ? (
          <p className="text-sm text-admin-muted">Loading today&apos;s recurring notices…</p>
        ) : dailyItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-admin-border p-3 text-sm text-admin-muted">
            No dog-handler daily recurring push notices scheduled for today.
          </p>
        ) : (
          <div className="grid gap-2">
            {dailyItems.map((item) => (
              <label key={item.key} className="flex items-start gap-3 rounded-xl border border-fitdog-orange/40 bg-fitdog-orange/5 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(checked[item.key]?.checked)}
                  onChange={() => toggle(item.key)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  {item.detail ? <span className="mt-1 block text-admin-muted">{item.detail}</span> : null}
                  <span className="mt-1 block text-xs text-admin-muted">
                    {item.scheduled_label ? `${item.scheduled_label} · ` : ""}
                    {item.source === "daily_reminder" ? "Daily reminder" : "Daily push notice"}
                    {" · "}
                    {formatDateTime(checked[item.key]?.timestamp ?? null)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-admin-ink">Shift checklist</h3>
        <div className="grid gap-2">
          {items.map((item) => (
            <label key={item} className="flex items-start gap-3 rounded-xl border border-admin-border p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={Boolean(checked[item]?.checked)} onChange={() => toggle(item)} />
              <span>
                <span className="block">{item}</span>
                <span className="mt-1 block text-xs text-admin-muted">
                  {formatDateTime(checked[item]?.timestamp ?? null)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BulkPhotoUploadPanel() {
  const { showToast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [animalIdsByIndex, setAnimalIdsByIndex] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ animalId: string; fileName: string; updated: boolean; error?: string }>>([]);

  function inferAnimalId(fileName: string) {
    const match = fileName.match(/\d{3,}/);
    return match ? match[0] : "";
  }

  async function uploadPhotos() {
    if (!selectedFiles.length) {
      showToast("Select at least one image.", "error");
      return;
    }

    const missing = selectedFiles.some((_, idx) => !(animalIdsByIndex[idx] ?? "").trim());
    if (missing) {
      showToast("Add an animal ID for each selected image.", "error");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file, index) => {
        formData.append("files", file);
        formData.append(`animal_id_${index}`, (animalIdsByIndex[index] ?? "").trim());
      });

      const response = await fetch("/api/admin/bulk-photo-upload", {
        method: "POST",
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Upload failed.");
      const uploadResults = (body.results ?? []) as Array<{ animalId: string; fileName: string; updated: boolean; error?: string }>;
      setResults(uploadResults);
      const successCount = uploadResults.filter((item) => item.updated).length;
      showToast(`Uploaded ${successCount}/${uploadResults.length} photo(s).`, successCount ? "success" : "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="crossover-card p-5">
      <header className="mb-4 flex items-center gap-3">
        <ImagePlus className="h-5 w-5 text-fitdog-orange" />
        <div>
          <h2 className="admin-page-title">Bulk Photo Upload</h2>
          <p className="admin-page-subtitle">Select one or more photos from phone/computer and map each to a Gingr animal ID.</p>
        </div>
      </header>
      <input
        type="file"
        accept="image/*"
        multiple
        className="admin-input w-full"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          setSelectedFiles(files);
          const mapped: Record<number, string> = {};
          files.forEach((file, index) => {
            mapped[index] = inferAnimalId(file.name);
          });
          setAnimalIdsByIndex(mapped);
          setResults([]);
        }}
      />
      {selectedFiles.length ? (
        <div className="mt-4 grid gap-3">
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="rounded-xl border border-admin-border p-3">
              <p className="text-sm font-semibold text-white">{file.name}</p>
              <input
                className="admin-input mt-2"
                placeholder="Gingr Animal ID"
                value={animalIdsByIndex[index] ?? ""}
                onChange={(event) => setAnimalIdsByIndex((current) => ({ ...current, [index]: event.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3">
        <button type="button" className="crossover-btn crossover-btn--primary" disabled={loading} onClick={() => void uploadPhotos()}>
          {loading ? "Uploading..." : "Upload Photos"}
        </button>
      </div>
      {results.length ? (
        <div className="mt-4 grid gap-2">
          {results.map((result) => (
            <div key={`${result.fileName}-${result.animalId}`} className="rounded-xl border border-admin-border p-3 text-sm">
              <span className="font-semibold text-white">{result.fileName}</span>
              <span className="ml-2 text-admin-muted">→ {result.animalId || "No animal ID"}</span>
              <span className={`ml-2 ${result.updated ? "text-emerald-300" : "text-rose-300"}`}>
                {result.updated ? "Uploaded" : result.error ?? "Failed"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function HandlerShiftEntryPanel() {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyShiftForm);
  const [entries, setEntries] = useState<CrossoverMessage[]>([]);
  const [actor, setActor] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load shift log entries.");
      const currentActor = body.currentUser?.email ?? body.currentUser?.adminUserId ?? "";
      setActor(currentActor);
      const mine = (body.crossover_messages ?? []).filter((item: CrossoverMessage) => {
        const submittedBy = shiftLogSubmittedBy(item);
        return submittedBy && currentActor && submittedBy.toLowerCase() === currentActor.toLowerCase();
      });
      setEntries(mine);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load shift log entries.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const assignOptions = useMemo(() => ["Front Desk"], []);

  async function submit(extra: Partial<ShiftLogFormShape> = {}) {
    const payload = { ...form, ...extra };
    setBusy(true);
    try {
      const response = await fetch("/api/admin/staff-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_crossover",
          log_type: payload.log_type,
          subject: payload.subject,
          details: payload.details,
          message: payload.details,
          priority: payload.priority,
          status: payload.status,
          assigned_to: payload.assigned_to,
          assigned_team: payload.assigned_to,
          related_dog_name: payload.related_dog_name || null,
          related_owner_name: payload.related_owner_name || null,
          department_area: payload.department_area || "Daycare",
          due_at: payload.due_at || null,
          reminder_at: payload.reminder_at || null,
          needs_management_review: payload.needs_management_review,
          urgent: payload.urgent,
          create_owner_follow_up: payload.create_owner_follow_up,
          create_active_issue: payload.create_active_issue,
          template_title: payload.template_title,
          template_id: payload.template_id,
          template_field_values: serializeTemplateFieldValues(payload.template_fields)
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save shift log entry.");
      showToast("Handler shift entry saved to Front Desk Log.", "success");
      setForm(emptyShiftForm);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save shift log entry.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crossover-dashboard space-y-5">
      <header className="crossover-dashboard__page-header">
        <h2 className="crossover-dashboard__page-title">Handler Shift Entry Log</h2>
        <p className="crossover-dashboard__page-subtitle">
          Submit shift log entries for daycare operations. Entries are reported to Front Desk Log.
        </p>
        {loading ? <span className="admin-badge mt-3 inline-block">Loading...</span> : null}
      </header>

      <AddShiftLogEntryCard
        form={form}
        patchForm={(patch) => setForm((current) => ({ ...current, ...patch }))}
        busy={busy}
        assignOptions={assignOptions}
        onSubmit={() => submit()}
        onSubmitAndFollowUp={() => submit({ create_owner_follow_up: true })}
      />

      <section className="crossover-card p-5">
        <div className="crossover-card__header crossover-card__header--compact">
          <h3 className="crossover-card__title">Your Entries</h3>
          <span className="crossover-link-btn">{entries.length} total</span>
        </div>
        <div className="grid gap-3">
          {entries.length ? entries.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-admin-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">{entry.subject}</p>
                <span className="crossover-badge">{entry.status}</span>
              </div>
              <p className="mt-2 text-sm text-admin-muted">{entry.details ?? entry.message}</p>
              <p className="mt-2 text-xs text-admin-muted">
                {entry.log_type ?? "Daycare Note"} • {formatDateTime(entry.created_at)}
                {entry.related_dog_name ? ` • ${entry.related_dog_name}` : ""}
              </p>
            </article>
          )) : (
            <p className="text-sm text-admin-muted">No entries yet. Use the form above to add your first handler shift entry.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function HandlerWriteUpsPanel() {
  const { showToast } = useToast();
  const [reports, setReports] = useState<ManagementReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/management-support?view=write_ups", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load write-ups.");
      setReports((body.reports as ManagementReport[]) ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load write-ups.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <section className="crossover-card p-5">
      <header className="mb-4">
        <h2 className="admin-page-title">Write Ups</h2>
        <p className="admin-page-subtitle">
          View-only list of write-ups submitted for your user profile.
        </p>
      </header>
      {loading ? <p className="text-sm text-admin-muted">Loading write-ups…</p> : null}
      <div className="grid gap-3">
        {reports.length ? reports.map((report) => (
          <article key={report.id} className="rounded-xl border border-admin-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-white">{report.title}</p>
              <span className="crossover-badge">{report.admin_status ?? report.status}</span>
            </div>
            <p className="mt-2 text-sm text-admin-muted">{report.summary}</p>
            <p className="mt-2 text-xs text-admin-muted">
              {formatDateTime(report.created_at)}
            </p>
          </article>
        )) : (
          <p className="text-sm text-admin-muted">
            No write-ups found for this Dog Handler profile.
          </p>
        )}
      </div>
    </section>
  );
}
