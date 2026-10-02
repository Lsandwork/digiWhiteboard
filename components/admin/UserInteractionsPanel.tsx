"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./user-interactions.css";
import { ISSUE_CATEGORIES, type StaffDirectoryMember } from "@/lib/staff/admin-ops";
import { readResponseJson } from "@/lib/http/read-response-json";
import { useToast } from "@/components/admin/ui/ToastProvider";
import {
  assignmentMatchesActor,
  filterMyItems,
  filterOpenInteractions,
  filterOverdueInteractions,
  searchInteractions,
  staffPriorityFromEmployee,
  type EmployeePriority,
  type UserInteractionActor,
  type UserInteractionCounts,
  type UserInteractionItem,
  type UserInteractionKind,
  type UserInteractionView
} from "@/lib/staff/user-interactions";

type Permissions = {
  canCreate: boolean;
  canEdit: boolean;
  canView: boolean;
  canManageRecords: boolean;
};

const EMPTY_COUNTS: UserInteractionCounts = {
  open: 0,
  myItems: 0,
  overdue: 0,
  archive: 0,
  completedToday: 0
};

export function UserInteractionsPanel() {
  const { showToast } = useToast();
  const [view, setView] = useState<UserInteractionView>("open");
  const [completedToday, setCompletedToday] = useState(false);
  const [query, setQuery] = useState("");
  const [openItems, setOpenItems] = useState<UserInteractionItem[]>([]);
  const [archiveItems, setArchiveItems] = useState<UserInteractionItem[]>([]);
  const [counts, setCounts] = useState<UserInteractionCounts>(EMPTY_COUNTS);
  const [directory, setDirectory] = useState<StaffDirectoryMember[]>([]);
  const [actor, setActor] = useState<UserInteractionActor>({});
  const [permissions, setPermissions] = useState<Permissions>({
    canCreate: false,
    canEdit: false,
    canView: true,
    canManageRecords: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<UserInteractionItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOpen = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/admin/staff-operations?view=open", {
        cache: "no-store",
        signal: controller.signal
      });
      const body = await readResponseJson<{
        error?: string;
        items?: UserInteractionItem[];
        counts?: UserInteractionCounts;
        currentUser?: UserInteractionActor;
        permissions?: Permissions;
        staff_directory?: StaffDirectoryMember[];
      }>(response);
      if (!response.ok) {
        throw new Error("We couldn't load your interactions. Please try again.");
      }
      setOpenItems(Array.isArray(body.items) ? body.items : []);
      if (body.counts) setCounts(body.counts);
      if (body.currentUser) setActor(body.currentUser);
      if (body.permissions) setPermissions(body.permissions);
      if (Array.isArray(body.staff_directory)) setDirectory(body.staff_directory);
    } catch {
      setError("We couldn't load your interactions. Please try again.");
      throw new Error("load failed");
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  const loadArchive = useCallback(async () => {
    const params = new URLSearchParams({ view: "archive", q: query, page: "1", limit: "40" });
    if (completedToday) params.set("completedToday", "1");
    const response = await fetch(`/api/admin/staff-operations?${params}`, { cache: "no-store" });
    const body = await readResponseJson<{ items?: UserInteractionItem[]; counts?: UserInteractionCounts; error?: string }>(
      response
    );
    if (!response.ok) throw new Error("We couldn't load your interactions. Please try again.");
    setArchiveItems(Array.isArray(body.items) ? body.items : []);
    if (body.counts) setCounts(body.counts);
  }, [completedToday, query]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadOpen();
      if (view === "archive") await loadArchive();
    } catch {
      // Error state is set in loadOpen.
    }
  }, [loadArchive, loadOpen, view]);

  useEffect(() => {
    setLoading(true);
    void loadOpen().catch(() => undefined);
  }, [loadOpen]);

  useEffect(() => {
    if (view !== "archive") return;
    void loadArchive().catch(() => setError("We couldn't load your interactions. Please try again."));
  }, [loadArchive, view]);

  const list = useMemo(() => {
    if (view === "archive") return archiveItems;
    if (view === "my_items") return searchInteractions(filterMyItems(openItems, actor), query);
    if (view === "overdue") return searchInteractions(filterOverdueInteractions(openItems), query);
    return searchInteractions(filterOpenInteractions(openItems), query);
  }, [actor, archiveItems, openItems, query, view]);

  async function mutate(action: Record<string, unknown>, success: string) {
    const response = await fetch("/api/admin/staff-operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action)
    });
    const body = await readResponseJson<{ error?: string }>(response);
    if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
    showToast(success, "success");
    await refresh();
  }

  async function completeItem(item: UserInteractionItem, resolutionNotes?: string) {
    setBusyId(item.id);
    try {
      if (item.kind === "follow_up") {
        await mutate(
          { action: "update_follow_up", id: item.id, status: "Resolved", resolution_notes: resolutionNotes },
          "Marked complete."
        );
      } else if (item.kind === "issue") {
        await mutate(
          { action: "update_issue", id: item.id, status: "Resolved", resolution_notes: resolutionNotes },
          "Marked complete."
        );
      } else {
        await mutate(
          { action: "update_crossover", id: item.id, status: "Resolved", resolution_notes: resolutionNotes },
          "Marked complete."
        );
      }
      setDetail(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not complete this item.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function reopenItem(item: UserInteractionItem) {
    setBusyId(item.id);
    try {
      const action =
        item.kind === "follow_up"
          ? "update_follow_up"
          : item.kind === "issue"
            ? "update_issue"
            : "update_crossover";
      await mutate({ action, id: item.id, status: "Open" }, "Reopened.");
      setDetail(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not reopen this item.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function assignItem(item: UserInteractionItem, assignedTo: string) {
    const action =
      item.kind === "follow_up" ? "update_follow_up" : item.kind === "issue" ? "update_issue" : "update_crossover";
    try {
      await mutate({ action, id: item.id, assigned_to: assignedTo || null }, "Assignment updated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update assignment.", "error");
    }
  }

  const assignOptions = directory.filter((member) => member.status === "Active").map((member) => member.name);

  if (error && !openItems.length && view !== "archive") {
    return (
      <section className="user-interactions">
        <header className="user-interactions__header">
          <h2>User Interactions</h2>
        </header>
        <p className="user-interactions__error">{error}</p>
        <button type="button" className="admin-btn-primary" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="user-interactions">
      <header className="user-interactions__header">
        <div>
          <h2>User Interactions</h2>
          <p>Write something down, keep it visible until it is done, and find it later.</p>
        </div>
        {permissions.canCreate ? (
          <button type="button" className="admin-btn-primary user-interactions__new" onClick={() => setFormOpen(true)}>
            + New interaction
          </button>
        ) : null}
      </header>

      <div className="user-interactions__chips" role="tablist" aria-label="Interaction filters">
        <FilterChip label="Open" count={counts.open} active={view === "open"} onClick={() => setView("open")} />
        <FilterChip label="My items" count={counts.myItems} active={view === "my_items"} onClick={() => setView("my_items")} />
        <FilterChip label="Overdue" count={counts.overdue} active={view === "overdue"} onClick={() => setView("overdue")} />
        <FilterChip label="Archive" count={counts.archive} active={view === "archive"} onClick={() => setView("archive")} />
      </div>

      {view === "archive" ? (
        <label className="user-interactions__completed-today">
          <input type="checkbox" checked={completedToday} onChange={(event) => setCompletedToday(event.target.checked)} />
          Completed today
        </label>
      ) : null}

      <input
        className="user-interactions__search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search subject, details, owner, dog, or staff"
        aria-label="Search interactions"
      />

      {loading ? <p className="user-interactions__muted">Loading…</p> : null}

      {!loading && !list.length ? (
        <p className="user-interactions__empty">
          {view === "open" ? "Nothing open. Log something with New interaction." : "No matching interactions."}
        </p>
      ) : null}

      <ul className="user-interactions__list">
        {list.map((item) => (
          <li key={`${item.sourceTable}:${item.id}`} className={`user-interactions__card user-interactions__card--${item.employeePriority.toLowerCase()}`}>
            <div className="user-interactions__card-main">
              <p className="user-interactions__priority">{item.employeePriority}</p>
              <h3>{item.subject}</h3>
              {item.details ? <p className="user-interactions__details">{item.details}</p> : null}
              <p className="user-interactions__meta">
                Assigned to: {item.assignedTo || "Unassigned"}
                {" · "}
                {item.dueLabel}
                {item.dogName ? ` · ${item.dogName}` : ""}
                {item.ownerName ? ` · ${item.ownerName}` : ""}
                {" · "}
                {item.employeeStatus}
              </p>
              {item.historyLine ? <p className="user-interactions__history">{item.historyLine}</p> : null}
            </div>
            <div className="user-interactions__actions">
              {item.employeeStatus !== "Done" && permissions.canEdit ? (
                <button
                  type="button"
                  className="admin-btn-primary"
                  disabled={busyId === item.id}
                  onClick={() => {
                    if (item.employeePriority === "High" || item.employeePriority === "Urgent") {
                      const note = window.prompt("Resolution note (optional for High/Urgent):") ?? undefined;
                      void completeItem(item, note?.trim() || undefined);
                    } else {
                      void completeItem(item);
                    }
                  }}
                >
                  Complete
                </button>
              ) : null}
              {item.employeeStatus === "Done" && permissions.canEdit ? (
                <button type="button" className="admin-btn-secondary" disabled={busyId === item.id} onClick={() => void reopenItem(item)}>
                  Reopen
                </button>
              ) : null}
              <button type="button" className="admin-btn-secondary" onClick={() => setDetail(item)}>
                View
              </button>
            </div>
          </li>
        ))}
      </ul>

      {formOpen ? (
        <NewInteractionSheet
          assignOptions={assignOptions}
          defaultAssignee={actor.name || actor.email || ""}
          allowFollowUpAndIssue={permissions.canManageRecords}
          onClose={() => setFormOpen(false)}
          onCreated={async () => {
            setFormOpen(false);
            setView("open");
            await refresh();
          }}
        />
      ) : null}

      {detail ? (
        <DetailSheet
          item={detail}
          assignOptions={assignOptions}
          canEdit={permissions.canEdit}
          busy={busyId === detail.id}
          isMine={assignmentMatchesActor(detail, actor)}
          onClose={() => setDetail(null)}
          onAssign={(value) => void assignItem(detail, value)}
          onComplete={(note) => void completeItem(detail, note)}
          onReopen={() => void reopenItem(detail)}
        />
      ) : null}
    </section>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`user-interactions__chip${active ? " is-active" : ""}`} onClick={onClick} aria-pressed={active}>
      {label} {count}
    </button>
  );
}

function NewInteractionSheet({
  assignOptions,
  defaultAssignee,
  allowFollowUpAndIssue,
  onClose,
  onCreated
}: {
  assignOptions: string[];
  defaultAssignee: string;
  allowFollowUpAndIssue: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [kind, setKind] = useState<UserInteractionKind>("note");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<EmployeePriority>("Normal");
  const [assignedTo, setAssignedTo] = useState(defaultAssignee);
  const [due, setDue] = useState("");
  const [dog, setDog] = useState("");
  const [owner, setOwner] = useState("");
  const [category, setCategory] = useState<(typeof ISSUE_CATEGORIES)[number]>("General");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!subject.trim()) {
      setFormError("Subject is required.");
      return;
    }
    if (kind === "note" && !details.trim()) {
      setFormError("Details are required for a note.");
      return;
    }
    if (kind === "follow_up" && !owner.trim()) {
      setFormError("Owner is required for a follow-up.");
      return;
    }
    setSaving(true);
    try {
      const assignee = assignedTo.trim() || defaultAssignee;
      const staffPriority = staffPriorityFromEmployee(priority);
      const body =
        kind === "follow_up"
          ? {
              action: "create_follow_up",
              subject: subject.trim(),
              owner_name: owner.trim(),
              assigned_to: assignee,
              follow_up_notes: details.trim(),
              due_date: due || null,
              dog_name: dog.trim() || null,
              priority: staffPriority,
              urgent: priority === "Urgent"
            }
          : kind === "issue"
            ? {
                action: "create_issue",
                title: subject.trim(),
                notes: details.trim() || null,
                category,
                priority: staffPriority,
                assigned_to: assignee || null,
                due_at: due || null,
                related_dog_name: dog.trim() || null,
                related_owner_name: owner.trim() || null,
                source: "Manual"
              }
            : {
                action: "create_crossover",
                subject: subject.trim(),
                details: details.trim(),
                priority: staffPriority,
                urgent: priority === "Urgent",
                assigned_to: assignee,
                due_at: due || null,
                related_dog_name: dog.trim() || null,
                related_owner_name: owner.trim() || null
              };
      const response = await fetch("/api/admin/staff-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Could not save this interaction.");
      showToast("Interaction saved.", "success");
      await onCreated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this interaction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="user-interactions__sheet" role="dialog" aria-labelledby="new-interaction-title">
      <form className="user-interactions__sheet-card" onSubmit={(event) => void submit(event)}>
        <div className="user-interactions__sheet-head">
          <h3 id="new-interaction-title">New interaction</h3>
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <fieldset className="user-interactions__kinds">
          <legend>What is this?</legend>
          <label>
            <input type="radio" name="kind" checked={kind === "note"} onChange={() => setKind("note")} /> Note
          </label>
          {allowFollowUpAndIssue ? (
            <>
              <label>
                <input type="radio" name="kind" checked={kind === "follow_up"} onChange={() => setKind("follow_up")} /> Follow-up
              </label>
              <label>
                <input type="radio" name="kind" checked={kind === "issue"} onChange={() => setKind("issue")} /> Issue
              </label>
            </>
          ) : null}
        </fieldset>
        <label>
          {kind === "issue" ? "Title" : "Subject"}
          <input value={subject} onChange={(event) => setSubject(event.target.value)} required />
        </label>
        <label>
          Details
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={4} />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value as EmployeePriority)}>
            <option>Normal</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
        </label>
        <label>
          Assign to
          <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
            <option value={defaultAssignee}>{defaultAssignee || "Me"}</option>
            {assignOptions
              .filter((name) => name !== defaultAssignee)
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Due
          <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
        </label>
        <label>
          Dog
          <input value={dog} onChange={(event) => setDog(event.target.value)} />
        </label>
        <label>
          Owner {kind === "follow_up" ? "(required)" : ""}
          <input value={owner} onChange={(event) => setOwner(event.target.value)} />
        </label>
        {kind === "issue" ? (
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as (typeof ISSUE_CATEGORIES)[number])}>
              {ISSUE_CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        ) : null}
        {formError ? <p className="user-interactions__error">{formError}</p> : null}
        <button type="submit" className="admin-btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Submit"}
        </button>
      </form>
    </div>
  );
}

function DetailSheet({
  item,
  assignOptions,
  canEdit,
  busy,
  isMine,
  onClose,
  onAssign,
  onComplete,
  onReopen
}: {
  item: UserInteractionItem;
  assignOptions: string[];
  canEdit: boolean;
  busy: boolean;
  isMine: boolean;
  onClose: () => void;
  onAssign: (value: string) => void;
  onComplete: (note?: string) => void;
  onReopen: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="user-interactions__sheet" role="dialog" aria-labelledby="interaction-detail-title">
      <div className="user-interactions__sheet-card">
        <div className="user-interactions__sheet-head">
          <h3 id="interaction-detail-title">{item.subject}</h3>
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="user-interactions__details">{item.details || "No details."}</p>
        <p className="user-interactions__meta">
          {item.employeeStatus} · {item.dueLabel}
          {isMine ? " · Assigned to you" : ""}
        </p>
        {item.historyLine ? <p className="user-interactions__history">{item.historyLine}</p> : null}
        {canEdit ? (
          <label>
            Assigned to
            <select value={item.assignedTo || ""} onChange={(event) => onAssign(event.target.value)}>
              <option value="">Unassigned</option>
              {assignOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>Assigned to: {item.assignedTo || "Unassigned"}</p>
        )}
        {item.replies.length ? (
          <ul className="user-interactions__replies">
            {item.replies.map((reply) => (
              <li key={reply.id}>
                <strong>{reply.created_by || "Staff"}</strong>: {reply.message}
              </li>
            ))}
          </ul>
        ) : null}
        {item.employeeStatus !== "Done" && (item.employeePriority === "High" || item.employeePriority === "Urgent") ? (
          <label>
            Resolution note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </label>
        ) : null}
        <div className="user-interactions__actions">
          {item.employeeStatus !== "Done" && canEdit ? (
            <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => onComplete(note.trim() || undefined)}>
              Complete
            </button>
          ) : null}
          {item.employeeStatus === "Done" && canEdit ? (
            <button type="button" className="admin-btn-secondary" disabled={busy} onClick={onReopen}>
              Reopen
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
