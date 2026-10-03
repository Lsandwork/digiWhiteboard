"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { readResponseJson } from "@/lib/http/read-response-json";
import type { StaffDirectoryMember } from "@/lib/staff/admin-ops";
import type { UserInteractionsViewResponse } from "@/lib/user-interactions/api-view";
import {
  completionStatusForNote,
  mapEmployeePriorityToBackend,
  needsResolutionNoteOnComplete
} from "@/lib/user-interactions/lifecycle";
import { formatDueLabelPacific, pacificDateInputToIso } from "@/lib/user-interactions/pacific";
import type { UnifiedInteraction, UserInteractionsFilter } from "@/lib/user-interactions/unified";
import { parseUnifiedInteractionId } from "@/lib/user-interactions/unified";

type FormKind = "note" | "follow_up" | "issue";

const FILTERS: { id: UserInteractionsFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "mine", label: "My items" },
  { id: "overdue", label: "Overdue" },
  { id: "archive", label: "Archive" }
];

function activeStaffOptions(directory: StaffDirectoryMember[] | undefined) {
  const names = (directory ?? [])
    .filter((m) => m.status === "Active")
    .map((m) => m.name)
    .filter(Boolean);
  return [...new Set(["Front Desk Team", "Team Leaders", "Management", ...names])];
}

export function UserInteractionsPanel() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<UserInteractionsFilter>("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserInteractionsViewResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<UnifiedInteraction | null>(null);
  const [completeTarget, setCompleteTarget] = useState<UnifiedInteraction | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const [formKind, setFormKind] = useState<FormKind>("note");
  const [formError, setFormError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [dogName, setDogName] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<"Normal" | "High" | "Urgent">("Normal");
  const [dueDate, setDueDate] = useState("");

  const assignOptions = useMemo(() => activeStaffOptions(data?.staffDirectory), [data?.staffDirectory]);

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view: filter,
        page: String(page),
        q: search.trim()
      });
      const res = await fetch(`/api/admin/staff-operations?${params.toString()}`, { cache: "no-store" });
      const body = await readResponseJson<UserInteractionsViewResponse & { error?: string }>(res);
      if (!res.ok || !body.interactions) {
        throw new Error(body.error || "load failed");
      }
      setData(body);
    } catch {
      setLoadError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filter, page, search]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff-operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(body.error || "Save failed");
      showToast(success, "success");
      await load();
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Something went wrong.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitNew() {
    setFormError(null);
    const submitter =
      data?.currentUser.displayName?.trim() ||
      data?.currentUser.email?.trim() ||
      "Staff";
    const assignee = assignedTo.trim() || submitter;
    const backendPriority = mapEmployeePriorityToBackend(priority);
    const dueIso = dueDate ? pacificDateInputToIso(dueDate) : null;

    if (formKind === "note") {
      if (!subject.trim() || !details.trim()) {
        setFormError("Subject and details are required.");
        return;
      }
      const ok = await mutate(
        {
          action: "create_crossover",
          subject: subject.trim(),
          details: details.trim(),
          message: details.trim(),
          log_type: "General Shift Note",
          priority: backendPriority,
          status: "Open",
          assigned_to: assignee,
          assigned_team: assignee,
          related_dog_name: dogName.trim() || null,
          related_owner_name: ownerName.trim() || null,
          due_at: dueIso,
          urgent: priority === "Urgent"
        },
        "Interaction saved."
      );
      if (ok) {
        setShowNew(false);
        resetForm();
      }
      return;
    }

    if (formKind === "follow_up") {
      if (!ownerName.trim()) {
        setFormError("Owner is required for a follow-up.");
        return;
      }
      if (!subject.trim()) {
        setFormError("Subject is required.");
        return;
      }
      const ok = await mutate(
        {
          action: "create_follow_up",
          subject: subject.trim(),
          owner_name: ownerName.trim(),
          assigned_to: assignee,
          follow_up_notes: details.trim() || null,
          dog_name: dogName.trim() || null,
          priority: backendPriority,
          due_date: dueIso,
          urgent: priority === "Urgent"
        },
        "Follow-up saved."
      );
      if (ok) {
        setShowNew(false);
        resetForm();
      }
      return;
    }

    if (!subject.trim()) {
      setFormError("Title is required.");
      return;
    }
    const ok = await mutate(
      {
        action: "create_issue",
        title: subject.trim(),
        notes: details.trim() || null,
        category: "General",
        priority: backendPriority,
        assigned_to: assignee,
        related_owner_name: ownerName.trim() || null,
        related_dog_name: dogName.trim() || null,
        due_at: dueIso
      },
      "Issue saved."
    );
    if (ok) {
      setShowNew(false);
      resetForm();
    }
  }

  function resetForm() {
    setSubject("");
    setDetails("");
    setOwnerName("");
    setDogName("");
    setAssignedTo("");
    setPriority("Normal");
    setDueDate("");
    setFormError(null);
  }

  async function completeItem(item: UnifiedInteraction, note?: string) {
    const parsed = parseUnifiedInteractionId(item.id);
    if (!parsed) return;
    if (parsed.sourceTable === "crossover_messages") {
      const status = completionStatusForNote({
        subject: item.subject,
        message: item.details,
        details: item.details,
        log_type: item.logType ?? "General Shift Note",
        template_title: null
      });
      await mutate(
        {
          action: "update_crossover",
          id: parsed.sourceId,
          status,
          resolution_notes: note?.trim() || undefined
        },
        "Marked complete."
      );
      return;
    }
    if (parsed.sourceTable === "owner_follow_ups") {
      await mutate(
        {
          action: "update_follow_up",
          id: parsed.sourceId,
          status: "Resolved",
          resolution_notes: note?.trim() || undefined
        },
        "Marked complete."
      );
      return;
    }
    await mutate(
      {
        action: "update_issue",
        id: parsed.sourceId,
        status: "Resolved",
        resolution_notes: note?.trim() || undefined
      },
      "Marked complete."
    );
  }

  async function reopenItem(item: UnifiedInteraction) {
    const parsed = parseUnifiedInteractionId(item.id);
    if (!parsed) return;
    const action =
      parsed.sourceTable === "crossover_messages"
        ? "update_crossover"
        : parsed.sourceTable === "owner_follow_ups"
          ? "update_follow_up"
          : "update_issue";
    await mutate({ action, id: parsed.sourceId, status: "Open" }, "Reopened.");
    if (parsed.sourceTable === "crossover_messages") {
      await mutate(
        {
          action: "reply_crossover",
          id: parsed.sourceId,
          message: `Reopened by ${data?.currentUser.displayName ?? "staff"}.`,
          update_type: "Reopen"
        },
        "Update added."
      );
    }
  }

  function onCompleteClick(item: UnifiedInteraction) {
    const needsNote = needsResolutionNoteOnComplete(
      mapEmployeePriorityToBackend(item.priority),
      item.urgent
    );
    if (needsNote) {
      setCompleteTarget(item);
      setResolutionNote("");
      return;
    }
    void completeItem(item);
  }

  const counts = data?.counts ?? { open: 0, mine: 0, overdue: 0, archive: 0 };
  const rows = data?.interactions ?? [];
  const staffOptions = assignOptions;

  if (loadError) {
    return (
      <div className="user-interactions">
        <div className="user-interactions__error">
          <p>We couldn&apos;t load your interactions. Please try again.</p>
          <button type="button" className="crossover-btn crossover-btn--primary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="user-interactions">
      <header className="user-interactions__header">
        <div>
          <h2 className="user-interactions__title">User Interactions</h2>
          <p className="user-interactions__subtitle">Write it down, keep it visible, finish it when it&apos;s done.</p>
        </div>
        <button
          type="button"
          className="user-interactions__new-btn crossover-btn crossover-btn--primary"
          disabled={!data?.permissions.canCreate || busy}
          onClick={() => {
            resetForm();
            setFormKind("note");
            setShowNew(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          New interaction
        </button>
      </header>

      <div className="user-interactions__chips" role="tablist">
        {FILTERS.map((chip) => {
          const count =
            chip.id === "open"
              ? counts.open
              : chip.id === "mine"
                ? counts.mine
                : chip.id === "overdue"
                  ? counts.overdue
                  : counts.archive;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={filter === chip.id}
              className={`user-interactions__chip ${filter === chip.id ? "user-interactions__chip--active" : ""}`}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label} {count}
            </button>
          );
        })}
        <button
          type="button"
          className={`user-interactions__chip ${filter === "completed_today" ? "user-interactions__chip--active" : ""}`}
          onClick={() => setFilter("completed_today")}
        >
          Completed today
        </button>
      </div>

      <label className="user-interactions__search crossover-search">
        <Search className="crossover-search__icon-lucide" aria-hidden />
        <input
          className="crossover-input crossover-search__input"
          placeholder="Search interactions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      {loading ? <p className="user-interactions__loading">Loading…</p> : null}

      <ul className="user-interactions__list">
        {rows.map((row) => (
          <li key={row.id} className={`user-interactions__card ${row.urgent || row.priority === "Urgent" ? "user-interactions__card--urgent" : row.priority === "High" ? "user-interactions__card--high" : ""}`}>
            <div className="user-interactions__card-main">
              <p className="user-interactions__card-subject">{row.subject}</p>
              {row.details ? <p className="user-interactions__card-details">{row.details.slice(0, 160)}</p> : null}
              <div className="user-interactions__card-meta">
                <span>{row.employeeStatus}</span>
                <span>Assigned: {row.assignedTo?.trim() || "Unassigned"}</span>
                <span>{formatDueLabelPacific(row.dueAt)}</span>
                {row.dogName ? <span>Dog: {row.dogName}</span> : null}
                {row.ownerName ? <span>Owner: {row.ownerName}</span> : null}
              </div>
            </div>
            <div className="user-interactions__card-actions">
              {row.employeeStatus !== "Done" ? (
                <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy} onClick={() => onCompleteClick(row)}>
                  Complete
                </button>
              ) : (
                <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => void reopenItem(row)}>
                  Reopen
                </button>
              )}
              <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => setDetail(row)}>
                View
              </button>
            </div>
          </li>
        ))}
        {!loading && !rows.length ? (
          <li className="user-interactions__empty">No interactions in this view.</li>
        ) : null}
      </ul>

      {data && data.maxPage > 1 ? (
        <div className="user-interactions__pager">
          <button type="button" disabled={page <= 1 || busy} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {data.page} of {data.maxPage}
          </span>
          <button type="button" disabled={page >= data.maxPage || busy} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      ) : null}

      <button type="button" className="user-interactions__refresh crossover-btn crossover-btn--outline" onClick={() => void load()} disabled={busy}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
      </button>

      <Modal open={showNew} title="New interaction" onClose={() => setShowNew(false)} size="lg">
        <div className="user-interactions__form">
          <fieldset className="user-interactions__kind">
            <legend>What is this?</legend>
            {(["note", "follow_up", "issue"] as const).map((kind) => (
              <label key={kind}>
                <input type="radio" name="kind" checked={formKind === kind} onChange={() => setFormKind(kind)} />
                {kind === "note" ? "Note" : kind === "follow_up" ? "Follow-up" : "Issue"}
              </label>
            ))}
          </fieldset>
          {formError ? <p className="user-interactions__form-error">{formError}</p> : null}
          <label>
            {formKind === "issue" ? "Title" : "Subject"}
            <input className="crossover-input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            Details
            <textarea className="crossover-input w-full min-h-[88px]" value={details} onChange={(e) => setDetails(e.target.value)} />
          </label>
          {formKind === "follow_up" || formKind === "note" || formKind === "issue" ? (
            <label>
              Owner {formKind === "follow_up" ? "(required)" : ""}
              <input className="crossover-input w-full" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </label>
          ) : null}
          <label>
            Dog
            <input className="crossover-input w-full" value={dogName} onChange={(e) => setDogName(e.target.value)} />
          </label>
          <label>
            Assign to
            <select className="crossover-input w-full" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Default to me</option>
              {staffOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              className="crossover-input w-full"
              value={priority}
              onChange={(e) => setPriority(e.target.value as "Normal" | "High" | "Urgent")}
            >
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>
          <label>
            Due date
            <input type="date" className="crossover-input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <div className="user-interactions__form-actions">
            <button type="button" className="crossover-btn crossover-btn--outline" onClick={() => setShowNew(false)}>
              Cancel
            </button>
            <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy} onClick={() => void submitNew()}>
              Submit
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(detail)} title={detail?.subject ?? "Interaction"} onClose={() => setDetail(null)} size="lg">
        {detail ? (
          <div className="user-interactions__detail">
            <p className="whitespace-pre-wrap">{detail.details || "No details."}</p>
            <p className="text-sm text-admin-muted mt-3">Status: {detail.employeeStatus}</p>
            <label className="block mt-3">
              Assigned to
              <select
                className="crossover-input w-full mt-1"
                value={detail.assignedTo ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const parsed = parseUnifiedInteractionId(detail.id);
                  if (!parsed) return;
                  const action =
                    parsed.sourceTable === "crossover_messages"
                      ? "update_crossover"
                      : parsed.sourceTable === "owner_follow_ups"
                        ? "update_follow_up"
                        : "update_issue";
                  void mutate({ action, id: parsed.sourceId, assigned_to: e.target.value }, "Assignment updated.").then((ok) => {
                    if (ok) setDetail({ ...detail, assignedTo: e.target.value });
                  });
                }}
              >
                {staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(completeTarget)} title="Complete interaction" onClose={() => setCompleteTarget(null)}>
        <p className="mb-3 text-sm">Add a brief resolution note for this high-priority item.</p>
        <textarea className="crossover-input w-full min-h-[80px]" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" className="crossover-btn crossover-btn--outline" onClick={() => setCompleteTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={busy || !resolutionNote.trim()}
            onClick={() => {
              if (!completeTarget) return;
              void completeItem(completeTarget, resolutionNote).then(() => setCompleteTarget(null));
            }}
          >
            Complete
          </button>
        </div>
      </Modal>
    </div>
  );
}
