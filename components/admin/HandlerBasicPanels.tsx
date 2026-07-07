"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, ImagePlus } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { AddShiftLogEntryCard, type ShiftLogFormShape } from "@/components/admin/front-desk/FrontDeskLogUI";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";
import { shiftLogSubmittedBy } from "@/lib/staff/front-desk-log";
import { serializeTemplateFieldValues } from "@/lib/frontDeskLog/logTemplates";

const CHECKLIST_ITEMS = [
  "Clock in and confirm yard assignment.",
  "Check leash/fanny-pack supplies and report missing items.",
  "Review dogs that need special handling today.",
  "Log behavior/safety notes before shift end."
];

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
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("fitdog_handler_checklist");
      if (raw) setChecked(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // ignore parse issues
    }
  }, []);

  function toggle(item: string) {
    const next = { ...checked, [item]: !checked[item] };
    setChecked(next);
    window.localStorage.setItem("fitdog_handler_checklist", JSON.stringify(next));
  }

  return (
    <section className="crossover-card p-5">
      <header className="mb-4 flex items-center gap-3">
        <CheckSquare className="h-5 w-5 text-fitdog-orange" />
        <div>
          <h2 className="admin-page-title">Check List</h2>
          <p className="admin-page-subtitle">Track required handler tasks for this shift.</p>
        </div>
      </header>
      <div className="grid gap-2">
        {CHECKLIST_ITEMS.map((item) => (
          <label key={item} className="flex items-start gap-3 rounded-xl border border-admin-border p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={Boolean(checked[item])} onChange={() => toggle(item)} />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

export function BulkPhotoUploadPanel() {
  const { showToast } = useToast();
  const [animalIds, setAnimalIds] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; photoUrl: string | null }>>([]);

  async function runLookup() {
    const ids = animalIds
      .split(/\s|,|\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!ids.length) {
      showToast("Enter at least one animal ID.", "error");
      return;
    }
    setLoading(true);
    try {
      const mapped = await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/gingr/animal-photo?animalId=${encodeURIComponent(id)}`);
          const body = (await response.json().catch(() => ({}))) as { photoUrl?: string | null };
          return { id, photoUrl: response.ok ? body.photoUrl ?? null : null };
        })
      );
      setResults(mapped);
      showToast("Photo lookup complete.", "success");
    } catch {
      showToast("Unable to check photos right now.", "error");
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
          <p className="admin-page-subtitle">Paste Gingr animal IDs to verify photo availability in batch.</p>
        </div>
      </header>
      <textarea
        className="crossover-input min-h-32 w-full"
        placeholder="Paste animal IDs, separated by commas or new lines"
        value={animalIds}
        onChange={(event) => setAnimalIds(event.target.value)}
      />
      <div className="mt-3">
        <button type="button" className="crossover-btn crossover-btn--primary" disabled={loading} onClick={() => void runLookup()}>
          {loading ? "Checking..." : "Check Photos"}
        </button>
      </div>
      {results.length ? (
        <div className="mt-4 grid gap-2">
          {results.map((result) => (
            <div key={result.id} className="rounded-xl border border-admin-border p-3 text-sm">
              <span className="font-semibold text-white">{result.id}</span>
              <span className="ml-2 text-admin-muted">{result.photoUrl ? "Photo found" : "No photo found"}</span>
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
