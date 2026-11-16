"use client";

import { useEffect, useMemo, useState } from "react";
import AnalyticsIntelligenceDashboard from "@/components/admin/team-engagement/AnalyticsIntelligenceDashboard";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";
import {
  EngagementDataTable,
  EngagementPremiumSection,
  EngagementStatusPill,
  EngagementToolbar
} from "@/components/admin/team-engagement/EngagementAdminChrome";
import {
  DEVELOPMENT_RECORD_TYPE_LABELS,
  DEVELOPMENT_RECORD_TYPES,
  DEVELOPMENT_STATUS_LABELS,
  DEVELOPMENT_STATUSES,
  FEEDBACK_STATUS_LABELS,
  PROGRAM_CADENCES,
  PROGRAM_STATUSES,
  PROGRAM_TYPE_LABELS,
  PROGRAM_TYPES
} from "@/lib/team-engagement/constants";

type ActionHandler = (action: string, payload: Record<string, unknown>) => Promise<void>;

function ListSection({
  title,
  empty,
  children
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <EngagementPremiumSection title={title}>
      {empty ? <p className="ro-te-muted">{empty}</p> : null}
      {!empty ? children : null}
    </EngagementPremiumSection>
  );
}

export function AnalyticsAdminBody({ data }: { data: Record<string, unknown> }) {
  const notice = typeof data.error === "string" ? data.error : null;
  return <AnalyticsIntelligenceDashboard notice={notice} />;
}

export function FeedbackAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      const status = String(row.status ?? "submitted");
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${row.subject ?? ""} ${row.message ?? row.body ?? ""} ${row.submitterName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, statusFilter]);

  return (
    <EngagementPremiumSection title="Team feedback & suggestions" description="Respond to suggestions and mark items resolved — updates sync to the employee feedback view.">
      <EngagementToolbar>
        <input
          className="ro-te-input"
          placeholder="Search subject, message, or teammate…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search feedback"
        />
        <select className="ro-te-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {Object.entries(FEEDBACK_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <span className="ro-te-muted" style={{ fontSize: 12 }}>
          {filtered.length} shown
        </span>
      </EngagementToolbar>
      {filtered.length ? (
        <ul className="ro-te-list">
          {filtered.map((row) => (
            <FeedbackRow key={String(row.id)} row={row} onAction={onAction} onRefresh={onRefresh} />
          ))}
        </ul>
      ) : (
        <div className="ro-ai-empty">
          <h3>{items.length ? "No matches" : "No feedback in your scope yet"}</h3>
          <p>{items.length ? "Try another search or status filter." : "When teammates submit suggestions they appear here."}</p>
        </div>
      )}
    </EngagementPremiumSection>
  );
}

function FeedbackRow({
  row,
  onAction,
  onRefresh
}: {
  row: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const [response, setResponse] = useState("");
  const [resolution, setResolution] = useState("Thanks — we implemented this.");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = String(row.id);
  const status = FEEDBACK_STATUS_LABELS[row.status as keyof typeof FEEDBACK_STATUS_LABELS] ?? String(row.status ?? "open");
  return (
    <li className="ro-te-list__item">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{String(row.subject ?? "Suggestion")}</strong>
        <EngagementStatusPill status={status} />
        <span className="ro-te-muted">· {String(row.submitterName ?? "")}</span>
      </div>
      <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{String(row.message ?? row.body ?? "")}</p>
      {onAction ? (
        <div className="ro-te-stack" style={{ marginTop: 8 }}>
          <textarea
            value={response}
            rows={2}
            maxLength={3000}
            placeholder="Reply to the teammate…"
            onChange={(event) => setResponse(event.target.value)}
          />
          <div className="ro-te-actions">
            <button
              type="button"
              className="ro-te-btn ro-te-btn--primary"
              disabled={busy || response.trim().length < 3}
              onClick={() => {
                setBusy(true);
                void onAction("respond_feedback", { id, body: response })
                  .then(() => {
                    setResponse("");
                    onRefresh?.();
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Send response
            </button>
            <button
              type="button"
              className="ro-te-btn ro-te-btn--ghost"
              disabled={busy}
              onClick={() => setResolveOpen((open) => !open)}
            >
              {resolveOpen ? "Cancel resolve" : "Mark resolved"}
            </button>
          </div>
          {resolveOpen ? (
            <div className="ro-te-stack">
              <label className="ro-te-field">
                Resolution message (shown to the teammate)
                <textarea value={resolution} rows={2} maxLength={2000} onChange={(event) => setResolution(event.target.value)} />
              </label>
              <button
                type="button"
                className="ro-te-btn ro-te-btn--primary"
                disabled={busy || resolution.trim().length < 5}
                onClick={() => {
                  setBusy(true);
                  void onAction("update_feedback", { id, status: "resolved", resolution: resolution.trim() })
                    .then(() => {
                      setResolveOpen(false);
                      onRefresh?.();
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Confirm resolved
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function AnnouncementsAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction: ActionHandler;
  onRefresh: () => void;
}) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) => {
      const hay = `${row.title ?? ""} ${row.body ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <div className="ro-te-stack">
      <EngagementPremiumSection
        title="Post announcement"
        description="Published announcements appear in Pack home and engagement surfaces for the selected audience."
      >
        <label className="ro-te-field">
          Title
          <input value={title} disabled={postBusy} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="ro-te-field">
          Message
          <textarea value={body} rows={4} disabled={postBusy} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button
          type="button"
          className="ro-te-btn ro-te-btn--primary"
          disabled={postBusy || title.trim().length < 3 || body.trim().length < 5}
          onClick={() => {
            setPostBusy(true);
            void onAction("create_announcement", { title: title.trim(), body: body.trim() })
              .then(() => {
                setTitle("");
                setBody("");
                onRefresh();
              })
              .finally(() => setPostBusy(false));
          }}
        >
          {postBusy ? "Publishing…" : "Publish"}
        </button>
      </EngagementPremiumSection>
      <EngagementPremiumSection title="Announcements library">
        <EngagementToolbar>
          <input
            className="ro-te-input"
            placeholder="Search title or message…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search announcements"
          />
          <span className="ro-te-muted" style={{ fontSize: 12 }}>
            {filtered.length} shown
          </span>
        </EngagementToolbar>
        <EngagementDataTable
          emptyTitle="No announcements yet"
          emptyBody="Publish an announcement above — it will appear here and in Team Engagement for staff."
          columns={[
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "published", label: "Published" },
            { key: "author", label: "Author" },
            { key: "actions", label: "" }
          ]}
          rows={filtered.map((row) => {
            const id = String(row.id);
            const status = String(row.status ?? "published");
            return {
              id,
              cells: {
                title: (
                  <div>
                    <strong>{String(row.title)}</strong>
                    <div className="ro-ai-answer" style={{ marginTop: 4 }}>
                      {String(row.body ?? "")}
                    </div>
                  </div>
                ),
                status: <EngagementStatusPill status={status} />,
                published: formatPacificDateTime(row.publishedAt ?? row.published_at ?? row.created_at),
                author: String(row.authorName ?? row.created_by_name ?? "—"),
                actions: (
                  <button
                    type="button"
                    className="ro-te-btn ro-te-btn--ghost"
                    disabled={busyId === id || status === "archived"}
                    onClick={() => {
                      if (!window.confirm("Archive this announcement? It will stop showing to staff.")) return;
                      setBusyId(id);
                      void onAction("archive_announcement", { id })
                        .then(onRefresh)
                        .finally(() => setBusyId(null));
                    }}
                  >
                    Archive
                  </button>
                )
              }
            };
          })}
        />
      </EngagementPremiumSection>
    </div>
  );
}

function formatPacificDateTime(value: unknown) {
  if (!value || typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function ProgramsAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const programs = (data.programs as Array<Record<string, unknown>>) ?? (data.items as Array<Record<string, unknown>>) ?? [];
  const nominations = (data.nominations as Array<Record<string, unknown>>) ?? [];
  const [name, setName] = useState("");
  const [programType, setProgramType] = useState<string>(PROGRAM_TYPES[0]);
  const [cadence, setCadence] = useState<string>(PROGRAM_CADENCES[0]);
  const [description, setDescription] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [progQuery, setProgQuery] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<string>(PROGRAM_STATUSES[0]);
  const [editBusy, setEditBusy] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [nomBusy, setNomBusy] = useState<string | null>(null);

  const filteredPrograms = useMemo(() => {
    const q = progQuery.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((row) => `${row.name ?? ""} ${row.description ?? ""}`.toLowerCase().includes(q));
  }, [programs, progQuery]);

  const openNominations = nominations.filter((row) => row.status === "submitted" || row.status === "under_review");

  return (
    <div className="ro-te-stack">
      {onAction ? (
        <EngagementPremiumSection title="Create recognition program" description="Programs power nominations and recognition cycles in Team Engagement.">
          <div className="ro-te-form">
            <label className="ro-te-field">
              Program name
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={createBusy} placeholder="Outstanding teamwork" />
            </label>
            <label className="ro-te-field">
              Type
              <select className="ro-te-select" value={programType} disabled={createBusy} onChange={(e) => setProgramType(e.target.value)}>
                {PROGRAM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROGRAM_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="ro-te-field">
              Cadence
              <select className="ro-te-select" value={cadence} disabled={createBusy} onChange={(e) => setCadence(e.target.value)}>
                {PROGRAM_CADENCES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="ro-te-field">
              Description (optional)
              <textarea value={description} rows={2} disabled={createBusy} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button
              type="button"
              className="ro-te-btn ro-te-btn--primary"
              disabled={createBusy || name.trim().length < 3}
              onClick={() => {
                setCreateBusy(true);
                void onAction("save_program", {
                  name: name.trim(),
                  programType,
                  cadence,
                  description: description.trim() || undefined,
                  status: "active",
                  nominationsOpen: true
                })
                  .then(() => {
                    setName("");
                    setDescription("");
                    onRefresh?.();
                  })
                  .finally(() => setCreateBusy(false));
              }}
            >
              {createBusy ? "Saving…" : "Create program"}
            </button>
          </div>
        </EngagementPremiumSection>
      ) : null}
      <EngagementPremiumSection title="Recognition programs">
        <EngagementToolbar>
          <input
            className="ro-te-input"
            placeholder="Search programs…"
            value={progQuery}
            onChange={(event) => setProgQuery(event.target.value)}
            aria-label="Search programs"
          />
        </EngagementToolbar>
        <EngagementDataTable
          emptyTitle="No programs configured"
          emptyBody="Create a program above to open nominations for your team."
          columns={[
            { key: "name", label: "Program" },
            { key: "type", label: "Type" },
            { key: "status", label: "Status" },
            { key: "cadence", label: "Cadence" },
            { key: "actions", label: "" }
          ]}
          rows={filteredPrograms.map((row) => {
            const id = String(row.id);
            const editing = editId === id;
            return {
              id,
              cells: {
                name: editing ? (
                  <input className="ro-te-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  <div>
                    <strong>{String(row.name)}</strong>
                    {row.description ? <div className="ro-ai-answer" style={{ marginTop: 4 }}>{String(row.description)}</div> : null}
                  </div>
                ),
                type: String(row.typeLabel ?? PROGRAM_TYPE_LABELS[row.program_type as keyof typeof PROGRAM_TYPE_LABELS] ?? row.program_type),
                status: editing ? (
                  <select className="ro-te-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    {PROGRAM_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <EngagementStatusPill status={String(row.status ?? "active")} />
                ),
                cadence: String(row.cadence ?? "—"),
                actions:
                  onAction && editing ? (
                    <div className="ro-te-actions" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="ro-te-btn ro-te-btn--primary"
                        disabled={editBusy || editName.trim().length < 3}
                        onClick={() => {
                          setEditBusy(true);
                          void onAction("save_program", {
                            id,
                            name: editName.trim(),
                            programType: row.program_type,
                            cadence: row.cadence,
                            description: row.description,
                            status: editStatus,
                            nominationsOpen: row.nominations_open !== false
                          })
                            .then(() => {
                              setEditId(null);
                              onRefresh?.();
                            })
                            .finally(() => setEditBusy(false));
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="ro-te-btn ro-te-btn--ghost" disabled={editBusy} onClick={() => setEditId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : onAction ? (
                    <button
                      type="button"
                      className="ro-te-btn ro-te-btn--ghost"
                      onClick={() => {
                        setEditId(id);
                        setEditName(String(row.name));
                        setEditStatus(String(row.status ?? "active"));
                      }}
                    >
                      Edit
                    </button>
                  ) : (
                    "—"
                  )
              }
            };
          })}
        />
      </EngagementPremiumSection>
      <EngagementPremiumSection title="Nominations queue" description="Decisions are recorded for audit — include a note when selecting or declining.">
        <EngagementDataTable
          emptyTitle="No nominations in queue"
          emptyBody="When teammates nominate colleagues, pending items show here."
          columns={[
            { key: "nominee", label: "Nominee" },
            { key: "period", label: "Period" },
            { key: "status", label: "Status" },
            { key: "reason", label: "Reason" },
            { key: "actions", label: "" }
          ]}
          rows={openNominations.map((row) => {
            const id = String(row.id);
            const note = decisionNotes[id] ?? "";
            const canDecide = row.canDecide === true && onAction;
            return {
              id,
              cells: {
                nominee: String(row.nominee_name ?? row.nomineeName),
                period: String(row.period_label ?? row.periodLabel ?? "—"),
                status: <EngagementStatusPill status={String(row.status)} />,
                reason: <span style={{ whiteSpace: "pre-wrap" }}>{String(row.reason ?? row.nomination_reason ?? "—")}</span>,
                actions: canDecide ? (
                  <div className="ro-te-stack" style={{ gap: 6, minWidth: 220 }}>
                    <textarea
                      rows={2}
                      placeholder="Decision note (required for select/decline)"
                      value={note}
                      onChange={(event) => setDecisionNotes((prev) => ({ ...prev, [id]: event.target.value }))}
                    />
                    <div className="ro-te-actions" style={{ margin: 0 }}>
                      <button
                        type="button"
                        className="ro-te-btn ro-te-btn--primary"
                        disabled={nomBusy === id || note.trim().length < 10}
                        onClick={() => {
                          setNomBusy(id);
                          void onAction!("decide_nomination", { id, decision: "selected", note: note.trim() })
                            .then(onRefresh)
                            .finally(() => setNomBusy(null));
                        }}
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        className="ro-te-btn ro-te-btn--ghost"
                        disabled={nomBusy === id || note.trim().length < 10}
                        onClick={() => {
                          setNomBusy(id);
                          void onAction!("decide_nomination", { id, decision: "not_selected", note: note.trim() })
                            .then(onRefresh)
                            .finally(() => setNomBusy(null));
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="ro-te-muted" style={{ fontSize: 12 }}>
                    {row.canDecide === false ? "Awaiting another leader" : "—"}
                  </span>
                )
              }
            };
          })}
        />
      </EngagementPremiumSection>
    </div>
  );
}

export function DevelopmentAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<string>(DEVELOPMENT_STATUSES[1]);
  const [editDetails, setEditDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<Array<{ userId: string; name: string; departmentLabel?: string }>>([]);
  const [employeePick, setEmployeePick] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [newRecordType, setNewRecordType] = useState<string>(DEVELOPMENT_RECORD_TYPES[0]);
  const [newTitle, setNewTitle] = useState("");
  const [newDetails, setNewDetails] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    if (!onAction) return;
    void fetchAdminJson<{ items?: Array<Record<string, unknown>> }>("/api/admin/team-engagement?view=staff&status=active").then(
      ({ ok, body }) => {
        if (!ok || !Array.isArray(body.items)) return;
        setRoster(
          body.items.map((row) => ({
            userId: String(row.userId),
            name: String(row.name),
            departmentLabel: typeof row.departmentLabel === "string" ? row.departmentLabel : undefined
          }))
        );
      }
    );
  }, [onAction]);

  const rosterMatches = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return roster.slice(0, 80);
    return roster
      .filter((person) => {
        const hay = `${person.name} ${person.departmentLabel ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [employeeQuery, roster]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      const status = String(row.status ?? "in_progress");
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${row.employee_name ?? ""} ${row.title ?? ""} ${row.details ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, statusFilter]);

  return (
    <div className="ro-te-stack">
      {onAction ? (
        <EngagementPremiumSection
          title="Add development record"
          description="Choose a teammate in your scope. New records default to in progress and leadership-only visibility."
        >
          <EngagementToolbar>
            <input
              className="ro-te-input"
              placeholder="Filter teammates…"
              value={employeeQuery}
              onChange={(event) => setEmployeeQuery(event.target.value)}
              aria-label="Filter teammates"
            />
          </EngagementToolbar>
          <label className="ro-te-field">
            Teammate
            <select className="ro-te-select" value={employeePick} disabled={createBusy} onChange={(event) => setEmployeePick(event.target.value)}>
              <option value="">Select teammate…</option>
              {rosterMatches.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                  {person.departmentLabel ? ` · ${person.departmentLabel}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="ro-te-field">
            Record type
            <select className="ro-te-select" value={newRecordType} disabled={createBusy} onChange={(event) => setNewRecordType(event.target.value)}>
              {DEVELOPMENT_RECORD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DEVELOPMENT_RECORD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="ro-te-field">
            Title
            <input value={newTitle} disabled={createBusy} onChange={(event) => setNewTitle(event.target.value)} placeholder="Complete leash skills refresher" />
          </label>
          <label className="ro-te-field">
            Details (optional)
            <textarea rows={2} value={newDetails} disabled={createBusy} onChange={(event) => setNewDetails(event.target.value)} />
          </label>
          <button
            type="button"
            className="ro-te-btn ro-te-btn--primary"
            disabled={createBusy || !employeePick || newTitle.trim().length < 2}
            onClick={() => {
              setCreateBusy(true);
              void onAction("save_development_record", {
                employeeUserId: employeePick,
                recordType: newRecordType,
                status: "in_progress",
                title: newTitle.trim(),
                details: newDetails.trim() || undefined,
                visibility: "leadership"
              })
                .then(() => {
                  setEmployeePick("");
                  setNewTitle("");
                  setNewDetails("");
                  onRefresh?.();
                })
                .finally(() => setCreateBusy(false));
            }}
          >
            {createBusy ? "Saving…" : "Create record"}
          </button>
        </EngagementPremiumSection>
      ) : null}
      <EngagementPremiumSection title="Development records" description="Growth records sync to leadership views and employee development surfaces when shared.">
      <EngagementToolbar>
        <input
          className="ro-te-input"
          placeholder="Search teammate or title…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search development records"
        />
        <select className="ro-te-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {DEVELOPMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {DEVELOPMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </EngagementToolbar>
      <EngagementDataTable
        emptyTitle="No development records"
        emptyBody="Records you create for teammates in your scope appear here."
        columns={[
          { key: "employee", label: "Teammate" },
          { key: "type", label: "Type" },
          { key: "title", label: "Title" },
          { key: "status", label: "Status" },
          { key: "updated", label: "Updated" },
          { key: "actions", label: "" }
        ]}
        rows={filtered.map((row) => {
          const id = String(row.id);
          const editing = editId === id;
          const recordType = String(row.record_type ?? row.recordType ?? "growth_note");
          return {
            id,
            cells: {
              employee: String(row.employee_name ?? row.employeeName),
              type: DEVELOPMENT_RECORD_TYPE_LABELS[recordType as keyof typeof DEVELOPMENT_RECORD_TYPE_LABELS] ?? recordType,
              title: editing ? (
                <div className="ro-te-stack" style={{ gap: 6 }}>
                  <input className="ro-te-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <textarea rows={2} value={editDetails} placeholder="Details" onChange={(e) => setEditDetails(e.target.value)} />
                </div>
              ) : (
                <div>
                  <strong>{String(row.title)}</strong>
                  {row.details ? <div className="ro-ai-answer" style={{ marginTop: 4 }}>{String(row.details)}</div> : null}
                </div>
              ),
              status: editing ? (
                <select className="ro-te-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  {DEVELOPMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {DEVELOPMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              ) : (
                <EngagementStatusPill status={String(row.status)} />
              ),
              updated: formatPacificDateTime(row.updated_at ?? row.updatedAt),
              actions:
                onAction && editing ? (
                  <div className="ro-te-actions" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="ro-te-btn ro-te-btn--primary"
                      disabled={busy || editTitle.trim().length < 2}
                      onClick={() => {
                        setBusy(true);
                        void onAction("save_development_record", {
                          id,
                          recordType,
                          status: editStatus,
                          title: editTitle.trim(),
                          details: editDetails.trim() || undefined,
                          visibility: row.visibility ?? "leadership"
                        })
                          .then(() => {
                            setEditId(null);
                            onRefresh?.();
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Save
                    </button>
                    <button type="button" className="ro-te-btn ro-te-btn--ghost" disabled={busy} onClick={() => setEditId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : onAction ? (
                  <button
                    type="button"
                    className="ro-te-btn ro-te-btn--ghost"
                    onClick={() => {
                      setEditId(id);
                      setEditTitle(String(row.title ?? ""));
                      setEditStatus(String(row.status ?? "in_progress"));
                      setEditDetails(String(row.details ?? ""));
                    }}
                  >
                    Edit
                  </button>
                ) : (
                  "—"
                )
            }
          };
        })}
      />
      </EngagementPremiumSection>
    </div>
  );
}

export function WorkloadAdminBody({ data }: { data: Record<string, unknown> }) {
  if (data.available === false) {
    return (
      <EngagementPremiumSection title="Workload">
        <p className="ro-te-muted">{String(data.note ?? data.missing ?? "Workload data is not available right now.")}</p>
      </EngagementPremiumSection>
    );
  }
  const people = (data.people as Array<Record<string, unknown>>) ?? [];
  const summary = (data.summary as Array<Record<string, unknown>>) ?? [];
  return (
    <div className="ro-te-stack">
      <EngagementPremiumSection title="Workload snapshot" description={String(data.note ?? "Open assignments are a snapshot, not a performance score.")}>
      {summary.length ? (
        <div className="ro-te-stat-grid">
          {summary.map((row, index) => (
            <div key={index} className="ro-te-card ro-te-stat">
              <div className="ro-te-muted">{String(row.label ?? row.key)}</div>
              <div className="ro-te-stat__value">{String(row.open ?? row.count ?? "—")}</div>
            </div>
          ))}
        </div>
      ) : null}
      </EngagementPremiumSection>
      <ListSection title="By teammate" empty={people.length ? undefined : "No workload rows for this filter."}>
        <ul className="ro-te-list">
          {people.map((row, index) => (
            <li key={String(row.userId ?? index)} className="ro-te-list__item">
              <strong>{String(row.name)}</strong>
              <span className="ro-te-muted"> · open {String(row.open ?? 0)}</span>
            </li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function DepartmentsAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const canManage = data.canManage === true;
  const [editKey, setEditKey] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [recognitionEnabled, setRecognitionEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <EngagementPremiumSection
      title="Departments"
      description="Department profiles control recognition settings and descriptions shown in engagement tools."
    >
      <EngagementDataTable
        emptyTitle="No departments in scope"
        emptyBody="Your role limits which department profiles you can view."
        columns={[
          { key: "label", label: "Department" },
          { key: "headcount", label: "Team size" },
          { key: "profile", label: "Profile" },
          { key: "managers", label: "Managers" },
          { key: "actions", label: "" }
        ]}
        rows={items.map((row) => {
          const key = String(row.key);
          const editing = editKey === key;
          const managers = (row.managers as Array<{ name?: string }> | undefined) ?? [];
          return {
            id: key,
            cells: {
              label: (
                <div>
                  <strong>{String(row.label)}</strong>
                  {row.operational === false ? <span className="ro-te-muted"> · non-operational</span> : null}
                </div>
              ),
              headcount: String(row.headcount ?? "—"),
              profile: editing ? (
                <div className="ro-te-stack" style={{ gap: 6, minWidth: 220 }}>
                  <textarea
                    rows={2}
                    value={description}
                    placeholder="Department description for leaders…"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                  <label className="ro-te-check">
                    <input type="checkbox" checked={recognitionEnabled} onChange={(event) => setRecognitionEnabled(event.target.checked)} />
                    Recognition enabled
                  </label>
                </div>
              ) : (
                <div>
                  <EngagementStatusPill status={row.recognitionEnabled === false ? "paused" : "active"} />
                  {row.description ? <div className="ro-ai-answer" style={{ marginTop: 4 }}>{String(row.description)}</div> : <span className="ro-te-muted"> No description</span>}
                </div>
              ),
              managers:
                managers.length > 0
                  ? managers.map((manager) => manager.name ?? "Manager").join(", ")
                  : "—",
              actions:
                canManage && onAction && editing ? (
                  <div className="ro-te-actions" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="ro-te-btn ro-te-btn--primary"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void onAction("save_department", { key, description: description.trim() || undefined, recognitionEnabled })
                          .then(() => {
                            setEditKey(null);
                            onRefresh?.();
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Save
                    </button>
                    <button type="button" className="ro-te-btn ro-te-btn--ghost" disabled={busy} onClick={() => setEditKey(null)}>
                      Cancel
                    </button>
                  </div>
                ) : canManage && onAction ? (
                  <button
                    type="button"
                    className="ro-te-btn ro-te-btn--ghost"
                    onClick={() => {
                      setEditKey(key);
                      setDescription(String(row.description ?? ""));
                      setRecognitionEnabled(row.recognitionEnabled !== false);
                    }}
                  >
                    Edit profile
                  </button>
                ) : (
                  "—"
                )
            }
          };
        })}
      />
    </EngagementPremiumSection>
  );
}

export function SettingsAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const categories = (data.categories as Array<{ key: string; label: string; active: boolean }>) ?? [];
  const participation = (data.participation as Record<string, number> | undefined) ?? {
    dailyLimit: 5,
    perRecipientWeeklyLimit: 3,
    minMessageLength: 20
  };
  const revisions = (data.revisions as Record<string, number> | undefined) ?? {};
  const features = data.features as Record<string, boolean> | undefined;
  const [dailyLimit, setDailyLimit] = useState(String(participation.dailyLimit ?? 5));
  const [weeklyLimit, setWeeklyLimit] = useState(String(participation.perRecipientWeeklyLimit ?? 3));
  const [minLength, setMinLength] = useState(String(participation.minMessageLength ?? 20));
  const [busy, setBusy] = useState(false);
  return (
    <div className="ro-te-stack">
      <EngagementPremiumSection title="Bark Out categories">
        <ul className="ro-te-list">
          {categories.map((cat) => (
            <li key={cat.key}>
              {cat.label}
              {!cat.active ? <span className="ro-te-muted"> (inactive)</span> : null}
            </li>
          ))}
        </ul>
      </EngagementPremiumSection>
      <EngagementPremiumSection title="Participation limits">
        <label className="ro-te-field">
          Daily Bark Outs per teammate
          <input type="number" min={1} max={50} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
        </label>
        <label className="ro-te-field">
          Per-recipient weekly limit
          <input type="number" min={1} max={50} value={weeklyLimit} onChange={(e) => setWeeklyLimit(e.target.value)} />
        </label>
        <label className="ro-te-field">
          Minimum message length
          <input type="number" min={5} max={500} value={minLength} onChange={(e) => setMinLength(e.target.value)} />
        </label>
        {onAction ? (
          <button
            type="button"
            className="ro-te-btn ro-te-btn--primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onAction("save_participation", {
                value: {
                  dailyLimit: Number(dailyLimit),
                  perRecipientWeeklyLimit: Number(weeklyLimit),
                  minMessageLength: Number(minLength)
                },
                revision: revisions.participation ?? 0
              })
                .then(onRefresh)
                .finally(() => setBusy(false));
            }}
          >
            Save limits
          </button>
        ) : null}
      </EngagementPremiumSection>
      {features ? (
        <EngagementPremiumSection title="Feature toggles (read-only here)" description="Super Admins can change Pack feature controls under Security → Feature Controls.">
          <ul className="ro-te-list">
            {Object.entries(features).map(([key, enabled]) => (
              <li key={key}>
                {key.replace(/_/g, " ")}: {enabled ? "On" : "Off"}
              </li>
            ))}
          </ul>
        </EngagementPremiumSection>
      ) : null}
    </div>
  );
}

export function ReportsAdminBody({ data }: { data: Record<string, unknown> }) {
  const exports = (data.exports as Array<{ key: string; label: string; description: string; allowed: boolean }>) ?? [];
  return (
    <ListSection title="Exports" empty={exports.length ? undefined : "No exports available."}>
      <ul className="ro-te-list">
        {exports.map((row) => (
          <li key={row.key} className="ro-te-list__item">
            <strong>{row.label}</strong>
            <p className="ro-te-muted">{row.description}</p>
            {row.allowed ? (
              <a className="ro-te-btn ro-te-btn--ghost" href={`/api/admin/team-engagement/export?type=${encodeURIComponent(row.key)}`}>
                Download CSV
              </a>
            ) : (
              <span className="ro-te-muted">You do not have permission for this export.</span>
            )}
          </li>
        ))}
      </ul>
    </ListSection>
  );
}

export function SecurityAdminBody({ data }: { data: Record<string, unknown> }) {
  const engagementEvents = (data.engagementEvents as Array<Record<string, unknown>>) ?? [];
  const safeguards = (data.safeguards as string[]) ?? [];
  return (
    <div className="ro-te-stack">
      <ListSection title="Safeguards">
        <ul className="ro-te-list">
          {safeguards.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ListSection>
      <ListSection title="Recent security & access events" empty={engagementEvents.length ? undefined : "No recent events."}>
        <ul className="ro-te-list">
          {engagementEvents.map((row) => (
            <li key={String(row.id)} className="ro-te-list__item">
              <span className="ro-te-muted">{row.at ? new Date(String(row.at)).toLocaleString() : ""}</span>
              <strong> {String(row.action)}</strong> — {String(row.actorName)} → {String(row.targetLabel ?? "")}
            </li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function IntegrationsAdminBody({ data }: { data: Record<string, unknown> }) {
  const items = (data.items as Array<{ key: string; label: string; status: string; detail: string }>) ?? [];
  return (
    <ListSection title="Integrations">
      <ul className="ro-te-list">
        {items.map((row) => (
          <li key={row.key} className="ro-te-list__item">
            <strong>{row.label}</strong>
            <span className="ro-te-pill"> {row.status.replace(/_/g, " ")}</span>
            <p className="ro-te-muted">{row.detail}</p>
          </li>
        ))}
      </ul>
    </ListSection>
  );
}

export function SystemHealthAdminBody({ data }: { data: Record<string, unknown> }) {
  const tables = (data.tables as Array<{ table: string; ready: boolean }>) ?? [];
  const moderation = data.moderation as Record<string, number> | null;
  const readyCount = tables.filter((row) => row.ready).length;
  return (
    <div className="ro-te-stack">
      <p className="ro-te-muted">
        Checked {data.checkedAt ? new Date(String(data.checkedAt)).toLocaleString() : "recently"} · {readyCount}/{tables.length} tables responding
      </p>
      {moderation ? (
        <div className="ro-te-stat-grid">
          <div className="ro-te-card ro-te-stat">
            <div className="ro-te-muted">Pending moderation</div>
            <div className="ro-te-stat__value">{moderation.pending ?? 0}</div>
          </div>
          <div className="ro-te-card ro-te-stat">
            <div className="ro-te-muted">Open reports</div>
            <div className="ro-te-stat__value">{moderation.openReports ?? 0}</div>
          </div>
        </div>
      ) : null}
      <details>
        <summary className="ro-te-muted">Table readiness</summary>
        <ul className="ro-te-list" style={{ fontSize: 13 }}>
          {tables.map((row) => (
            <li key={row.table}>
              {row.ready ? "✓" : "○"} {row.table}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function AccessAdminBody({ data }: { data: Record<string, unknown> }) {
  const rules = (data.rules as string[]) ?? [];
  const groups = ["superAdmins", "admins", "management"] as const;
  return (
    <div className="ro-te-stack">
      {groups.map((key) => {
        const people = (data[key] as Array<{ name: string; roleLabel: string }>) ?? [];
        return (
          <ListSection key={key} title={key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} empty={people.length ? undefined : "None"}>
            <ul className="ro-te-list">
              {people.map((person) => (
                <li key={person.name}>
                  {person.name} <span className="ro-te-muted">· {person.roleLabel}</span>
                </li>
              ))}
            </ul>
          </ListSection>
        );
      })}
      <ListSection title="Rules">
        <ul className="ro-te-list">
          {rules.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ListSection>
    </div>
  );
}

export function PermissionsAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const notes = (data.notes as string[]) ?? [];
  const permissions = (data.permissions as Array<{ permission: string; cells: Array<{ role: string; enabled: boolean; locked: boolean }> }>) ?? [];
  const roleLabels = Object.fromEntries(
    ((data.roles as Array<{ role: string; label: string }>) ?? []).map((row) => [row.role, row.label])
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingEnabled, setPendingEnabled] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="ro-te-stack">
      <EngagementPremiumSection title="Role permissions" description="Toggle Team Engagement permissions by role. Locked cells cannot be changed here.">
        {pendingKey ? (
          <div className="ro-te-banner ro-te-banner--warn" style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px" }}>
              Confirm permission change for <strong>{pendingKey.split(":")[1]}</strong> — {pendingEnabled ? "enable" : "disable"}{" "}
              <strong>{pendingKey.split(":")[0].replace(/\./g, " · ")}</strong>
            </p>
            <label className="ro-te-field">
              Reason (required)
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Quarterly access review" />
            </label>
            <div className="ro-te-actions">
              <button
                type="button"
                className="ro-te-btn ro-te-btn--primary"
                disabled={!onAction || busyKey === pendingKey || reason.trim().length < 3}
                onClick={() => {
                  if (!onAction || !pendingKey) return;
                  const [permission, role] = pendingKey.split(":");
                  setBusyKey(pendingKey);
                  void onAction("set_role_permission", {
                    role,
                    permission,
                    enabled: pendingEnabled,
                    reason: reason.trim()
                  })
                    .then(() => {
                      setPendingKey(null);
                      setReason("");
                      onRefresh?.();
                    })
                    .finally(() => setBusyKey(null));
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="ro-te-btn ro-te-btn--ghost"
                disabled={busyKey === pendingKey}
                onClick={() => {
                  setPendingKey(null);
                  setReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {permissions.map((row) => (
          <details key={row.permission} style={{ marginBottom: 12 }}>
            <summary>
              <strong>{row.permission.replace(/\./g, " · ")}</strong>
            </summary>
            <ul className="ro-te-list">
              {row.cells.map((cell) => {
                const key = `${row.permission}:${cell.role}`;
                return (
                  <li key={key}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={cell.enabled}
                        disabled={!onAction || cell.locked || busyKey === key || Boolean(pendingKey)}
                        onChange={(event) => {
                          if (!onAction) return;
                          setPendingKey(key);
                          setPendingEnabled(event.target.checked);
                          setReason("");
                        }}
                      />
                      {roleLabels[cell.role] ?? cell.role}
                      {cell.locked ? <span className="ro-te-muted"> (locked)</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
        <ul className="ro-te-list">
          {notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </EngagementPremiumSection>
    </div>
  );
}

export function AiPolicyAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const lastTest = data.lastTest as { at?: string; result?: string } | null | undefined;
  const statement = String(data.statement ?? "");
  return (
    <EngagementPremiumSection title="AI moderation policy">
      <p className="ro-te-muted">{statement || "Bark Outs that automated rules cannot clear still route to human moderators."}</p>
      <p className="ro-te-muted">Status: {String(data.status ?? (data.configured ? "configured" : "not_configured"))}</p>
      {lastTest?.at ? (
        <p className="ro-te-muted">
          Last test: {new Date(lastTest.at).toLocaleString()} · {lastTest.result ?? "unknown"}
        </p>
      ) : null}
      {onAction ? (
        <button
          type="button"
          className="ro-te-btn ro-te-btn--primary"
          disabled={busy || !data.configured}
          style={{ marginTop: 8 }}
          onClick={() => {
            setBusy(true);
            void onAction("test_ai_connection", {}).then(onRefresh).finally(() => setBusy(false));
          }}
        >
          Test Gemini connection
        </button>
      ) : null}
    </EngagementPremiumSection>
  );
}

export function RetentionAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const preview = data.preview as Record<string, number> | undefined;
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="ro-te-stack">
      <p className="ro-te-callout">{String(data.schedule ?? "")}</p>
      {preview ? (
        <div className="ro-te-stat-grid">
          {Object.entries(preview).map(([key, value]) => (
            <div key={key} className="ro-te-card ro-te-stat">
              <div className="ro-te-muted">{key.replace(/([A-Z])/g, " $1")}</div>
              <div className="ro-te-stat__value">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {onAction ? (
        <EngagementPremiumSection
          title="Run retention purge"
          description="Super Admins only. Deletes aged rejected, withdrawn, removed Bark Outs, closed feedback, and old audit entries per policy."
        >
          <label className="ro-te-field">
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Annual cleanup" />
          </label>
          <label className="ro-te-field">
            Type PURGE to confirm
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <button
            type="button"
            className="ro-te-btn ro-te-btn--primary"
            disabled={busy || confirm !== "PURGE" || reason.trim().length < 3}
            onClick={() => {
              setBusy(true);
              void onAction("run_retention_purge", { confirmation: "PURGE", reason })
                .then(onRefresh)
                .finally(() => setBusy(false));
            }}
          >
            Run purge now
          </button>
        </EngagementPremiumSection>
      ) : null}
    </div>
  );
}

export function FeatureControlsAdminBody({
  data,
  onAction,
  onRefresh
}: {
  data: Record<string, unknown>;
  onAction?: ActionHandler;
  onRefresh?: () => void;
}) {
  const features = (data.features as Array<{ key: string; label: string; enabled: boolean }>) ?? [];
  const revision = Number(data.revision ?? 0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  return (
    <ListSection title="Pack feature controls">
      <ul className="ro-te-list">
        {features.map((row) => (
          <li key={row.key}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={row.enabled}
                disabled={!onAction || busyKey === row.key}
                onChange={(event) => {
                  if (!onAction) return;
                  const next = Object.fromEntries(features.map((feature) => [feature.key, feature.key === row.key ? event.target.checked : feature.enabled]));
                  setBusyKey(row.key);
                  void onAction("save_features", {
                    value: next,
                    revision,
                    reason: `Toggle ${row.label}`
                  })
                    .then(onRefresh)
                    .finally(() => setBusyKey(null));
                }}
              />
              <strong>{row.label}</strong>
            </label>
          </li>
        ))}
      </ul>
    </ListSection>
  );
}