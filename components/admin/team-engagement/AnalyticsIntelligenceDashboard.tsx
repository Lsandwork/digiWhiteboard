"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { BarkItem, InsightItem, IntelligencePayload, ResponseItem, StaffItem } from "@/lib/team-engagement/analytics-intelligence";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";

const ASSET = "/assets/ruffops/team-engagement/analytics";
const COLORS = ["#0492C2", "#23845D", "#E97832", "#6B5CA5", "#08749A", "#C47B2B", "#3E7C8A", "#8A6A9A"];
type TabId = "overview" | "responses" | "bark_outs" | "trends" | "team" | "reports";
type Preset = "7" | "30" | "90" | "365" | "custom";
type DialogState =
  | { kind: "response"; row: ResponseItem }
  | { kind: "bark"; row: BarkItem }
  | { kind: "profile"; userId: string; name: string };

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "responses", label: "Responses" },
  { id: "bark_outs", label: "Bark Outs" },
  { id: "trends", label: "Engagement Trends" },
  { id: "team", label: "Team Performance" },
  { id: "reports", label: "Reports" }
];

function pacificToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`;
  return letters.toUpperCase() || "?";
}

function hue(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 42% 42%)`;
}

function Mark({ name }: { name: string }) {
  return (
    <span
      className="ro-te-icon ro-ai-mark"
      style={{
        backgroundColor: "currentColor",
        maskImage: `url(/assets/ruffops/team-engagement/icons/${name}.svg)`,
        WebkitMaskImage: `url(/assets/ruffops/team-engagement/icons/${name}.svg)`,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "contain"
      }}
      aria-hidden
    />
  );
}

function SectionTitle({ icon, title, action }: { icon: string; title: string; action?: ReactNode }) {
  return (
    <div className="ro-ai-section-title">
      <h3>
        <Mark name={icon} />
        {title}
      </h3>
      {action}
    </div>
  );
}

function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <button type="button" className="ro-ai-info" aria-label={label}>
      i<span className="ro-ai-info__tip">{text}</span>
    </button>
  );
}

function Delta({ direction, label }: { direction: "up" | "down" | "flat"; label: string }) {
  return <p className={`ro-ai-delta ro-ai-delta--${direction}`}>{label}</p>;
}

function EmptyCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="ro-ai-empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function TrendMark({ trend }: { trend: StaffItem["trend"] }) {
  if (trend === "none") return <span className="ro-ai-muted">—</span>;
  const label = trend === "up" ? "Higher than the prior period" : trend === "down" ? "Lower than the prior period" : "About the same as the prior period";
  return <span className={`ro-ai-trend ro-ai-trend--${trend}`} title={label} aria-label={label} />;
}

export default function AnalyticsIntelligenceDashboard({ notice }: { notice?: string | null }) {
  const today = pacificToday();
  const [preset, setPreset] = useState<Preset>("30");
  const [customFrom, setCustomFrom] = useState(addDays(today, -29));
  const [customTo, setCustomTo] = useState(today);
  const [draft, setDraft] = useState({ department: "all", userId: "all", source: "all", questionType: "all", category: "all", q: "" });
  const [applied, setApplied] = useState(draft);
  const [tab, setTab] = useState<TabId>("overview");
  const [page, setPage] = useState(1);
  const [barkPage, setBarkPage] = useState(1);
  const [sort, setSort] = useState<"submittedAt" | "employee" | "question">("submittedAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [barkQ, setBarkQ] = useState("");
  const [appliedBarkQ, setAppliedBarkQ] = useState("");
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [templateId, setTemplateId] = useState("organization_engagement");
  const [sections, setSections] = useState<string[]>(["about", "totals", "categories", "departments", "insights"]);
  const [staffSort, setStaffSort] = useState<keyof StaffItem>("name");
  const [staffDir, setStaffDir] = useState<"asc" | "desc">("asc");

  const range = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    const days = preset === "7" ? 6 : preset === "30" ? 29 : preset === "90" ? 89 : 365;
    return { from: addDays(today, -days), to: today };
  }, [preset, customFrom, customTo, today]);

  const queryKey = useMemo(
    () => [tab, range.from, range.to, applied.department, applied.userId, applied.source, applied.questionType, applied.category, applied.q, appliedBarkQ, page, barkPage, sort, dir, nonce].join("|"),
    [applied, appliedBarkQ, barkPage, dir, nonce, page, range.from, range.to, sort, tab]
  );
  const pending = loadedKey !== queryKey;
  const loading = pending && !data;
  const refreshing = pending && Boolean(data);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      view: "analytics",
      panel: "intelligence",
      tab,
      from: range.from,
      to: range.to,
      department: applied.department,
      userId: applied.userId,
      source: applied.source,
      questionType: applied.questionType,
      category: applied.category,
      q: applied.q,
      barkQ: appliedBarkQ,
      page: String(page),
      barkPage: String(barkPage),
      sort,
      dir
    });
    void fetchAdminJson<IntelligencePayload & { error?: string }>(`/api/admin/team-engagement?${params.toString()}`, {
      signal: controller.signal,
      timeoutMs: 20000,
      timeoutMessage: "Analytics is taking too long. Narrow the date range and try again."
    })
      .then(({ ok, body }) => {
        if (controller.signal.aborted) return;
        if (!ok) {
          setError(body.error ?? "Analytics could not load.");
          return;
        }
        setError(null);
        setData(body);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Analytics could not load.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedKey(queryKey);
      });
    return () => controller.abort();
  }, [applied, appliedBarkQ, barkPage, dir, nonce, page, queryKey, range.from, range.to, sort, tab]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  const staff = useMemo(() => {
    const rows = [...(data?.staff ?? [])];
    rows.sort((a, b) => {
      const left = a[staffSort];
      const right = b[staffSort];
      if (typeof left === "number" && typeof right === "number") return staffDir === "asc" ? left - right : right - left;
      return staffDir === "asc" ? String(left ?? "").localeCompare(String(right ?? "")) : String(right ?? "").localeCompare(String(left ?? ""));
    });
    return rows;
  }, [data?.staff, staffDir, staffSort]);

  function applyFilters() {
    setApplied(draft);
    setPage(1);
    setBarkPage(1);
  }

  function choosePreset(next: Preset) {
    setPreset(next);
    setPage(1);
  }

  function openProfile(userId: string, name: string) {
    setDialog({ kind: "profile", userId, name });
  }

  function exportHref(format: "csv" | "pdf" | "xls") {
    const params = new URLSearchParams({ type: templateId, format, from: range.from, to: range.to, sections: sections.join(",") });
    if (applied.department !== "all") params.set("department", applied.department);
    if (applied.userId !== "all") params.set("userId", applied.userId);
    if (applied.source !== "all") params.set("source", applied.source);
    if (applied.questionType !== "all") params.set("questionType", applied.questionType);
    if (applied.category !== "all") params.set("category", applied.category);
    if (applied.q) params.set("q", applied.q);
    return `/api/admin/team-engagement/export?${params.toString()}`;
  }

  const template = data?.templates.find((item) => item.id === templateId) ?? data?.templates[0];

  return (
    <div className="ro-ai">
      {notice ? <p className="ro-ai-banner">{notice}</p> : null}
      <header className="ro-ai-top">
        <div>
          <p className="ro-ai-kicker">Analytics & Reporting</p>
          <p className="ro-ai-lede">
            Review participation, the original answers teammates submitted, Bark Outs, and how those records change over time.
            These figures describe engagement activity, not job-performance scores.
          </p>
        </div>
        <div className="ro-ai-controls">
          <div className="ro-ai-pills" role="group" aria-label="Date range">
            {(
              [
                ["7", "7D"],
                ["30", "30D"],
                ["90", "90D"],
                ["365", "12 mo"]
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={preset === id} onClick={() => choosePreset(id)}>
                {label}
              </button>
            ))}
            <button type="button" aria-pressed={preset === "custom"} onClick={() => choosePreset("custom")}>
              Custom
            </button>
          </div>
          {preset === "custom" ? (
            <div className="ro-ai-dates">
              <input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} aria-label="Start date" />
              <input type="date" value={customTo} min={customFrom} max={today} onChange={(event) => setCustomTo(event.target.value)} aria-label="End date" />
            </div>
          ) : null}
          <button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={() => setNonce((value) => value + 1)}>
            Refresh
          </button>
          <p className="ro-ai-updated">{data ? `Updated ${formatWhen(data.generatedAt)} PT` : "Waiting for records"}</p>
        </div>
      </header>

      <div className="ro-ai-tabs" role="tablist" aria-label="Analytics sections">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <FilterBar
        draft={draft}
        setDraft={setDraft}
        data={data}
        onApply={applyFilters}
      />

      {error ? (
        <div className="ro-ai-banner ro-ai-banner--bad" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setNonce((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : null}
      {loading && !data ? <p className="ro-ai-muted">Loading engagement records…</p> : null}
      {refreshing ? <p className="ro-ai-muted">Updating…</p> : null}

      {data && data.tab === tab && tab === "overview" ? (
        <Overview
          data={data}
          staff={staff}
          onResponses={() => setTab("responses")}
          onTeam={() => setTab("team")}
          onProfile={openProfile}
          onResponse={(row) => setDialog({ kind: "response", row })}
        />
      ) : null}
      {data && data.tab === tab && tab === "responses" ? (
        <Responses
          data={data}
          onSort={(next) => {
            setDir(sort === next && dir === "asc" ? "desc" : "asc");
            setSort(next);
            setPage(1);
          }}
          sort={sort}
          dir={dir}
          onPage={setPage}
          onOpen={(row) => setDialog({ kind: "response", row })}
          onProfile={openProfile}
        />
      ) : null}
      {data && data.tab === tab && tab === "bark_outs" ? (
        <BarkOuts
          data={data}
          barkQ={barkQ}
          onBarkQ={setBarkQ}
          onSearch={() => {
            setAppliedBarkQ(barkQ);
            setBarkPage(1);
          }}
          onPage={setBarkPage}
          onOpen={(row) => setDialog({ kind: "bark", row })}
          onProfile={openProfile}
        />
      ) : null}
      {data && data.tab === tab && tab === "trends" ? <Trends data={data} /> : null}
      {data && data.tab === tab && tab === "team" ? (
        <Team
          data={data}
          staff={staff}
          staffSort={staffSort}
          staffDir={staffDir}
          onSort={(key) => {
            setStaffDir(staffSort === key && staffDir === "asc" ? "desc" : "asc");
            setStaffSort(key);
          }}
          onProfile={openProfile}
          onDepartment={(key) => {
            const next = { ...applied, department: key };
            setDraft(next);
            setApplied(next);
          }}
        />
      ) : null}
      {data && data.tab === tab && tab === "reports" && template ? (
        <Reports
          data={data}
          templateId={template.id}
          sections={sections}
          onTemplate={(id) => {
            const next = data.templates.find((item) => item.id === id);
            setTemplateId(id);
            setSections(next ? [...next.sections] : []);
          }}
          onSection={(id, checked) => setSections((current) => (checked ? [...current, id] : current.filter((item) => item !== id)))}
          exportHref={exportHref}
        />
      ) : null}

      {dialog ? (
        <div className="ro-ai-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <div className="ro-ai-dialog" role="dialog" aria-modal="true" aria-label={dialog.kind === "profile" ? dialog.name : "Record detail"}>
            <button type="button" className="ro-te-btn ro-te-btn--ghost ro-ai-dialog__close" onClick={() => setDialog(null)} aria-label="Close">
              Close
            </button>
            {dialog.kind === "response" ? <ResponseDetail row={dialog.row} onProfile={openProfile} /> : null}
            {dialog.kind === "bark" ? <BarkDetail row={dialog.row} onProfile={openProfile} /> : null}
            {dialog.kind === "profile" ? <ProfileDetail userId={dialog.userId} from={range.from} to={range.to} department={applied.department} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterBar({
  draft,
  setDraft,
  data,
  onApply
}: {
  draft: { department: string; userId: string; source: string; questionType: string; category: string; q: string };
  setDraft: Dispatch<SetStateAction<typeof draft>>;
  data: IntelligencePayload | null;
  onApply: () => void;
}) {
  return (
    <section className="ro-ai-card ro-ai-filters">
      <SectionTitle icon="filter" title="Quick filters" />
      <div className="ro-ai-filter-grid">
        <label>
          Team member
          <select value={draft.userId} onChange={(event) => setDraft({ ...draft, userId: event.target.value })}>
            <option value="all">All visible teammates</option>
            {(data?.filters.employees ?? []).map((employee) => (
              <option key={employee.userId} value={employee.userId}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Department
          <select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>
            <option value="all">All in scope</option>
            {(data?.filters.departments ?? []).map((department) => (
              <option key={department.key} value={department.key}>
                {department.label}
              </option>
            ))}
          </select>
        </label>
        <label title="Team engagement records do not store a location.">
          Location
          <select disabled value="">
            <option>Not tracked</option>
          </select>
        </label>
        <label title="Team engagement records do not store a service area.">
          Service area
          <select disabled value="">
            <option>Not tracked</option>
          </select>
        </label>
        <label>
          Question type
          <select value={draft.questionType} onChange={(event) => setDraft({ ...draft, questionType: event.target.value })}>
            <option value="all">All types</option>
            {(data?.filters.questionTypes ?? []).map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
            <option value="all">All categories</option>
            {(data?.filters.categories ?? []).map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}>
            <option value="all">All sources</option>
            {(data?.filters.sources ?? []).map((source) => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search answers
          <input
            value={draft.q}
            placeholder="Name or words in an answer"
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") onApply();
            }}
          />
        </label>
      </div>
      <div className="ro-ai-filter-actions">
        <button type="button" className="ro-te-btn ro-te-btn--primary" onClick={onApply}>
          Apply filters
        </button>
        <p>Date, department, and team member update every figure. Question type, category, source, and search update response totals and the response table.</p>
      </div>
    </section>
  );
}

function Kpis({ data }: { data: IntelligencePayload }) {
  const cards = [
    { icon: "staff-directory", tone: "blue", label: "Team members", value: String(data.kpis.teamMembers.value), delta: data.kpis.teamMembers.delta, formula: data.kpis.teamMembers.formula },
    {
      icon: "analytics",
      tone: "green",
      label: "Engagement score",
      value: data.kpis.engagementScore.value == null ? "—" : `${data.kpis.engagementScore.value}%`,
      delta: data.kpis.engagementScore.delta,
      formula: data.kpis.engagementScore.formula
    },
    { icon: "feedback", tone: "orange", label: "Total responses", value: String(data.kpis.responses.value), delta: data.kpis.responses.delta, formula: data.kpis.responses.formula },
    { icon: "bark-outs", tone: "red", label: "Bark Outs", value: String(data.kpis.barkOuts.value), delta: data.kpis.barkOuts.delta, formula: data.kpis.barkOuts.formula },
    {
      icon: "recognition",
      tone: "purple",
      label: "Team Pulse average",
      value: data.kpis.teamRating.value == null ? "—" : `${data.kpis.teamRating.value} / 5`,
      delta: data.kpis.teamRating.delta,
      formula: data.kpis.teamRating.formula
    }
  ];
  return (
    <div className="ro-ai-kpis">
      {cards.map((card) => (
        <article key={card.label} className="ro-ai-card ro-ai-kpi">
          <span className={`ro-ai-badge ro-ai-badge--${card.tone}`}>
            <Mark name={card.icon} />
          </span>
          <div>
            <div className="ro-ai-kpi__value">{card.value}</div>
            <div className="ro-ai-kpi__label">
              {card.label} <InfoTip label={`How ${card.label} is calculated`} text={card.formula} />
            </div>
            <Delta direction={card.delta.direction} label={card.delta.label} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Overview({
  data,
  staff,
  onResponses,
  onTeam,
  onProfile,
  onResponse
}: {
  data: IntelligencePayload;
  staff: StaffItem[];
  onResponses: () => void;
  onTeam: () => void;
  onProfile: (userId: string, name: string) => void;
  onResponse: (row: ResponseItem) => void;
}) {
  return (
    <div className="ro-ai-stack">
      <p className="ro-ai-compare">
        {data.range.from} to {data.range.to}, compared with {data.priorRange.from} to {data.priorRange.to}. {data.scope.label}. {data.limits.note}
      </p>
      <Kpis data={data} />
      <div className="ro-ai-grid-main">
        <section className="ro-ai-card">
          <SectionTitle icon="analytics" title="Engagement trend" />
          <ChartFrame empty={!data.series.length}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E6EEF3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6C7F8C" }} interval="preserveStartEnd" />
                <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 11, fill: "#6C7F8C" }} width={36} />
                <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: "#6C7F8C" }} width={32} />
                <Tooltip />
                <Legend />
                <Line yAxisId="score" type="monotone" dataKey="engagementScore" name="Engagement score" stroke="#0492C2" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="count" type="monotone" dataKey="barkOuts" name="Bark Outs" stroke="#E97832" strokeWidth={2} dot={false} />
                <Line yAxisId="count" type="monotone" dataKey="responses" name="Responses" stroke="#6B5CA5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </section>
        <section className="ro-ai-card">
          <SectionTitle icon="programs" title="Engagement by category" />
          {data.categories.length ? (
            <div className="ro-ai-donut">
              <div className="ro-ai-donut__chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.categories} dataKey="count" nameKey="label" innerRadius={52} outerRadius={74} paddingAngle={2} stroke="#fff">
                      {data.categories.map((entry, index) => (
                        <Cell key={entry.key} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="ro-ai-donut__center">
                  <strong>{data.responseKpis.total}</strong>
                  <span>answers</span>
                </div>
              </div>
              <ul className="ro-ai-legend">
                {data.categories.map((entry, index) => (
                  <li key={entry.key}>
                    <i style={{ background: COLORS[index % COLORS.length] }} />
                    <span>{entry.label}</span>
                    <b>{entry.percent}%</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyCopy title="No categorized answers" body="Category slices appear when identified answers exist for these filters." />
          )}
          {data.anonymous.withheldAnswers || data.anonymous.includedAnswers ? (
            <p className="ro-ai-note">
              {data.anonymous.includedAnswers ? `${data.anonymous.includedAnswers} anonymous answers are counted only in survey aggregates. ` : ""}
              {data.anonymous.withheldAnswers ? `${data.anonymous.withheldAnswers} anonymous answers are below the survey minimum and are withheld.` : ""}
            </p>
          ) : null}
        </section>
        <aside className="ro-ai-card ro-ai-promo">
          <Image
            src={`${ASSET}/illustration/fitdog_dog_promo_artwork.png`}
            alt="Golden retriever in an orange bandana beside the words Stronger Team. Happier Dogs."
            width={218}
            height={220}
          />
        </aside>
      </div>
      <div className="ro-ai-grid-bottom">
        <section className="ro-ai-card">
          <SectionTitle
            icon="staff-directory"
            title="Team engagement activity"
            action={
              <button type="button" className="ro-ai-link" onClick={onTeam}>
                View team
              </button>
            }
          />
          <p className="ro-ai-note">Participation and recognition only. This is not a job-performance ranking.</p>
          <StaffTable rows={staff.slice(0, 6)} onProfile={onProfile} />
        </section>
        <section className="ro-ai-card">
          <SectionTitle
            icon="feedback"
            title="Recent responses"
            action={
              <button type="button" className="ro-ai-link" onClick={onResponses}>
                View all
              </button>
            }
          />
          {data.recentResponses.length ? (
            <ul className="ro-ai-feed">
              {data.recentResponses.map((row) => (
                <li key={row.id}>
                  <button type="button" className="ro-ai-feed__button" onClick={() => onResponse(row)}>
                    <span className="ro-ai-avatar" style={{ background: hue(row.employeeName) }}>{initials(row.employeeName)}</span>
                    <span>
                      <strong>{row.employeeName}</strong>
                      <em>{row.question}</em>
                      <span className="ro-ai-answer">{row.answer}</span>
                    </span>
                    <time dateTime={row.submittedAt}>{formatWhen(row.submittedAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyCopy title="No answers in this range" body="Team Pulse, identified surveys, Fun Zone answers, and suggestions will show here." />
          )}
        </section>
        <section className="ro-ai-card">
          <SectionTitle icon="alert" title="Insights & alerts" />
          <ul className="ro-ai-insights">
            {data.insights.map((insight) => (
              <Insight key={insight.id} insight={insight} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Insight({ insight }: { insight: InsightItem }) {
  return (
    <li className={`ro-ai-insight ro-ai-insight--${insight.tone}`}>
      <strong>{insight.title}</strong>
      <p>{insight.detail}</p>
      <p className="ro-ai-formula">{insight.formula}</p>
    </li>
  );
}

function StaffTable({ rows, onProfile, onSort }: { rows: StaffItem[]; onProfile: (userId: string, name: string) => void; onSort?: (key: keyof StaffItem) => void }) {
  if (!rows.length) return <EmptyCopy title="No teammates in this view" body="Adjust the department filter or confirm people are active in your scope." />;
  const header = (key: keyof StaffItem, label: string) =>
    onSort ? (
      <button type="button" onClick={() => onSort(key)}>
        {label}
      </button>
    ) : (
      label
    );
  return (
    <div className="ro-ai-table-wrap">
      <table className="ro-ai-table">
        <thead>
          <tr>
            <th>{header("name", "Employee")}</th>
            <th>{header("department", "Department")}</th>
            <th>{header("engagementScore", "Pulse score")}</th>
            <th>{header("responses", "Responses")}</th>
            <th>{header("barkOutsGiven", "Given")}</th>
            <th>{header("barkOutsReceived", "Received")}</th>
            <th>Participation</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId}>
              <td>
                <button type="button" className="ro-ai-person" onClick={() => onProfile(row.userId, row.name)}>
                  <span className="ro-ai-avatar" style={{ background: hue(row.name) }}>{initials(row.name)}</span>
                  {row.name}
                </button>
              </td>
              <td>{row.department}</td>
              <td>{row.engagementScore == null ? "—" : `${row.engagementScore}%`}</td>
              <td>{row.responses}</td>
              <td>{row.barkOutsGiven}</td>
              <td>{row.barkOutsReceived}</td>
              <td>{row.participated ? (row.pulseParticipation == null ? "Yes" : `${row.pulseParticipation}% of weeks`) : "No activity"}</td>
              <td><TrendMark trend={row.trend} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Responses({
  data,
  sort,
  dir,
  onSort,
  onPage,
  onOpen,
  onProfile
}: {
  data: IntelligencePayload;
  sort: string;
  dir: string;
  onSort: (sort: "submittedAt" | "employee" | "question") => void;
  onPage: (page: number) => void;
  onOpen: (row: ResponseItem) => void;
  onProfile: (userId: string, name: string) => void;
}) {
  const page = data.responses;
  return (
    <div className="ro-ai-stack">
      <div className="ro-ai-kpis ro-ai-kpis--compact">
        <Mini label="Submissions" value={data.responseKpis.total} />
        <Mini label="Teammates" value={data.responseKpis.uniqueEmployees} />
        <Mini label="Questions" value={data.responseKpis.questionsAnswered} />
        <Mini label="Participation" value={data.responseKpis.participationRate == null ? "—" : `${data.responseKpis.participationRate}%`} />
        <Mini label="Unreviewed suggestions" value={data.responseKpis.unreviewed == null ? "—" : data.responseKpis.unreviewed} />
      </div>
      <p className="ro-ai-note">{data.responseKpis.classificationReason}</p>
      <section className="ro-ai-card">
        <div className="ro-ai-table-wrap">
          <table className="ro-ai-table">
            <thead>
              <tr>
                <th><button type="button" onClick={() => onSort("employee")}>Employee {sort === "employee" ? (dir === "asc" ? "↑" : "↓") : ""}</button></th>
                <th>Department</th>
                <th><button type="button" onClick={() => onSort("question")}>Question {sort === "question" ? (dir === "asc" ? "↑" : "↓") : ""}</button></th>
                <th>Answer</th>
                <th>Category</th>
                <th><button type="button" onClick={() => onSort("submittedAt")}>Submitted {sort === "submittedAt" ? (dir === "asc" ? "↑" : "↓") : ""}</button></th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.items.length ? page.items.map((row) => (
                <tr key={row.id}>
                  <td><button type="button" className="ro-ai-link" onClick={() => onProfile(row.employeeId, row.employeeName)}>{row.employeeName}</button></td>
                  <td>{row.department}</td>
                  <td>{row.question}</td>
                  <td className="ro-ai-answer-cell">{row.answer}</td>
                  <td>{row.categoryLabel}</td>
                  <td>{formatWhen(row.submittedAt)}</td>
                  <td>{row.status}</td>
                  <td><button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={() => onOpen(row)}>Open</button></td>
                </tr>
              )) : (
                <tr><td colSpan={8}>No identified answers match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page.page} pages={page.pages} total={page.total} onPage={onPage} />
      </section>
    </div>
  );
}

function BarkOuts({
  data,
  barkQ,
  onBarkQ,
  onSearch,
  onPage,
  onOpen,
  onProfile
}: {
  data: IntelligencePayload;
  barkQ: string;
  onBarkQ: (value: string) => void;
  onSearch: () => void;
  onPage: (page: number) => void;
  onOpen: (row: BarkItem) => void;
  onProfile: (userId: string, name: string) => void;
}) {
  const board = data.barkOuts;
  if (!board) return <p className="ro-ai-muted">Loading Bark Outs…</p>;
  return (
    <div className="ro-ai-stack">
      <div className="ro-ai-kpis ro-ai-kpis--compact">
        <Mini label="Posted Bark Outs" value={board.total} />
        <Mini label="People who gave one" value={board.given} />
        <Mini label="People who received one" value={board.received} />
      </div>
      <p className="ro-ai-note">The sender gave the recognition. The recipient received it. Counts use posted Bark Outs only.</p>
      <div className="ro-ai-grid-main">
        <section className="ro-ai-card">
          <h3 className="ro-ai-h">Recognition activity</h3>
          {board.leaderboard.length ? (
            <div className="ro-ai-table-wrap">
              <table className="ro-ai-table">
                <thead>
                  <tr><th>Teammate</th><th>Department</th><th>Received</th><th>Given</th><th>Latest received</th></tr>
                </thead>
                <tbody>
                  {board.leaderboard.map((row) => (
                    <tr key={row.userId}>
                      <td><button type="button" className="ro-ai-link" onClick={() => onProfile(row.userId, row.name)}>{row.name}</button></td>
                      <td>{row.department}</td>
                      <td>{row.received}</td>
                      <td>{row.given}</td>
                      <td>{row.latestAt ? formatWhen(row.latestAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyCopy title="No posted Bark Outs" body="Recognition posted in this range will be listed here." />}
        </section>
        <section className="ro-ai-card">
          <h3 className="ro-ai-h">By department</h3>
          <ChartFrame empty={!data.departments.length} height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.departments}>
                <CartesianGrid stroke="#E6EEF3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} height={60} textAnchor="end" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="barkOutsReceived" name="Received" fill="#0492C2" />
                <Bar dataKey="barkOutsGiven" name="Given" fill="#E97832" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </section>
      </div>
      <section className="ro-ai-card">
        <div className="ro-ai-inline">
          <h3 className="ro-ai-h">Bark Out history</h3>
          <input value={barkQ} placeholder="Search sender, recipient, or message" aria-label="Search Bark Outs" onChange={(event) => onBarkQ(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} />
          <button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={onSearch}>Search</button>
        </div>
        <div className="ro-ai-table-wrap">
          <table className="ro-ai-table">
            <thead>
              <tr><th>Given by</th><th>Received by</th><th>Message</th><th>Date</th><th>Recipient department</th><th>Category</th><th></th></tr>
            </thead>
            <tbody>
              {board.items.length ? board.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.givenByViewable && row.givenById ? <button type="button" className="ro-ai-link" onClick={() => onProfile(row.givenById!, row.givenBy)}>{row.givenBy}</button> : row.givenBy}</td>
                  <td>{row.receivedByViewable && row.receivedById ? <button type="button" className="ro-ai-link" onClick={() => onProfile(row.receivedById!, row.receivedBy)}>{row.receivedBy}</button> : row.receivedBy}</td>
                  <td className="ro-ai-answer-cell">{row.message}</td>
                  <td>{formatWhen(row.publishedAt ?? row.submittedAt)}</td>
                  <td>{row.recipientDepartment}</td>
                  <td>{row.categoryLabel}</td>
                  <td><button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={() => onOpen(row)}>Open</button></td>
                </tr>
              )) : <tr><td colSpan={7}>No posted Bark Outs match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={board.page} pages={board.pages} total={board.total} onPage={onPage} />
      </section>
    </div>
  );
}

function Trends({ data }: { data: IntelligencePayload }) {
  return (
    <div className="ro-ai-stack">
      <p className="ro-ai-compare">Each point is {data.range.bucket === "week" ? "a week" : "a day"} inside {data.range.from} to {data.range.to}, set beside {data.priorRange.from} to {data.priorRange.to}.</p>
      <section className="ro-ai-card">
        <h3 className="ro-ai-h">Engagement, responses, and Bark Outs</h3>
        <ChartFrame empty={!data.series.length} height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series}>
              <CartesianGrid stroke="#E6EEF3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="score" domain={[0, 100]} />
              <YAxis yAxisId="count" orientation="right" allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line yAxisId="score" dataKey="engagementScore" name="Engagement score" stroke="#0492C2" dot={false} strokeWidth={2} connectNulls />
              <Line yAxisId="count" dataKey="participants" name="Participants" stroke="#23845D" dot={false} strokeWidth={2} />
              <Line yAxisId="count" dataKey="responses" name="Responses" stroke="#6B5CA5" dot={false} strokeWidth={2} />
              <Line yAxisId="count" dataKey="barkOuts" name="Bark Outs" stroke="#E97832" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </section>
      <div className="ro-ai-grid-main">
        <section className="ro-ai-card">
          <h3 className="ro-ai-h">Answers by source</h3>
          <ChartFrame empty={!data.series.some((point) => point.responses)} height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series}>
                <CartesianGrid stroke="#E6EEF3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="pulse" stackId="a" name="Team Pulse" fill="#0492C2" />
                <Bar dataKey="voice" stackId="a" name="Employee Voice" fill="#6B5CA5" />
                <Bar dataKey="fun" stackId="a" name="Fun Zone" fill="#E97832" />
                <Bar dataKey="feedback" stackId="a" name="Suggestions" fill="#23845D" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </section>
        <section className="ro-ai-card">
          <h3 className="ro-ai-h">Department participation</h3>
          <ChartFrame empty={!data.departments.length} height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.departments}>
                <CartesianGrid stroke="#E6EEF3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} height={70} textAnchor="end" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="participationRate" name="This period %" fill="#0492C2" />
                <Bar dataKey="priorParticipationRate" name="Prior period %" fill="#9EC9D8" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </section>
      </div>
      <section className="ro-ai-card">
        <h3 className="ro-ai-h">Response categories</h3>
        {data.categories.length ? (
          <div className="ro-ai-table-wrap">
            <table className="ro-ai-table">
              <thead><tr><th>Category</th><th>Answers</th><th>Share</th></tr></thead>
              <tbody>
                {data.categories.map((row) => (
                  <tr key={row.key}><td>{row.label}</td><td>{row.count}</td><td>{row.percent}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyCopy title="No category trend" body="Categories come from the answers stored for this range." />}
      </section>
    </div>
  );
}

function Team({
  data,
  staff,
  staffSort,
  staffDir,
  onSort,
  onProfile,
  onDepartment
}: {
  data: IntelligencePayload;
  staff: StaffItem[];
  staffSort: keyof StaffItem;
  staffDir: "asc" | "desc";
  onSort: (key: keyof StaffItem) => void;
  onProfile: (userId: string, name: string) => void;
  onDepartment: (key: string) => void;
}) {
  return (
    <div className="ro-ai-stack">
      <p className="ro-ai-note">Sorted {staffDir === "asc" ? "ascending" : "descending"} by {String(staffSort)}. Engagement here means participation and recognition, not a formal evaluation. Default order is alphabetical until you choose another column.</p>
      <section className="ro-ai-card">
        <h3 className="ro-ai-h">Department comparison</h3>
        <div className="ro-ai-table-wrap">
          <table className="ro-ai-table">
            <thead><tr><th>Department</th><th>Teammates</th><th>Participation</th><th>Prior participation</th><th>Responses</th><th>Bark Outs received</th><th>Bark Outs given</th></tr></thead>
            <tbody>
              {data.departments.map((row) => (
                <tr key={row.key}>
                  <td><button type="button" className="ro-ai-link" onClick={() => onDepartment(row.key)}>{row.label}</button></td>
                  <td>{row.headcount}</td>
                  <td>{row.participationRate == null ? "—" : `${row.participationRate}%`}</td>
                  <td>{row.priorParticipationRate == null ? "—" : `${row.priorParticipationRate}%`}</td>
                  <td>{row.responses}</td>
                  <td>{row.barkOutsReceived}</td>
                  <td>{row.barkOutsGiven}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="ro-ai-card">
        <h3 className="ro-ai-h">Teammates</h3>
        <StaffTable rows={staff} onProfile={onProfile} onSort={onSort} />
        <p className="ro-ai-note">Pulse score turns that teammate&apos;s average Team Pulse rating into a percent of 5. It is blank when they did not submit Team Pulse.</p>
      </section>
    </div>
  );
}

const SECTION_LABELS: Record<string, string> = {
  about: "About this report",
  totals: "Totals",
  categories: "Categories",
  departments: "Departments",
  insights: "Insights",
  employee: "Team member",
  responses: "Original answers",
  recognition: "Bark Outs",
  leaderboard: "Recognition activity",
  staff: "Team activity"
};

function Reports({
  data,
  templateId,
  sections,
  onTemplate,
  onSection,
  exportHref
}: {
  data: IntelligencePayload;
  templateId: string;
  sections: string[];
  onTemplate: (id: string) => void;
  onSection: (id: string, checked: boolean) => void;
  exportHref: (format: "csv" | "pdf" | "xls") => string;
}) {
  const template = data.templates.find((item) => item.id === templateId) ?? data.templates[0]!;
  const selected = new Set(sections);
  return (
    <div className="ro-ai-report">
      <aside className="ro-ai-card">
        <h3 className="ro-ai-h">Report templates</h3>
        <ul className="ro-ai-templates">
          {data.templates.map((item) => (
            <li key={item.id}>
              <button type="button" aria-pressed={item.id === template.id} onClick={() => onTemplate(item.id)}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <fieldset>
          <legend>Sections</legend>
          {template.sections.map((section) => (
            <label key={section} className="ro-ai-check">
              <input type="checkbox" checked={selected.has(section)} onChange={(event) => onSection(section, event.target.checked)} />
              {SECTION_LABELS[section] ?? section}
            </label>
          ))}
        </fieldset>
        <div className="ro-ai-export">
          {data.permissions.canExport ? (
            <>
              <a className="ro-te-btn ro-te-btn--primary" href={exportHref("pdf")}>Export PDF</a>
              <a className="ro-te-btn ro-te-btn--ghost" href={exportHref("csv")}>Export CSV</a>
              <a className="ro-te-btn ro-te-btn--ghost" href={exportHref("xls")}>Export Excel</a>
            </>
          ) : <p>Export needs the engagement export permission.</p>}
        </div>
      </aside>
      <article className="ro-ai-paper">
        <p className="ro-ai-kicker">Preview</p>
        <h2>{template.label}</h2>
        <p>{data.range.from} to {data.range.to} · {data.scope.label}{data.department ? ` · ${data.department.label}` : ""}</p>
        <p className="ro-ai-note">Engagement activity is not a job-performance evaluation. The preview uses the records currently loaded. PDF, CSV, and Excel use the same filters.</p>
        {selected.has("totals") ? (
          <section>
            <h3>Totals</h3>
            <ul>
              <li>Team members: {data.kpis.teamMembers.value}</li>
              <li>Engagement score: {data.kpis.engagementScore.value == null ? "Unavailable" : `${data.kpis.engagementScore.value}%`}</li>
              <li>Identified responses: {data.kpis.responses.value}</li>
              <li>Posted Bark Outs: {data.kpis.barkOuts.value}</li>
              <li>Team Pulse average: {data.kpis.teamRating.value ?? "Unavailable"}</li>
            </ul>
          </section>
        ) : null}
        {selected.has("insights") ? (
          <section>
            <h3>Insights</h3>
            {data.insights.map((insight) => <p key={insight.id}><strong>{insight.title}.</strong> {insight.detail}</p>)}
          </section>
        ) : null}
        {selected.has("responses") ? (
          <section>
            <h3>Answers ({data.responses.total})</h3>
            {data.responses.items.slice(0, 8).map((row) => (
              <p key={row.id}><strong>{row.employeeName}</strong> · {row.question}<br />{row.answer}</p>
            ))}
            {data.responses.total > 8 ? <p className="ro-ai-note">Export includes the rest of the filtered answers.</p> : null}
          </section>
        ) : null}
        {selected.has("recognition") && data.barkOuts ? (
          <section>
            <h3>Bark Outs ({data.barkOuts.total})</h3>
            {data.barkOuts.items.slice(0, 6).map((row) => (
              <p key={row.id}><strong>{row.givenBy}</strong> recognized <strong>{row.receivedBy}</strong><br />{row.message}</p>
            ))}
          </section>
        ) : null}
        {selected.has("staff") ? (
          <section>
            <h3>Team</h3>
            <p>{data.staff.filter((person) => person.participated).length} of {data.staff.length} visible teammates participated.</p>
          </section>
        ) : null}
      </article>
    </div>
  );
}

function ResponseDetail({ row, onProfile }: { row: ResponseItem; onProfile: (userId: string, name: string) => void }) {
  return (
    <div>
      <p className="ro-ai-kicker">{row.sourceLabel}</p>
      <h2>{row.question}</h2>
      <p><button type="button" className="ro-ai-link" onClick={() => onProfile(row.employeeId, row.employeeName)}>{row.employeeName}</button> · {row.department}</p>
      <p className="ro-ai-muted">{formatWhen(row.submittedAt)} PT · {row.categoryLabel} · {row.status}</p>
      <h3>Stored answer</h3>
      <pre className="ro-ai-original">{row.answer}</pre>
      <p className="ro-ai-note">This is the answer stored for this submission, unchanged.</p>
      {row.resolution ? <><h3>Resolution</h3><pre className="ro-ai-original">{row.resolution}</pre></> : null}
      {row.managementNotes.length ? <><h3>Management notes</h3>{row.managementNotes.map((note) => <pre key={note} className="ro-ai-original">{note}</pre>)}</> : null}
      {row.notesLimited ? <p className="ro-ai-note">Some suggestion threads are too large to attach here. Open Team feedback for the full note history.</p> : null}
    </div>
  );
}

function BarkDetail({ row, onProfile }: { row: BarkItem; onProfile: (userId: string, name: string) => void }) {
  const person = (id: string | null, name: string, viewable: boolean) =>
    viewable && id ? <button type="button" className="ro-ai-link" onClick={() => onProfile(id, name)}>{name}</button> : <span>{name}</span>;
  return (
    <div>
      <p className="ro-ai-kicker">Bark Out · {row.categoryLabel}</p>
      <h2>Recognition</h2>
      <p>Given by {person(row.givenById, row.givenBy, row.givenByViewable)} · {row.senderDepartment}</p>
      <p>Received by {person(row.receivedById, row.receivedBy, row.receivedByViewable)} · {row.recipientDepartment}</p>
      <p className="ro-ai-muted">{row.statusLabel} · {formatWhen(row.publishedAt ?? row.submittedAt)} PT</p>
      <h3>Message</h3>
      <pre className="ro-ai-original">{row.message}</pre>
      {row.context ? <><h3>Context</h3><pre className="ro-ai-original">{row.context}</pre></> : null}
    </div>
  );
}

function ProfileDetail({ userId, from, to, department }: { userId: string; from: string; to: string; department: string }) {
  const [intel, setIntel] = useState<IntelligencePayload | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ view: "analytics", panel: "intelligence", tab: "profile", userId, from, to, department });
    let cancelled = false;
    void Promise.all([
      fetchAdminJson<IntelligencePayload & { error?: string }>(`/api/admin/team-engagement?${params.toString()}`),
      fetchAdminJson<Record<string, unknown> & { error?: string }>(`/api/admin/team-engagement?view=profile&userId=${encodeURIComponent(userId)}`)
    ])
      .then(([intelligence, record]) => {
        if (cancelled) return;
        if (!intelligence.ok) setError(intelligence.body.error ?? "This profile could not load.");
        else setIntel(intelligence.body);
        if (record.ok) setProfile(record.body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This profile could not load.");
      });
    return () => {
      cancelled = true;
    };
  }, [department, from, to, userId]);
  if (error) return <p role="alert">{error}</p>;
  if (!intel?.focus) return <p className="ro-ai-muted">Loading profile…</p>;
  const focus = intel.focus;
  const recognition = profile?.recognition as { received?: { id: string; message: string; author: { name: string }; recipient: { name: string }; publishedAt: string | null }[]; sent?: { id: string; message: string; author: { name: string }; recipient: { name: string }; publishedAt: string | null }[] } | undefined;
  const development = profile?.development as { available?: boolean; milestones?: { title: string; status: string }[]; goals?: { title: string; status: string }[] } | undefined;
  return (
    <div>
      <p className="ro-ai-kicker">{focus.employee.roleLabel}</p>
      <h2>{focus.employee.name}</h2>
      <p>{focus.employee.department}{focus.employee.title ? ` · ${focus.employee.title}` : ""}</p>
      <p className="ro-ai-note">{focus.note}</p>
      {focus.activity ? (
        <ul className="ro-ai-statline">
          <li>{focus.activity.responses} answers in this range</li>
          <li>{focus.activity.barkOutsGiven} Bark Outs given</li>
          <li>{focus.activity.barkOutsReceived} Bark Outs received</li>
          <li>{focus.activity.participated ? "Participated" : "No participation in this range"}</li>
        </ul>
      ) : null}
      <h3>Answers in this range</h3>
      {focus.responses.length ? focus.responses.map((row) => (
        <p key={row.id}><strong>{row.question}</strong><br /><span className="ro-ai-original">{row.answer}</span></p>
      )) : <p>No identified answers in this range.</p>}
      <h3>Bark Outs in this range</h3>
      <p>Given by {focus.employee.name}</p>
      {focus.barkOutsGiven.length ? focus.barkOutsGiven.map((row) => <p key={row.id}>To {row.receivedBy}: {row.message}</p>) : <p>None posted.</p>}
      <p>Received by {focus.employee.name}</p>
      {focus.barkOutsReceived.length ? focus.barkOutsReceived.map((row) => <p key={row.id}>From {row.givenBy}: {row.message}</p>) : <p>None received.</p>}
      {recognition ? (
        <>
          <h3>Recent recognition history</h3>
          {(recognition.received ?? []).slice(0, 8).map((row) => <p key={row.id}>{row.author.name} recognized {row.recipient.name}: {row.message}</p>)}
          {(recognition.sent ?? []).slice(0, 8).map((row) => <p key={`sent-${row.id}`}>{row.author.name} recognized {row.recipient.name}: {row.message}</p>)}
        </>
      ) : null}
      {development?.available ? (
        <>
          <h3>Development records</h3>
          {(development.milestones ?? []).map((row) => <p key={row.title}>{row.title} · {row.status}</p>)}
          {(development.goals ?? []).map((row) => <p key={row.title}>{row.title} · {row.status}</p>)}
        </>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="ro-ai-card ro-ai-mini">
      <div className="ro-ai-kpi__value">{value}</div>
      <div className="ro-ai-kpi__label">{label}</div>
    </article>
  );
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="ro-ai-pager">
      <span>{total} records</span>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

function ChartFrame({ children, empty, height = 280 }: { children: ReactNode; empty: boolean; height?: number }) {
  if (empty) return <EmptyCopy title="Nothing to chart" body="Charts fill in when the selected dates contain engagement records." />;
  return <div className="ro-ai-chart" style={{ height }}>{children}</div>;
}
