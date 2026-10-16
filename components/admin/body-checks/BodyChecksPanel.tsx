"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tlDogPhotoCandidates } from "@/lib/tl-digi-board/animal-photos";
import {
  BODY_GROOMING_FINDINGS,
  BODY_PHYSICAL_FINDINGS,
  EAR_FINDINGS,
  NAIL_FINDINGS,
  reconcileBody,
  toggleFinding,
  type FindingDef
} from "@/lib/body-checks/findings";
import type {
  BodyCheckReport,
  BodyCheckRosterRow,
  BodyCheckSeverity,
  FollowUpEvent,
  FollowUpKind,
  FollowUpStatus,
  RosterCounts,
  RosterFilter
} from "@/lib/body-checks/types";
import { FOLLOW_UP_KINDS, FOLLOW_UP_STATUSES, NOTES_MAX } from "@/lib/body-checks/types";
import "./body-checks.css";

type RosterApiRow = BodyCheckRosterRow & { checkedToday: boolean; hasFollowUp: boolean };

type RosterPayload = {
  businessDate: string;
  rows: RosterApiRow[];
  counts: RosterCounts | null;
  syncedAt: string | null;
  stale: boolean;
  incomplete: boolean;
  warning: string | null;
  statsError: string | null;
  coverageNote: string;
  error?: string;
};

type Wizard = {
  dog: RosterApiRow;
  step: number;
  ears: string[];
  nails: string[];
  bodyGrooming: string[];
  bodyPhysical: string[];
  earOther: string;
  nailOther: string;
  bodyOther: string;
  notes: string;
  severity: BodyCheckSeverity | "";
  followUpKinds: FollowUpKind[];
  idempotencyKey: string;
};

const FILTERS: { id: RosterFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "checked_in", label: "Checked in" },
  { id: "arriving", label: "Coming today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "appointments", label: "Appointments" },
  { id: "follow_up", label: "Follow-ups" }
];

const STEPS = ["Ears", "Nails", "Body", "Review"];

const SEVERITY_OPTIONS: { id: BodyCheckSeverity; label: string }[] = [
  { id: "routine", label: "Routine" },
  { id: "needs_follow_up", label: "Needs Follow-Up" },
  { id: "urgent", label: "Urgent Attention" }
];

const KIND_LABELS: Record<FollowUpKind, string> = {
  bath: "Bath",
  nail_trim: "Nail trim",
  grooming: "Grooming",
  supervisor_review: "Supervisor review",
  owner_communication: "Owner communication",
  other: "Other"
};

const STATUS_LABELS: Record<FollowUpStatus, string> = {
  none: "Recorded",
  required: "Follow-up required",
  scheduled: "Service scheduled",
  completed: "Service completed",
  owner_contacted: "Owner communication sent"
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "Not synced yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not synced yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

function labelsFor(catalog: FindingDef[], ids: string[], other: string) {
  return ids
    .map((id) => catalog.find((item) => item.id === id))
    .filter((item): item is FindingDef => Boolean(item))
    .map((item) => (item.requiresDetail && other.trim() ? `${item.label}: ${other.trim()}` : item.label));
}

function DogPhoto({ name, animalId, url }: { name: string; animalId: string; url: string | null }) {
  const candidates = tlDogPhotoCandidates(animalId, url);
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  if (!src || index >= candidates.length) {
    return (
      <span className="body-checks__photo-fallback" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // Profile photos are loaded through the existing Gingr animal-photo proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="body-checks__photo"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

function stepError(wizard: Wizard): string | null {
  if (wizard.step === 0) {
    if (!wizard.ears.length) return "Select an ear finding to continue.";
    if (wizard.ears.includes("other") && !wizard.earOther.trim()) return "Describe the other ear finding.";
  }
  if (wizard.step === 1) {
    if (!wizard.nails.length) return "Select a nail finding to continue.";
    if (wizard.nails.includes("other") && !wizard.nailOther.trim()) return "Describe the other nail finding.";
  }
  if (wizard.step === 2) {
    const body = reconcileBody(wizard.bodyGrooming, wizard.bodyPhysical);
    if (!body.grooming.length && !body.physical.length) return "Select a coat or body finding to continue.";
    if (body.physical.includes("other") && !wizard.bodyOther.trim()) return "Describe the other body finding.";
  }
  if (wizard.step === 3) {
    if (!wizard.severity) return "Choose a severity before submitting.";
    if ((wizard.severity === "needs_follow_up" || wizard.severity === "urgent") && !wizard.followUpKinds.length) {
      return "Choose at least one follow-up for this severity.";
    }
  }
  return null;
}

function reportBlocker(wizard: Wizard): string | null {
  for (let step = 0; step <= 3; step += 1) {
    const error = stepError({ ...wizard, step });
    if (error) return error;
  }
  return null;
}

function emptyWizard(dog: RosterApiRow): Wizard {
  return {
    dog,
    step: 0,
    ears: [],
    nails: [],
    bodyGrooming: [],
    bodyPhysical: [],
    earOther: "",
    nailOther: "",
    bodyOther: "",
    notes: "",
    severity: "",
    followUpKinds: [],
    idempotencyKey: crypto.randomUUID()
  };
}

export function BodyChecksPanel() {
  const [view, setView] = useState<"active" | "saved">("active");
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date())
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [roster, setRoster] = useState<RosterPayload | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ reports: BodyCheckReport[]; total: number; error: string | null; loading: boolean }>({
    reports: [],
    total: 0,
    error: null,
    loading: false
  });
  const [savedFrom, setSavedFrom] = useState("");
  const [savedTo, setSavedTo] = useState("");
  const [savedQuery, setSavedQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [followFilter, setFollowFilter] = useState("");
  const [findingFilter, setFindingFilter] = useState("");
  const [savedSort, setSavedSort] = useState<"newest" | "oldest">("newest");
  const [savedPage, setSavedPage] = useState(0);
  const [openReport, setOpenReport] = useState<{ report: BodyCheckReport; events: FollowUpEvent[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const rosterRequest = useRef(0);

  const loadRoster = useCallback(
    async (refresh = false) => {
      const requestId = rosterRequest.current + 1;
      rosterRequest.current = requestId;
      setLoading(true);
      if (refresh) setSyncing(true);
      setRosterError(null);
      const params = new URLSearchParams({ filter, q: query });
      if (date) params.set("date", date);
      if (refresh) params.set("refresh", "1");
      try {
        const response = await fetch(`/api/admin/body-checks/roster?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as RosterPayload;
        if (requestId !== rosterRequest.current) return;
        if (!response.ok) {
          setRoster(payload.rows?.length ? payload : null);
          setRosterError(payload.error || "Gingr roster is unavailable.");
          return;
        }
        setRoster(payload);
        setRosterError(null);
      } catch {
        if (requestId !== rosterRequest.current) return;
        setRosterError("Gingr roster is unavailable.");
      } finally {
        if (requestId === rosterRequest.current) {
          setLoading(false);
          setSyncing(false);
        }
      }
    },
    [date, filter, query]
  );

  const loadSaved = useCallback(async () => {
    setSaved((current) => ({ ...current, loading: true, error: null }));
    const params = new URLSearchParams();
    if (savedQuery.trim()) params.set("q", savedQuery.trim());
    if (severityFilter) params.set("severity", severityFilter);
    if (followFilter) params.set("followUp", followFilter);
    if (findingFilter.trim()) params.set("finding", findingFilter.trim());
    params.set("sort", savedSort);
    params.set("limit", "25");
    params.set("offset", String(savedPage * 25));
    if (savedFrom) params.set("from", savedFrom);
    if (savedTo) params.set("to", savedTo);
    try {
      const response = await fetch(`/api/admin/body-checks/reports?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { reports?: BodyCheckReport[]; total?: number; error?: string };
      if (!response.ok) {
        setSaved({ reports: [], total: 0, error: payload.error || "Saved reports are unavailable.", loading: false });
        return;
      }
      setSaved({ reports: payload.reports ?? [], total: payload.total ?? 0, error: null, loading: false });
    } catch {
      setSaved({ reports: [], total: 0, error: "Saved reports are unavailable.", loading: false });
    }
  }, [findingFilter, followFilter, savedFrom, savedPage, savedQuery, savedSort, savedTo, severityFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRoster(false), 250);
    return () => window.clearTimeout(timer);
  }, [loadRoster]);

  useEffect(() => {
    if (view !== "saved") return;
    const timer = window.setTimeout(() => void loadSaved(), 250);
    return () => window.clearTimeout(timer);
  }, [loadSaved, view]);

  useEffect(() => {
    if (!wizard) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [wizard]);

  const counts = roster?.counts;

  const reviewLines = useMemo(() => {
    if (!wizard) return [];
    const body = reconcileBody(wizard.bodyGrooming, wizard.bodyPhysical);
    return [
      ...labelsFor(EAR_FINDINGS, wizard.ears, wizard.earOther),
      ...labelsFor(NAIL_FINDINGS, wizard.nails, wizard.nailOther),
      ...labelsFor(BODY_GROOMING_FINDINGS, body.grooming, ""),
      ...labelsFor(BODY_PHYSICAL_FINDINGS, body.physical, wizard.bodyOther)
    ];
  }, [wizard]);

  async function submitReport() {
    if (!wizard || submitting) return;
    const blocker = reportBlocker(wizard);
    if (blocker) {
      setSubmitError(blocker);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const body = reconcileBody(wizard.bodyGrooming, wizard.bodyPhysical);
    try {
      const response = await fetch("/api/admin/body-checks/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gingrAnimalId: wizard.dog.gingrAnimalId,
          dogName: wizard.dog.dogName,
          photoUrl: wizard.dog.photoUrl,
          ownerId: wizard.dog.ownerId,
          ownerName: wizard.dog.ownerName,
          reservationId: wizard.dog.reservationId,
          serviceType: wizard.dog.serviceType,
          serviceCategory: wizard.dog.serviceCategory,
          ears: wizard.ears,
          nails: wizard.nails,
          bodyGrooming: body.grooming,
          bodyPhysical: body.physical,
          earOther: wizard.earOther,
          nailOther: wizard.nailOther,
          bodyOther: wizard.bodyOther,
          notes: wizard.notes,
          severity: wizard.severity,
          followUpKinds: wizard.followUpKinds,
          idempotencyKey: wizard.idempotencyKey
        })
      });
      const payload = (await response.json()) as { error?: string; report?: BodyCheckReport };
      if (!response.ok || !payload.report) {
        setSubmitError(payload.error || "The report was not saved. Your selections are still here.");
        return;
      }
      setWizard(null);
      setView("saved");
      await loadRoster(true);
      await loadSaved();
    } catch {
      setSubmitError("The report was not saved. Your selections are still here.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openSaved(id: string) {
    const response = await fetch(`/api/admin/body-checks/reports/${id}`, { cache: "no-store" });
    const payload = (await response.json()) as { report?: BodyCheckReport; events?: FollowUpEvent[]; error?: string };
    if (!response.ok || !payload.report) {
      setSaved((current) => ({ ...current, error: payload.error || "Unable to open that report." }));
      return;
    }
    setOpenReport({ report: payload.report, events: payload.events ?? [] });
  }

  async function changeFollowUp(status: FollowUpStatus) {
    if (!openReport) return;
    const response = await fetch(`/api/admin/body-checks/reports/${openReport.report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpStatus: status })
    });
    const payload = (await response.json()) as { report?: BodyCheckReport; error?: string };
    if (!response.ok || !payload.report) {
      setSaved((current) => ({ ...current, error: payload.error || "Follow-up was not updated." }));
      return;
    }
    setOpenReport({ ...openReport, report: payload.report });
    await loadSaved();
  }

  return (
    <section className="body-checks" aria-label="Body Checks">
      <header className="body-checks__header">
        <div>
          <p className="body-checks__meta">Floor Ops</p>
          <h2 className="body-checks__title">Body Checks</h2>
        </div>
        <div className="body-checks__tabs" role="tablist">
          <button className="body-checks__tab" role="tab" aria-selected={view === "active"} onClick={() => { if (wizard) { setSubmitError("Use Back to roster before leaving this body check."); return; } setView("active"); }}>
            Active Checks
          </button>
          <button className="body-checks__tab" role="tab" aria-selected={view === "saved"} onClick={() => { if (wizard) { setSubmitError("Use Back to roster before leaving this body check."); return; } setOpenReport(null); setView("saved"); }}>
            Saved Reports
          </button>
        </div>
      </header>

      {view === "active" && !wizard ? (
        <>
          <div className="body-checks__counts">
            <Count label="Checked in" value={counts?.checkedIn} />
            <Count label="Coming today" value={counts?.arrivals} />
            <Count label="Appointments" value={counts?.appointments} />
            <Count label="Submitted" value={counts?.submittedToday} />
            <Count label="Follow-ups" value={counts?.unresolvedFollowUps} />
          </div>
          <div className="body-checks__toolbar">
            <input
              className="admin-input body-checks__search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dog, owner, or ID"
              aria-label="Search dogs"
            />
            <input className="admin-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Roster date" />
            <button className="admin-btn-secondary" type="button" disabled={syncing} onClick={() => void loadRoster(true)}>
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          </div>
          <div className="body-checks__filters">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className="body-checks__chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="body-checks__meta">
            Last successful Gingr sync: {formatWhen(roster?.syncedAt)}
            {roster?.stale ? " · showing the last valid roster" : ""}
            {roster?.incomplete ? " · sync may be incomplete" : ""}
          </p>
          {roster?.warning ? <div className="body-checks__banner">{roster.warning}</div> : null}
          {roster?.statsError ? <div className="body-checks__banner">{roster.statsError} Saved reports stay available from the other tab.</div> : null}
          {rosterError ? <div className="body-checks__banner body-checks__banner--error">{rosterError}</div> : null}
          {loading && !roster ? <p>Loading today’s roster…</p> : null}
          {!loading && roster && (roster.rows?.length ?? 0) === 0 && !rosterError ? (
            <div className="body-checks__card">No dogs match this date and filter. An empty list here means Gingr returned no matching reservations.</div>
          ) : null}
          <div className="body-checks__list">
            {(roster?.rows ?? []).map((row) => (
              <article key={row.key} className="body-checks__row">
                <DogPhoto name={row.dogName} animalId={row.gingrAnimalId} url={row.photoUrl} />
                <div>
                  <strong>{row.dogName}</strong>
                  <div className="body-checks__meta">
                    {row.ownerName || "Owner unavailable"} · {row.serviceType || row.serviceCategory}
                    {row.startsAt ? ` · ${formatWhen(row.startsAt)}` : ""}
                  </div>
                  <div className="body-checks__badges">
                    <span className={`admin-badge ${row.checkedIn ? "admin-badge--green" : "admin-badge--info"}`}>
                      {row.checkedIn ? "Checked in" : row.isArrivalToday ? "Coming today" : row.isUpcoming ? "Upcoming" : "Reservation"}
                    </span>
                    {row.checkedToday ? <span className="admin-badge admin-badge--info">Body check saved</span> : null}
                    {row.hasFollowUp ? <span className="admin-badge admin-badge--amber">Follow-up open</span> : null}
                  </div>
                </div>
                <button className="admin-btn-primary body-checks__row-button" type="button" onClick={() => { setSubmitError(null); setView("active"); setWizard(emptyWizard(row)); }}>
                  Start Body Check
                </button>
              </article>
            ))}
          </div>
          <p className="body-checks__meta">Checked-in dogs and reservations for the next 7 days, one row per dog.</p>
        </>
      ) : view === "saved" && !wizard && !openReport ? (
        <>
          <div className="body-checks__toolbar">
            <input className="admin-input body-checks__search" value={savedQuery} onChange={(event) => { setSavedPage(0); setSavedQuery(event.target.value); }} placeholder="Search dog, owner, or staff" aria-label="Search saved reports" />
            <select className="admin-input" value={severityFilter} onChange={(event) => { setSavedPage(0); setSeverityFilter(event.target.value); }} aria-label="Severity">
              <option value="">All severities</option>
              {SEVERITY_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <select className="admin-input" value={followFilter} onChange={(event) => { setSavedPage(0); setFollowFilter(event.target.value); }} aria-label="Follow-up status">
              <option value="">All follow-ups</option>
              {FOLLOW_UP_STATUSES.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
            <input className="admin-input" type="date" value={savedFrom} onChange={(event) => { setSavedPage(0); setSavedFrom(event.target.value); }} aria-label="Reports from" />
            <input className="admin-input" type="date" value={savedTo} onChange={(event) => { setSavedPage(0); setSavedTo(event.target.value); }} aria-label="Reports to" />
            <input className="admin-input" value={findingFilter} onChange={(event) => { setSavedPage(0); setFindingFilter(event.target.value); }} placeholder="Finding" aria-label="Finding" />
            <select className="admin-input" value={savedSort} aria-label="Sort reports" onChange={(event) => { setSavedPage(0); setSavedSort(event.target.value === "oldest" ? "oldest" : "newest"); }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          {saved.loading ? <p>Loading saved reports…</p> : null}
          {saved.error ? <div className="body-checks__banner body-checks__banner--error">{saved.error}</div> : null}
          {!saved.loading && !saved.error && saved.reports.length === 0 ? <div className="body-checks__card">No saved reports match these filters.</div> : null}
          <div className="body-checks__table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>Dog</th>
                  <th>Owner</th>
                  <th>Findings</th>
                  <th>Staff</th>
                  <th>Severity</th>
                  <th>Follow-up</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {saved.reports.map((report) => (
                  <tr key={report.id}>
                    <td>{formatWhen(report.inspectedAt)}</td>
                    <td>{report.dogName}</td>
                    <td>{report.ownerName || "—"}</td>
                    <td>{keyFindings(report)}</td>
                    <td>{report.staffName}</td>
                    <td>{SEVERITY_OPTIONS.find((item) => item.id === report.severity)?.label}</td>
                    <td>{STATUS_LABELS[report.followUpStatus]}</td>
                    <td>
                      <button className="admin-btn-secondary" type="button" onClick={() => void openSaved(report.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="body-checks__cards">
            {saved.reports.map((report) => (
              <article key={report.id} className="body-checks__card">
                <strong>{report.dogName}</strong>
                <p className="body-checks__meta">{formatWhen(report.inspectedAt)} · {report.ownerName || "Owner unavailable"}</p>
                <p>{keyFindings(report)}</p>
                <p className="body-checks__meta">{report.staffName} · {STATUS_LABELS[report.followUpStatus]}</p>
                <button className="admin-btn-secondary" type="button" onClick={() => void openSaved(report.id)}>Open report</button>
              </article>
            ))}
          </div>
          <div className="body-checks__actions">
            <button className="admin-btn-secondary" type="button" disabled={savedPage === 0} onClick={() => setSavedPage((page) => Math.max(0, page - 1))}>
              Previous
            </button>
            <span className="body-checks__meta">
              Page {savedPage + 1}
              {saved.total ? ` of ${Math.max(1, Math.ceil(saved.total / 25))}` : ""}
            </span>
            <button className="admin-btn-secondary" type="button" disabled={(savedPage + 1) * 25 >= saved.total} onClick={() => setSavedPage((page) => page + 1)}>
              Next
            </button>
          </div>
        </>
      ) : null}

      {wizard ? (
        <div className="body-checks__wizard" role="dialog" aria-label={`Body check for ${wizard.dog.dogName}`}>
          <div className="body-checks__dog">
            <DogPhoto name={wizard.dog.dogName} animalId={wizard.dog.gingrAnimalId} url={wizard.dog.photoUrl} />
            <div>
              <strong>{wizard.dog.dogName}</strong>
              <div className="body-checks__meta">
                {wizard.dog.ownerName || "Owner unavailable"} · {wizard.dog.serviceType || wizard.dog.serviceCategory}
                {wizard.dog.checkedIn ? " · Checked in" : ""}
                {wizard.dog.hasFollowUp ? " · Follow-up open" : ""}
              </div>
            </div>
            <button className="admin-btn-secondary" type="button" onClick={() => setWizard(null)}>
              Back to roster
            </button>
          </div>
          <div className="body-checks__steps">
            {STEPS.map((label, index) => (
              <button key={label} type="button" className="body-checks__step" aria-current={wizard.step === index ? "step" : undefined} onClick={() => {
                if (index > wizard.step) {
                  for (let step = wizard.step; step < index; step += 1) {
                    const error = stepError({ ...wizard, step });
                    if (error) {
                      setSubmitError(error);
                      return;
                    }
                  }
                }
                setSubmitError(null);
                setWizard({ ...wizard, step: index });
              }}>
                {index + 1}. {label}
              </button>
            ))}
          </div>
          {wizard.step === 0 ? (
            <FindingStep title="Ears" hint="Check for redness, odor, discharge, ticks, or irritation." catalog={EAR_FINDINGS} selected={wizard.ears} other={wizard.earOther} onToggle={(id) => setWizard({ ...wizard, ears: toggleFinding(EAR_FINDINGS, wizard.ears, id) })} onOther={(value) => setWizard({ ...wizard, earOther: value })} />
          ) : null}
          {wizard.step === 1 ? (
            <FindingStep title="Nails" hint="Check nail length and condition." catalog={NAIL_FINDINGS} selected={wizard.nails} other={wizard.nailOther} onToggle={(id) => setWizard({ ...wizard, nails: toggleFinding(NAIL_FINDINGS, wizard.nails, id) })} onOther={(value) => setWizard({ ...wizard, nailOther: value })} />
          ) : null}
          {wizard.step === 2 ? (
            <div className="body-checks__list">
              <FindingStep title="Coat and grooming" hint="Needs Bath and Matted Hair can both be selected." catalog={BODY_GROOMING_FINDINGS} selected={wizard.bodyGrooming} other="" onToggle={(id) => {
                const next = toggleFinding(BODY_GROOMING_FINDINGS, wizard.bodyGrooming, id);
                const reconciled = reconcileBody(next, id === "no_issues" ? [] : wizard.bodyPhysical);
                setWizard({ ...wizard, bodyGrooming: reconciled.grooming, bodyPhysical: reconciled.physical });
              }} onOther={() => undefined} />
              <FindingStep title="Body" hint="These are observations, not diagnoses." catalog={BODY_PHYSICAL_FINDINGS} selected={wizard.bodyPhysical} other={wizard.bodyOther} onToggle={(id) => {
                const next = toggleFinding(BODY_PHYSICAL_FINDINGS, wizard.bodyPhysical, id);
                const reconciled = reconcileBody(wizard.bodyGrooming, next);
                setWizard({ ...wizard, bodyGrooming: reconciled.grooming, bodyPhysical: reconciled.physical });
              }} onOther={(value) => setWizard({ ...wizard, bodyOther: value })} />
            </div>
          ) : null}
          {wizard.step === 3 ? (
            <div className="body-checks__list">
              <div className="body-checks__card">
                <strong>Findings</strong>
                <ul>{reviewLines.map((line) => <li key={line}>{line}</li>)}</ul>
                <p className="body-checks__meta">Observations only. This does not book a service, charge an owner, or send a message.</p>
              </div>
              <div className="body-checks__tiles">
                {SEVERITY_OPTIONS.map((item) => (
                  <button key={item.id} type="button" className="body-checks__tile" aria-pressed={wizard.severity === item.id} onClick={() => setWizard({ ...wizard, severity: item.id })}>
                    {item.label}
                  </button>
                ))}
              </div>
              {wizard.severity === "urgent" ? (
                <div className="body-checks__banner">Tell a supervisor in person or record it in Team Log. Saving this report does not send an alert.</div>
              ) : null}
              {wizard.severity === "needs_follow_up" || wizard.severity === "urgent" ? (
                <div className="body-checks__tiles">
                  {FOLLOW_UP_KINDS.map((kind) => (
                    <button key={kind} type="button" className="body-checks__tile" aria-pressed={wizard.followUpKinds.includes(kind)} onClick={() => setWizard({
                      ...wizard,
                      followUpKinds: wizard.followUpKinds.includes(kind)
                        ? wizard.followUpKinds.filter((item) => item !== kind)
                        : [...wizard.followUpKinds, kind]
                    })}>
                      {KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>
              ) : null}
              <label>
                Notes (optional)
                <textarea className="admin-input" maxLength={NOTES_MAX} value={wizard.notes} onChange={(event) => setWizard({ ...wizard, notes: event.target.value })} />
              </label>
            </div>
          ) : null}
          {submitError ? <div className="body-checks__banner body-checks__banner--error">{submitError}</div> : null}
          <div className="body-checks__actions">
            <button className="admin-btn-secondary" type="button" disabled={wizard.step === 0 || submitting} onClick={() => setWizard({ ...wizard, step: Math.max(0, wizard.step - 1) })}>
              Back
            </button>
            {wizard.step < 3 ? (
              <button className="admin-btn-primary" type="button" onClick={() => {
                const error = stepError(wizard);
                if (error) {
                  setSubmitError(error);
                  return;
                }
                setSubmitError(null);
                setWizard({ ...wizard, step: wizard.step + 1 });
              }}>
                Next: {STEPS[wizard.step + 1]}
              </button>
            ) : (
              <button className="admin-btn-primary" type="button" disabled={submitting} onClick={() => void submitReport()}>
                {submitting ? "Saving…" : "Submit Body Check Report"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {openReport ? (
        <div className="body-checks__detail" role="dialog" aria-label={`Report for ${openReport.report.dogName}`}>
          <div className="body-checks__dog">
            <DogPhoto name={openReport.report.dogName} animalId={openReport.report.gingrAnimalId} url={openReport.report.photoUrl} />
            <div>
              <strong>{openReport.report.dogName}</strong>
              <div className="body-checks__meta">
                {openReport.report.ownerName || "Owner unavailable"} · {formatWhen(openReport.report.inspectedAt)} · {openReport.report.staffName}
              </div>
            </div>
            <button className="admin-btn-secondary" type="button" onClick={() => setOpenReport(null)}>Close</button>
          </div>
          <p>{[...openReport.report.ears, ...openReport.report.nails, ...openReport.report.bodyGrooming, ...openReport.report.bodyPhysical].map((item) => item.detail ? `${item.label}: ${item.detail}` : item.label).join(" · ") || "No findings stored."}</p>
          {openReport.report.notes ? <p>{openReport.report.notes}</p> : null}
          <label>
            Follow-up status
            <select className="admin-input" value={openReport.report.followUpStatus} onChange={(event) => void changeFollowUp(event.target.value as FollowUpStatus)}>
              {FOLLOW_UP_STATUSES.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </label>
          <p className="body-checks__meta">Submitted findings stay as recorded. Status changes are saved with your name.</p>
          {openReport.events.length ? (
            <ul>
              {openReport.events.map((event) => (
                <li key={event.id}>{formatWhen(event.createdAt)} · {event.changedByName} · {event.toStatus}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Count({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="body-checks__count">
      <span className="body-checks__meta">{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function FindingStep({
  title,
  hint,
  catalog,
  selected,
  other,
  onToggle,
  onOther
}: {
  title: string;
  hint: string;
  catalog: FindingDef[];
  selected: string[];
  other: string;
  onToggle: (id: string) => void;
  onOther: (value: string) => void;
}) {
  const showOther = selected.includes("other");
  return (
    <div>
      <h3>{title}</h3>
      <p className="body-checks__meta">{hint}</p>
      <div className="body-checks__tiles">
        {catalog.map((item) => (
          <button key={item.id} type="button" className="body-checks__tile" aria-pressed={selected.includes(item.id)} onClick={() => onToggle(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {showOther ? (
        <label>
          Describe other
          <input className="admin-input" value={other} onChange={(event) => onOther(event.target.value)} maxLength={240} />
        </label>
      ) : null}
    </div>
  );
}

function keyFindings(report: BodyCheckReport) {
  return [...report.ears, ...report.nails, ...report.bodyGrooming, ...report.bodyPhysical]
    .map((item) => item.label)
    .slice(0, 3)
    .join(", ") || "—";
}
