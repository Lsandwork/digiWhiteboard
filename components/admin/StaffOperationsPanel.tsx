"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  MessageSquare,
  Pencil,
  Search,
  Send,
  ShieldAlert,
  UserRound
} from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { OpsRowActions } from "@/components/admin/ui/OpsRowActions";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type {
  ActiveIssue,
  CrossoverMessage,
  CrossoverReply,
  IssueCategory,
  IssueSource,
  OwnerFollowUp,
  StaffActivityLog,
  StaffDirectoryMember,
  StaffOpsPriority,
  StaffOpsStatus
} from "@/lib/staff/admin-ops";
import {
  CROSSOVER_TEMPLATES,
  FRONT_DESK_DEPARTMENT,
  ISSUE_CATEGORIES,
  ISSUE_SOURCES,
  STAFF_DEPARTMENTS,
  STAFF_PRIORITIES,
  STAFF_STATUSES,
  TEAM_LEAD_DEPARTMENT
} from "@/lib/staff/admin-ops";
import {
  ActiveShiftLogCard,
  AddShiftLogEntryCard,
  filterShiftLogRows,
  QuickLogTemplatesSidebar,
  ShiftLogFilterBar,
  type ShiftLogFilters,
  type ShiftLogFormShape
} from "@/components/admin/front-desk/FrontDeskLogUI";
import { KpiSummaryCards, shiftLogKpiCards } from "@/components/admin/ui/KpiSummaryCards";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { canPushCrossoverToWhiteboard } from "@/lib/admin/users";
import {
  buildFormFromTemplate,
  getLogTemplateById,
  serializeTemplateFieldValues,
  validateTemplateFields,
  type TemplateFieldValues
} from "@/lib/frontDeskLog/logTemplates";
import {
  belongsInArchivedLog,
  belongsInCrossoverLog,
  belongsInOpenLog,
  formatShiftLogDayLabel,
  isAssessmentDogLog,
  isDueToday,
  isOpenShiftLogStatus,
  resolveStatusForShiftLog,
  shiftLogDetails,
  shiftLogSubmittedBy,
  shiftLogType
} from "@/lib/staff/front-desk-log";

type StaffOpsTab = "crossover" | "follow_up" | "issues";

type StaffOpsMutate = (label: string, payload: Record<string, unknown>, success: string) => Promise<boolean>;

type StaffOpsPayload = {
  crossover_messages: CrossoverMessage[];
  crossover_message_replies: CrossoverReply[];
  owner_follow_ups: OwnerFollowUp[];
  active_issues: ActiveIssue[];
  activity_logs: StaffActivityLog[];
  staff_directory: StaffDirectoryMember[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

type Filters = {
  query: string;
  department: string;
  priority: string;
  status: string;
  assignedTo: string;
  urgentOnly: boolean;
  overdueOnly: boolean;
  dueTodayOnly: boolean;
};

type FollowUpForm = {
  subject: string;
  owner_name: string;
  dog_name: string;
  assigned_to: string;
  department: string;
  priority: StaffOpsPriority;
  due_date: string;
  follow_up_notes: string;
  urgent: boolean;
};

type IssueForm = {
  title: string;
  category: IssueCategory;
  source: IssueSource;
  assigned_to: string;
  priority: StaffOpsPriority;
  notes: string;
  related_owner_name: string;
  related_dog_name: string;
  due_at: string;
};

const emptyFilters: Filters = {
  query: "",
  department: "",
  priority: "",
  status: "",
  assignedTo: "",
  urgentOnly: false,
  overdueOnly: false,
  dueTodayOnly: false
};

const emptyShiftLogForm: ShiftLogFormShape = {
  log_type: "General Shift Note",
  subject: "",
  details: "",
  priority: "Normal",
  status: "Open",
  assigned_to: "",
  related_dog_name: "",
  related_owner_name: "",
  department_area: "",
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

const emptyShiftLogFilters: ShiftLogFilters = {
  query: "",
  logType: "",
  priority: "",
  status: "",
  assignedTo: "",
  submittedBy: "",
  dueToday: false,
  urgentOnly: false,
  needsReview: false,
  openOnly: false
};

const emptyFollowUpForm: FollowUpForm = {
  subject: "",
  owner_name: "",
  dog_name: "",
  assigned_to: "",
  department: "Front Desk",
  priority: "Normal",
  due_date: "",
  follow_up_notes: "",
  urgent: false
};

const emptyIssueForm: IssueForm = {
  title: "",
  category: "General",
  source: "Front Desk",
  assigned_to: "",
  priority: "Normal",
  notes: "",
  related_owner_name: "",
  related_dog_name: "",
  due_at: ""
};

const PAGE_SIZE = 6;
const FALLBACK_STAFF_OPTIONS = ["Front Desk Team", "Management Team", "Brian", "Amanda", "Bernard", "Halle", "Lonnie", "Michael", "Rebecca"];

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isToday(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isOverdue(value: string | null, status: StaffOpsStatus, nowMs: number) {
  if (!value || status === "Resolved" || status === "Archived" || status === "Check Out" || status === "Completed") return false;
  return new Date(value).getTime() < nowMs;
}

function priorityClass(priority: StaffOpsPriority) {
  if (priority === "Critical" || priority === "High") return "crossover-badge crossover-badge--priority-high";
  if (priority === "Medium") return "crossover-badge crossover-badge--priority-normal";
  return "crossover-badge crossover-badge--priority-muted";
}

function statusClass(status: StaffOpsStatus) {
  if (status === "Resolved" || status === "Completed" || status === "Check Out") return "crossover-badge crossover-badge--status-resolved";
  if (status === "Archived") return "crossover-badge crossover-badge--status-muted";
  if (status === "Pending Review") return "crossover-badge crossover-badge--status-pending";
  if (status === "In Progress") return "crossover-badge crossover-badge--status-active";
  return "crossover-badge crossover-badge--status-active";
}

function includesQuery(values: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.join(" ").toLowerCase().includes(normalized);
}

function activeStaffOptions(directory: StaffDirectoryMember[] | undefined) {
  const names = (directory ?? [])
    .filter((member) => member.status === "Active")
    .map((member) => member.name)
    .filter(Boolean);
  return names.length ? names : FALLBACK_STAFF_OPTIONS;
}

function homeDepartmentForUser(
  directory: StaffDirectoryMember[] | undefined,
  currentUser: StaffOpsPayload["currentUser"]
) {
  const member =
    directory?.find((entry) => entry.admin_user_id === currentUser.adminUserId) ??
    directory?.find((entry) => entry.email?.trim().toLowerCase() === currentUser.email?.trim().toLowerCase());
  if (member?.department) return member.department;
  if (currentUser.role === "team_leader") return TEAM_LEAD_DEPARTMENT;
  if (currentUser.role === "front_desk_coordinator") return FRONT_DESK_DEPARTMENT;
  if (currentUser.role === "groomer") return "Grooming";
  if (currentUser.role === "trainer") return "Training";
  return FRONT_DESK_DEPARTMENT;
}

function crossoverReportedTo(item: CrossoverMessage) {
  return item.reported_to ?? item.assigned_to ?? item.to_department;
}

function crossoverCreatedByLabel(
  directory: StaffDirectoryMember[] | undefined,
  createdBy: string | null | undefined
) {
  if (!createdBy) return "Staff";
  const member =
    directory?.find((entry) => entry.email?.trim().toLowerCase() === createdBy.trim().toLowerCase()) ??
    directory?.find((entry) => entry.admin_user_id === createdBy);
  return member?.name ?? createdBy;
}

function paginate<T>(items: T[], page: number) {
  const maxPage = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  return {
    page: safePage,
    maxPage,
    rows: items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  };
}

function displayCrossoverMessage(item: CrossoverMessage) {
  return shiftLogDetails(item);
}

export function StaffOperationsPanel({ tab }: { tab: StaffOpsTab }) {
  const { showToast } = useToast();
  const [data, setData] = useState<StaffOpsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [nowMs, setNowMs] = useState(0);
  const [detail, setDetail] = useState<{ type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null>(null);
  const staffOptions = useMemo(() => activeStaffOptions(data?.staff_directory), [data?.staff_directory]);

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) setLoading(true);
    try {
      const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load Staff Admin records.");
      setData(body as StaffOpsPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load Staff Admin records.", "error");
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters(emptyFilters);
      setPage(1);
      setDetail(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tab]);

  useEffect(() => {
    const initial = window.setTimeout(() => setNowMs(Date.now()), 0);
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  function applyMutationResult(action: string, result: unknown) {
    if (!result || typeof result !== "object") return;
    setData((prev) => {
      if (!prev) return prev;
      if (action === "create_crossover") {
        const record = result as CrossoverMessage;
        return {
          ...prev,
          crossover_messages: [record, ...prev.crossover_messages.filter((item) => item.id !== record.id)]
        };
      }
      if (action === "update_crossover") {
        const record = result as CrossoverMessage;
        return {
          ...prev,
          crossover_messages: prev.crossover_messages.map((item) => (item.id === record.id ? { ...item, ...record } : item))
        };
      }
      if (action === "reply_crossover") {
        const reply = result as CrossoverReply;
        return {
          ...prev,
          crossover_message_replies: [reply, ...prev.crossover_message_replies.filter((item) => item.id !== reply.id)]
        };
      }
      if (action === "delete_crossover") {
        const id = String((result as { id?: string }).id ?? "");
        if (!id) return prev;
        return {
          ...prev,
          crossover_messages: prev.crossover_messages.filter((item) => item.id !== id),
          crossover_message_replies: prev.crossover_message_replies.filter((item) => item.crossover_message_id !== id)
        };
      }
      if (action === "create_follow_up") {
        const record = result as OwnerFollowUp;
        return {
          ...prev,
          owner_follow_ups: [record, ...prev.owner_follow_ups.filter((item) => item.id !== record.id)]
        };
      }
      if (action === "update_follow_up") {
        const record = result as OwnerFollowUp;
        return {
          ...prev,
          owner_follow_ups: prev.owner_follow_ups.map((item) => (item.id === record.id ? { ...item, ...record } : item))
        };
      }
      if (action === "create_issue") {
        const record = result as ActiveIssue;
        return {
          ...prev,
          active_issues: [record, ...prev.active_issues.filter((item) => item.id !== record.id)]
        };
      }
      if (action === "update_issue") {
        const record = result as ActiveIssue;
        return {
          ...prev,
          active_issues: prev.active_issues.map((item) => (item.id === record.id ? { ...item, ...record } : item))
        };
      }
      return prev;
    });
  }

  async function mutate(label: string, payload: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/staff-operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? label);
      showToast(success, "success");
      applyMutationResult(String(payload.action ?? ""), body.result);
      void load({ quiet: true });
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : label, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const recentActivity = data?.activity_logs ?? [];

  if (tab === "crossover") {
    return (
      <CrossoverPage
        data={data}
        loading={loading}
        busy={busy}
        staffOptions={staffOptions}
        onMutate={mutate}
        onRefresh={load}
        onDetail={(item) => setDetail({ type: "crossover", item })}
        onEdit={(item) => setDetail({ type: "crossover", item })}
        detail={detail}
        onCloseDetail={() => setDetail(null)}
      />
    );
  }

  if (tab === "follow_up") {
    return (
      <FollowUpPage
        data={data}
        loading={loading}
        busy={busy}
        filters={filters}
        setFilters={setFilters}
        page={page}
        setPage={setPage}
        recentActivity={recentActivity}
        nowMs={nowMs}
        staffOptions={staffOptions}
        onMutate={mutate}
        onRefresh={load}
        onDetail={(item) => setDetail({ type: "follow_up", item })}
        detail={detail}
        onCloseDetail={() => setDetail(null)}
      />
    );
  }

  return (
    <IssuesPage
      data={data}
      loading={loading}
      busy={busy}
      filters={filters}
      setFilters={setFilters}
      page={page}
      setPage={setPage}
      recentActivity={recentActivity}
      nowMs={nowMs}
      staffOptions={staffOptions}
      onMutate={mutate}
      onRefresh={load}
      onDetail={(item) => setDetail({ type: "issues", item })}
      detail={detail}
      onCloseDetail={() => setDetail(null)}
    />
  );
}

function PageHeader({ title, subtitle, loading }: { title: string; subtitle: string; loading: boolean }) {
  return (
    <header className="crossover-dashboard__page-header">
      <div>
        <h2 className="crossover-dashboard__page-title">{title}</h2>
        <p className="crossover-dashboard__page-subtitle">{subtitle}</p>
      </div>
      {loading ? <span className="crossover-badge crossover-badge--status-pending">Loading...</span> : null}
    </header>
  );
}

function StatGrid({ cards }: { cards: Array<{ label: string; value: string | number; helper: string; icon: React.ReactNode }> }) {
  return (
    <section className="crossover-stat-grid">
      {cards.map((card) => (
        <div key={card.label} className="crossover-stat-card">
          <div className="crossover-stat-card__icon">{card.icon}</div>
          <div>
            <p className="crossover-stat-card__value">{card.value}</p>
            <p className="crossover-stat-card__label">{card.label}</p>
            <p className="crossover-stat-card__helper">{card.helper}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function FilterBar({
  filters,
  setFilters,
  type,
  staffOptions
}: {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  type: StaffOpsTab;
  staffOptions: string[];
}) {
  return (
    <div className="crossover-filters">
      <label className="crossover-search">
        <Search className="crossover-search__icon-lucide" aria-hidden />
        <input
          className="crossover-input crossover-search__input"
          placeholder={type === "crossover" ? "Search conversations..." : type === "follow_up" ? "Search follow-ups..." : "Search issues..."}
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
      </label>
      <select className="crossover-input crossover-select" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })} aria-label="Filter by priority">
        <option value="">All priorities</option>
        {STAFF_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </select>
      <select className="crossover-input crossover-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by status">
        <option value="">All statuses</option>
        {STAFF_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <select className="crossover-input crossover-select" value={type === "crossover" ? filters.department : filters.assignedTo} onChange={(event) => setFilters(type === "crossover" ? { ...filters, department: event.target.value } : { ...filters, assignedTo: event.target.value })} aria-label={type === "crossover" ? "Filter by department" : "Filter by assignee"}>
        <option value="">{type === "crossover" ? "All departments" : "All assignees"}</option>
        {(type === "crossover" ? STAFF_DEPARTMENTS : staffOptions).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" role="switch" aria-checked={filters.urgentOnly} className={`crossover-urgent-pill ${filters.urgentOnly ? "crossover-urgent-pill--on" : ""}`} onClick={() => setFilters({ ...filters, urgentOnly: !filters.urgentOnly })}>
        Urgent only
      </button>
    </div>
  );
}

function Pager({ page, maxPage, total, onPage }: { page: number; maxPage: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="crossover-pagination">
      <span className="crossover-pagination__meta">Showing page {page} of {maxPage} • {total} total</span>
      <div className="crossover-pagination__controls">
        <button className="crossover-btn crossover-btn--ghost" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
        <span className="crossover-pagination__page">{page}</span>
        <button className="crossover-btn crossover-btn--ghost" type="button" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function CrossoverPage(props: {
  data: StaffOpsPayload | null;
  loading: boolean;
  busy: boolean;
  staffOptions: string[];
  onMutate: StaffOpsMutate;
  onRefresh: () => Promise<void>;
  onDetail: (item: CrossoverMessage) => void;
  onEdit: (item: CrossoverMessage) => void;
  detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null;
  onCloseDetail: () => void;
}) {
  const [form, setForm] = useState<ShiftLogFormShape>(emptyShiftLogForm);
  const [filters, setFilters] = useState<ShiftLogFilters>(emptyShiftLogFilters);
  const [dailyPage, setDailyPage] = useState(1);
  const [openPage, setOpenPage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);
  const [showAllDaily, setShowAllDaily] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);
  const [showAllArchived, setShowAllArchived] = useState(false);
  const todayLabel = useMemo(() => formatShiftLogDayLabel(), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDailyPage(1);
      setOpenPage(1);
      setArchivedPage(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const pickTemplate = useCallback((templateId: string) => {
    const template = getLogTemplateById(templateId);
    if (!template) return;
    setForm((current) => {
      const allowedKeys = new Set(template.fields.map((field) => field.key));
      const preserved: TemplateFieldValues = {};
      for (const key of allowedKeys) {
        const fromFields = current.template_fields[key];
        if (fromFields !== undefined && fromFields !== "" && !(Array.isArray(fromFields) && fromFields.length === 0)) {
          preserved[key] = fromFields;
        } else if (key === "dogName" && current.related_dog_name) {
          preserved[key] = current.related_dog_name;
        } else if (key === "ownerName" && current.related_owner_name) {
          preserved[key] = current.related_owner_name;
        }
      }
      return { ...emptyShiftLogForm, ...buildFormFromTemplate(template, preserved) };
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateParam = params.get("template");
    if (!templateParam) return;
    const template = getLogTemplateById(templateParam);
    if (!template) return;
    const timer = window.setTimeout(() => pickTemplate(template.id), 0);
    return () => window.clearTimeout(timer);
  }, [pickTemplate]);

  const queryFields = useCallback(
    (item: CrossoverMessage) => [
      item.subject,
      shiftLogDetails(item),
      shiftLogType(item),
      item.related_dog_name ?? "",
      item.related_owner_name ?? "",
      shiftLogSubmittedBy(item),
      item.assigned_to ?? "",
      item.assigned_team ?? ""
    ],
    []
  );

  const filteredRows = useMemo(() => {
    const all = props.data?.crossover_messages ?? [];
    return filterShiftLogRows(all, filters, queryFields);
  }, [filters, props.data?.crossover_messages, queryFields]);

  const dailyRows = useMemo(() => {
    // Crossover Log = all of today's entries until someone clicks Archive.
    return filteredRows.filter((item) => belongsInCrossoverLog(item));
  }, [filteredRows]);

  const openRows = useMemo(
    () => filteredRows.filter((item) => belongsInOpenLog(item)),
    [filteredRows]
  );

  const archivedRows = useMemo(() => {
    // Past Resolved/Check Out + explicit Archived (never same-day rows still on Crossover).
    const closed = (props.data?.crossover_messages ?? []).filter((item) => belongsInArchivedLog(item));
    return filterShiftLogRows(closed, { ...filters, status: "", openOnly: false }, queryFields);
  }, [filters, props.data?.crossover_messages, queryFields]);

  const pagedDaily = showAllDaily
    ? { page: 1, maxPage: 1, rows: dailyRows }
    : paginate(dailyRows, dailyPage);
  const pagedOpen = showAllOpen
    ? { page: 1, maxPage: 1, rows: openRows }
    : paginate(openRows, openPage);
  const pagedArchived = showAllArchived
    ? { page: 1, maxPage: 1, rows: archivedRows }
    : paginate(archivedRows, archivedPage);
  const allMessages = props.data?.crossover_messages ?? [];
  const openMessages = allMessages.filter((item) => isOpenShiftLogStatus(item.status));
  const kpiCards = shiftLogKpiCards({
    openCount: openMessages.length,
    needsReviewCount: openMessages.filter((item) => item.needs_management_review || item.status === "Needs Management Review").length,
    dueTodayCount: openMessages.filter((item) => isDueToday(item.due_at) || isDueToday(item.reminder_at)).length,
    urgentCount: openMessages.filter((item) => item.urgent || item.priority === "High" || item.priority === "Urgent" || item.priority === "Critical").length
  });
  const assignOptions = useMemo(() => [...new Set([...props.staffOptions, ...(props.data?.crossover_messages ?? []).map((item) => item.assigned_to).filter(Boolean) as string[]])], [props.data?.crossover_messages, props.staffOptions]);

  async function submit(extra: Partial<ShiftLogFormShape> = {}) {
    const payload = { ...form, ...extra };
    const template = getLogTemplateById(payload.template_id);
    if (template && payload.template_id && payload.template_id !== "custom") {
      const errors = validateTemplateFields(template, payload.template_fields);
      if (Object.keys(errors).length) {
        setForm((current) => ({ ...current, field_errors: errors }));
        return;
      }
    }
    const ok = await props.onMutate(
      "Unable to save shift log entry.",
      {
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
        department_area: payload.department_area || null,
        due_at: payload.due_at || null,
        reminder_at: payload.reminder_at || null,
        needs_management_review: payload.needs_management_review,
        urgent: payload.urgent,
        create_owner_follow_up: payload.create_owner_follow_up,
        create_active_issue: payload.create_active_issue,
        template_title: payload.template_title,
        template_id: payload.template_id,
        template_field_values: serializeTemplateFieldValues(payload.template_fields)
      },
      "Shift log entry saved."
    );
    if (ok) setForm(emptyShiftLogForm);
  }

  return (
    <div className="crossover-dashboard shift-log-readable space-y-6">
      <header className="crossover-dashboard__page-header">
        <h2 className="crossover-dashboard__page-title">Front Desk Tracking Log</h2>
        <p className="crossover-dashboard__page-subtitle">
          Crossover Log keeps every entry logged today until someone clicks Archive — even Resolved, Check Out, or In Progress. Open Log holds unresolved follow-ups. Past Resolved/Check Out goes to Archived Log.
        </p>
        {props.loading ? <span className="admin-badge mt-3 inline-block">Loading...</span> : null}
      </header>

      <KpiSummaryCards cards={kpiCards} />

      <div className="crossover-dashboard__log-section">
        <ShiftLogFilterBar filters={filters} setFilters={setFilters} assignOptions={assignOptions} onClear={() => setFilters(emptyShiftLogFilters)} />
        <div className="crossover-dashboard__log-stack">
          <ActiveShiftLogCard
            rows={pagedDaily.rows}
            total={dailyRows.length}
            page={pagedDaily.page}
            maxPage={pagedDaily.maxPage}
            pageSize={PAGE_SIZE}
            busy={props.busy}
            loading={props.loading}
            canPushToWhiteboard={canPushCrossoverToWhiteboard(props.data?.currentUser.role)}
            currentUser={props.data?.currentUser ?? null}
            directory={props.data?.staff_directory}
            filters={filters}
            setFilters={setFilters}
            assignOptions={assignOptions}
            onPage={setDailyPage}
            onRefresh={props.onRefresh}
            onMutate={props.onMutate}
            onDetail={props.onDetail}
            onEdit={props.onEdit}
            formatDateTime={formatDateTime}
            title={`Crossover Log — ${todayLabel}`}
            subtitle="All of today's entries stay here for AM/PM handoff. Only Archive removes them."
            headingId="shift-log-daily-heading"
            emptyTitle="No crossover entries today"
            emptyText="Everything logged today appears here until Archived."
            showFilterBar={false}
            showRefresh={false}
            logBucket="crossover"
            showAll={showAllDaily}
            onToggleShowAll={() => setShowAllDaily((value) => !value)}
          />
          <ActiveShiftLogCard
            rows={pagedOpen.rows}
            total={openRows.length}
            page={pagedOpen.page}
            maxPage={pagedOpen.maxPage}
            pageSize={PAGE_SIZE}
            busy={props.busy}
            loading={props.loading}
            canPushToWhiteboard={canPushCrossoverToWhiteboard(props.data?.currentUser.role)}
            currentUser={props.data?.currentUser ?? null}
            directory={props.data?.staff_directory}
            filters={filters}
            setFilters={setFilters}
            assignOptions={assignOptions}
            onPage={setOpenPage}
            onRefresh={props.onRefresh}
            onMutate={props.onMutate}
            onDetail={props.onDetail}
            onEdit={props.onEdit}
            formatDateTime={formatDateTime}
            title="Open Log"
            subtitle="Unresolved items from today or earlier shifts that still need follow-up."
            headingId="shift-log-open-heading"
            emptyTitle="No open log entries"
            emptyText="Resolved and archived items are hidden here."
            showFilterBar={false}
            showRefresh={false}
            logBucket="open"
            showAll={showAllOpen}
            onToggleShowAll={() => setShowAllOpen((value) => !value)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" disabled={props.loading} onClick={() => void props.onRefresh()}>
            <FitdogDashboardIcon src="/assets/fitdog/ui/refresh-64.png" size={18} alt="" />
            Refresh logs
          </button>
        </div>
      </div>

      <div className="crossover-dashboard__workspace">
        <div className="crossover-dashboard__workspace-form">
          <AddShiftLogEntryCard
            form={form}
            patchForm={(patch) => setForm((current) => ({ ...current, ...patch }))}
            busy={props.busy}
            assignOptions={props.staffOptions}
            onSubmit={() => submit()}
            onSubmitAndFollowUp={() => submit({ create_owner_follow_up: true })}
          />
        </div>
        <div className="crossover-dashboard__workspace-templates">
          <QuickLogTemplatesSidebar selectedTemplateId={form.template_id} onPick={pickTemplate} />
        </div>
        <div className="crossover-dashboard__workspace-archived">
          <ActiveShiftLogCard
            rows={pagedArchived.rows}
            total={archivedRows.length}
            page={pagedArchived.page}
            maxPage={pagedArchived.maxPage}
            pageSize={PAGE_SIZE}
            busy={props.busy}
            loading={props.loading}
            canPushToWhiteboard={canPushCrossoverToWhiteboard(props.data?.currentUser.role)}
            currentUser={props.data?.currentUser ?? null}
            directory={props.data?.staff_directory}
            filters={filters}
            setFilters={setFilters}
            assignOptions={assignOptions}
            onPage={setArchivedPage}
            onRefresh={props.onRefresh}
            onMutate={props.onMutate}
            onDetail={props.onDetail}
            onEdit={props.onEdit}
            formatDateTime={formatDateTime}
            title="Archived Log"
            subtitle="Prior-day Resolved, Check Out, Completed, and Archived entries."
            headingId="shift-log-archived-heading"
            emptyTitle="No archived or resolved log entries"
            emptyText="Closed items from previous days appear here for reference."
            showFilterBar={false}
            showRefresh={false}
            logBucket="archived"
            showAll={showAllArchived}
            onToggleShowAll={() => setShowAllArchived((value) => !value)}
          />
        </div>
      </div>
      <DetailModal data={props.data} detail={props.detail} busy={props.busy} staffOptions={props.staffOptions} onMutate={props.onMutate} onClose={props.onCloseDetail} />
    </div>
  );
}

function FollowUpPage(props: {
  data: StaffOpsPayload | null; loading: boolean; busy: boolean; filters: Filters; setFilters: (filters: Filters) => void; page: number; setPage: (page: number) => void; recentActivity: StaffActivityLog[]; nowMs: number; staffOptions: string[]; onMutate: StaffOpsMutate; onRefresh: () => Promise<void>; onDetail: (item: OwnerFollowUp) => void; detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null; onCloseDetail: () => void;
}) {
  const [form, setForm] = useState<FollowUpForm>(emptyFollowUpForm);

  useEffect(() => {
    if (!props.data) return;
    const department = homeDepartmentForUser(props.data.staff_directory, props.data.currentUser);
    const timer = window.setTimeout(
      () => setForm((current) => ({ ...current, department })),
      0
    );
    return () => window.clearTimeout(timer);
  }, [props.data]);

  const rows = useMemo(() => (props.data?.owner_follow_ups ?? []).filter((item) => {
    if (props.filters.priority && item.priority !== props.filters.priority) return false;
    if (props.filters.status && item.status !== props.filters.status) return false;
    if (props.filters.assignedTo && item.assigned_to !== props.filters.assignedTo) return false;
    if (props.filters.urgentOnly && !item.urgent && item.priority !== "High" && item.priority !== "Critical") return false;
    if (props.filters.overdueOnly && !isOverdue(item.due_date, item.status, props.nowMs)) return false;
    if (props.filters.dueTodayOnly && !isToday(item.due_date)) return false;
    return includesQuery([item.subject, item.owner_name, item.dog_name, item.assigned_to, item.follow_up_notes], props.filters.query);
  }), [props.data?.owner_follow_ups, props.filters, props.nowMs]);
  const paged = paginate(rows, props.page);

  async function submit() {
    const ok = await props.onMutate("Unable to create follow up.", { ...form, action: "create_follow_up" }, "Follow up created.");
    if (ok) setForm(emptyFollowUpForm);
  }

  return (
    <div className="crossover-dashboard crossover-dashboard__layout space-y-5">
      <PageHeader title="Owner Follow Up" subtitle="Track owner issues, follow-up tasks, and management handoffs." loading={props.loading} />
      <StatGrid cards={[
        { label: "Open Items", value: rows.filter((item) => item.status !== "Resolved" && item.status !== "Archived").length, helper: "Need follow up", icon: <MessageSquare className="h-5 w-5" /> },
        { label: "Assigned Today", value: (props.data?.owner_follow_ups ?? []).filter((item) => isToday(item.created_at) && item.assigned_to).length, helper: "Coordination logged", icon: <UserRound className="h-5 w-5" /> },
        { label: "Overdue", value: (props.data?.owner_follow_ups ?? []).filter((item) => isOverdue(item.due_date, item.status, props.nowMs)).length, helper: "Requires attention", icon: <AlertTriangle className="h-5 w-5" /> },
        { label: "Resolved This Week", value: (props.data?.owner_follow_ups ?? []).filter((item) => item.resolved_at && new Date(item.resolved_at).getTime() > props.nowMs - 7 * 86400000).length, helper: "Great work", icon: <CheckCircle2 className="h-5 w-5" /> }
      ]} />
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="crossover-card crossover-card--conversations">
            <div className="crossover-card__header">
              <div>
                <h3 className="crossover-card__title">Owner Follow Up Queue</h3>
                <p className="crossover-card__subtitle">Track and manage owner follow-up items and next steps.</p>
              </div>
              <button className="crossover-btn crossover-btn--outline" type="button" onClick={() => void props.onRefresh()}>Refresh</button>
            </div>
            <div className="space-y-4 border-b border-[rgba(255,166,0,0.12)] px-5 pb-5">
              <FilterBar filters={props.filters} setFilters={props.setFilters} type="follow_up" staffOptions={props.staffOptions} />
              <div className="flex flex-wrap gap-2">
                <button type="button" role="switch" aria-checked={props.filters.overdueOnly} className={`crossover-urgent-pill ${props.filters.overdueOnly ? "crossover-urgent-pill--on" : ""}`} onClick={() => props.setFilters({ ...props.filters, overdueOnly: !props.filters.overdueOnly })}>Overdue</button>
                <button type="button" role="switch" aria-checked={props.filters.dueTodayOnly} className={`crossover-urgent-pill ${props.filters.dueTodayOnly ? "crossover-urgent-pill--on" : ""}`} onClick={() => props.setFilters({ ...props.filters, dueTodayOnly: !props.filters.dueTodayOnly })}>Due today</button>
              </div>
            </div>
            <DesktopFollowUpTable rows={paged.rows} busy={props.busy} onMutate={props.onMutate} onDetail={props.onDetail} />
            <MobileCards rows={paged.rows} render={(item) => <FollowUpCard item={item} busy={props.busy} onMutate={props.onMutate} onDetail={props.onDetail} />} />
            <Pager page={paged.page} maxPage={paged.maxPage} total={rows.length} onPage={props.setPage} />
          </section>
          <UpcomingSection items={rows} />
        </div>
        <div className="space-y-5">
          <FollowUpFormCard form={form} setForm={setForm} busy={props.busy} staffOptions={props.staffOptions} onSubmit={submit} />
          <RecentActivityPanel items={props.recentActivity} />
        </div>
      </section>
      <DetailModal data={props.data} detail={props.detail} busy={props.busy} staffOptions={props.staffOptions} onMutate={props.onMutate} onClose={props.onCloseDetail} />
    </div>
  );
}

function DesktopFollowUpTable({ rows, busy, onMutate, onDetail }: { rows: OwnerFollowUp[]; busy: boolean; onMutate: StaffOpsMutate; onDetail: (item: OwnerFollowUp) => void }) {
  return (
    <div className="crossover-table-wrap hidden md:block">
      <table className="crossover-table">
        <thead><tr><th>Subject / Owner</th><th>Dog</th><th>Logged By</th><th>Assigned To</th><th>Priority</th><th>Due Date</th><th>Status</th><th className="crossover-table__actions-col">Actions</th></tr></thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td><p className="crossover-table__subject-title">{item.subject}</p><p className="crossover-table__muted">{item.owner_name}</p></td>
              <td>{item.dog_name ?? "N/A"}</td>
              <td>{item.logged_by ?? "Front Desk"}</td>
              <td className="crossover-table__emphasis">{item.assigned_to}</td>
              <td><Badge type="priority" value={item.priority} urgent={item.urgent} /></td>
              <td>{formatDateTime(item.due_date)}</td>
              <td><Badge type="status" value={item.status} /></td>
              <td>
                <OpsRowActions
                  busy={busy}
                  onDetail={() => onDetail(item)}
                  onResolve={() => void onMutate("Unable to resolve.", { action: "update_follow_up", id: item.id, status: "Resolved" }, "Follow up resolved.")}
                  menuItems={[
                    { label: "Reopen", onClick: () => void onMutate("Unable to reopen.", { action: "update_follow_up", id: item.id, status: "Open" }, "Follow up reopened.") },
                    { label: "Escalate", onClick: () => void onMutate("Unable to escalate.", { action: "update_follow_up", id: item.id, urgent: true, priority: item.priority === "Critical" ? "Critical" : "High" }, "Escalated to Active Issues.") },
                    { label: "Push to Whiteboard", onClick: () => void onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.follow_up_notes ?? item.owner_name, priority: item.priority }, "Pushed to Staff Whiteboard.") },
                    { label: "Archive", onClick: () => void onMutate("Unable to archive.", { action: "update_follow_up", id: item.id, status: "Archived" }, "Follow up archived.") }
                  ]}
                />
              </td>
            </tr>
          ))}
          {!rows.length ? <tr><td className="crossover-table__empty-row crossover-table__muted" colSpan={8}>No follow-ups found.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function FollowUpCard({ item, busy, onMutate, onDetail }: { item: OwnerFollowUp; busy: boolean; onMutate: StaffOpsMutate; onDetail: (item: OwnerFollowUp) => void }) {
  return (
    <article className="crossover-card crossover-card--sidebar">
      <p className="crossover-table__subject-title">{item.subject}</p>
      <p className="mt-1 text-sm text-admin-muted">Owner: {item.owner_name} • Dog: {item.dog_name ?? "N/A"}</p>
      <p className="mt-1 text-sm text-white">Assigned To: {item.assigned_to}</p>
      <div className="mt-3 flex flex-wrap gap-2"><Badge type="priority" value={item.priority} urgent={item.urgent} /><Badge type="status" value={item.status} /></div>
      <OpsRowActions
        className="mt-4"
        busy={busy}
        onDetail={() => onDetail(item)}
        onResolve={() => void onMutate("Unable to resolve.", { action: "update_follow_up", id: item.id, status: "Resolved" }, "Follow up resolved.")}
        menuItems={[
          { label: "Reopen", onClick: () => void onMutate("Unable to reopen.", { action: "update_follow_up", id: item.id, status: "Open" }, "Follow up reopened.") },
          { label: "Escalate", onClick: () => void onMutate("Unable to escalate.", { action: "update_follow_up", id: item.id, urgent: true, priority: "High" }, "Escalated to Active Issues.") },
          { label: "Push to Whiteboard", onClick: () => void onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.follow_up_notes ?? item.owner_name, priority: item.priority }, "Pushed to Staff Whiteboard.") },
          { label: "Archive", onClick: () => void onMutate("Unable to archive.", { action: "update_follow_up", id: item.id, status: "Archived" }, "Follow up archived.") }
        ]}
      />
    </article>
  );
}

function IssuesPage(props: {
  data: StaffOpsPayload | null; loading: boolean; busy: boolean; filters: Filters; setFilters: (filters: Filters) => void; page: number; setPage: (page: number) => void; recentActivity: StaffActivityLog[]; nowMs: number; staffOptions: string[]; onMutate: StaffOpsMutate; onRefresh: () => Promise<void>; onDetail: (item: ActiveIssue) => void; detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null; onCloseDetail: () => void;
}) {
  const [form, setForm] = useState<IssueForm>(emptyIssueForm);
  const rows = useMemo(() => (props.data?.active_issues ?? []).filter((item) => {
    if (props.filters.priority && item.priority !== props.filters.priority) return false;
    if (props.filters.status && item.status !== props.filters.status) return false;
    if (props.filters.assignedTo && item.assigned_to !== props.filters.assignedTo) return false;
    if (props.filters.urgentOnly && item.priority !== "High" && item.priority !== "Critical") return false;
    return includesQuery([item.title, item.notes, item.related_owner_name, item.related_dog_name, item.reported_by, item.assigned_to], props.filters.query);
  }), [props.data?.active_issues, props.filters]);
  const paged = paginate(rows, props.page);
  const autoReported = rows.filter((item) => item.source_table === "crossover_messages" || item.source_table === "owner_follow_ups");
  async function submit() {
    const ok = await props.onMutate("Unable to create issue.", { ...form, action: "create_issue" }, "Active issue created.");
    if (ok) setForm(emptyIssueForm);
  }
  return (
    <div className="crossover-dashboard crossover-dashboard__layout space-y-5">
      <PageHeader title="Active Issues" subtitle="Track urgent and active issues from front desk, crossover communications, and owner follow up." loading={props.loading} />
      <StatGrid cards={[
        { label: "Open Issues", value: rows.filter((item) => item.status !== "Resolved" && item.status !== "Archived").length, helper: "Need attention", icon: <AlertTriangle className="h-5 w-5" /> },
        { label: "Auto-Logged Urgent", value: autoReported.length, helper: "Pulled from urgent logs", icon: <BellRing className="h-5 w-5" /> },
        { label: "Assigned Today", value: rows.filter((item) => isToday(item.created_at) && item.assigned_to).length, helper: "Requires follow up", icon: <UserRound className="h-5 w-5" /> },
        { label: "Critical", value: rows.filter((item) => item.priority === "Critical").length, helper: "Immediate action", icon: <ShieldAlert className="h-5 w-5" /> }
      ]} />
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="crossover-card crossover-card--conversations">
            <div className="crossover-card__header">
              <div>
                <h3 className="crossover-card__title">Active Issues Queue</h3>
                <p className="crossover-card__subtitle">Track and manage active issues across sources and teams.</p>
              </div>
              <button className="crossover-btn crossover-btn--outline" type="button" onClick={() => void props.onRefresh()}>Refresh</button>
            </div>
            <div className="border-b border-[rgba(255,166,0,0.12)] px-5 pb-5">
              <FilterBar filters={props.filters} setFilters={props.setFilters} type="issues" staffOptions={props.staffOptions} />
            </div>
            <DesktopIssuesTable rows={paged.rows} busy={props.busy} onMutate={props.onMutate} onDetail={props.onDetail} />
            <MobileCards rows={paged.rows} render={(item) => <IssueCard item={item} busy={props.busy} onMutate={props.onMutate} onDetail={props.onDetail} />} />
            <Pager page={paged.page} maxPage={paged.maxPage} total={rows.length} onPage={props.setPage} />
          </section>
          <EscalationsSection items={rows} />
        </div>
        <div className="space-y-5"><AutoReportedPanel items={autoReported} onOpen={props.onDetail} /><IssueFormCard form={form} setForm={setForm} busy={props.busy} staffOptions={props.staffOptions} onSubmit={submit} /></div>
      </section>
      <DetailModal data={props.data} detail={props.detail} busy={props.busy} staffOptions={props.staffOptions} onMutate={props.onMutate} onClose={props.onCloseDetail} />
    </div>
  );
}

function DesktopIssuesTable({ rows, busy, onMutate, onDetail }: { rows: ActiveIssue[]; busy: boolean; onMutate: StaffOpsMutate; onDetail: (item: ActiveIssue) => void }) {
  return (
    <div className="crossover-table-wrap hidden md:block">
      <table className="crossover-table">
        <thead><tr><th>Issue / Subject</th><th>Category</th><th>Source</th><th>Reported By</th><th>Assigned To</th><th>Priority</th><th>Reported</th><th>Status</th><th className="crossover-table__actions-col">Actions</th></tr></thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td><p className="crossover-table__subject-title">{item.title}</p><p className="crossover-table__subject-preview">{item.notes}</p></td>
              <td>{item.category}</td>
              <td>{item.source}</td>
              <td>{item.reported_by ?? "Front Desk"}</td>
              <td className="crossover-table__emphasis">{item.assigned_to ?? "Unassigned"}</td>
              <td><Badge type="priority" value={item.priority} /></td>
              <td>{formatDateTime(item.reported_at)}</td>
              <td><Badge type="status" value={item.status} /></td>
              <td>
                <OpsRowActions
                  busy={busy}
                  onDetail={() => onDetail(item)}
                  onResolve={() => void onMutate("Unable to resolve.", { action: "update_issue", id: item.id, status: "Resolved" }, "Issue resolved.")}
                  menuItems={[
                    { label: "Reopen", onClick: () => void onMutate("Unable to reopen.", { action: "update_issue", id: item.id, status: "Open" }, "Issue reopened.") },
                    { label: "Escalate", onClick: () => void onMutate("Unable to update priority.", { action: "update_issue", id: item.id, priority: "Critical" }, "Issue marked critical.") },
                    { label: "Push to Whiteboard", onClick: () => void onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.title, message: item.notes ?? item.category, priority: item.priority }, "Pushed to Staff Whiteboard.") },
                    { label: "Archive", onClick: () => void onMutate("Unable to archive.", { action: "update_issue", id: item.id, status: "Archived" }, "Issue archived.") }
                  ]}
                />
              </td>
            </tr>
          ))}
          {!rows.length ? <tr><td className="crossover-table__empty-row crossover-table__muted" colSpan={9}>No active issues found.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function IssueCard({ item, busy, onMutate, onDetail }: { item: ActiveIssue; busy: boolean; onMutate: StaffOpsMutate; onDetail: (item: ActiveIssue) => void }) {
  return (
    <article className="crossover-card crossover-card--sidebar">
      <p className="crossover-table__subject-title">{item.title}</p>
      <p className="mt-1 text-sm text-admin-muted">{item.category} • {item.source}</p>
      <p className="mt-1 text-sm text-white">Assigned To: {item.assigned_to ?? "Unassigned"}</p>
      <div className="mt-3 flex flex-wrap gap-2"><Badge type="priority" value={item.priority} /><Badge type="status" value={item.status} /></div>
      <OpsRowActions
        className="mt-4"
        busy={busy}
        onDetail={() => onDetail(item)}
        onResolve={() => void onMutate("Unable to resolve.", { action: "update_issue", id: item.id, status: "Resolved" }, "Issue resolved.")}
        menuItems={[
          { label: "Reopen", onClick: () => void onMutate("Unable to reopen.", { action: "update_issue", id: item.id, status: "Open" }, "Issue reopened.") },
          { label: "Escalate", onClick: () => void onMutate("Unable to update priority.", { action: "update_issue", id: item.id, priority: "Critical" }, "Issue marked critical.") },
          { label: "Push to Whiteboard", onClick: () => void onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.title, message: item.notes ?? item.category, priority: item.priority }, "Pushed to Staff Whiteboard.") },
          { label: "Archive", onClick: () => void onMutate("Unable to archive.", { action: "update_issue", id: item.id, status: "Archived" }, "Issue archived.") }
        ]}
      />
    </article>
  );
}

function MobileCards<T>({ rows, render }: { rows: T[]; render: (item: T) => React.ReactNode }) {
  return <div className="grid gap-3 p-4 md:hidden">{rows.length ? rows.map((item, index) => <div key={index}>{render(item)}</div>) : <p className="crossover-card crossover-card--sidebar p-4 text-center text-admin-muted">No records found.</p>}</div>;
}

function Badge({ type, value, urgent }: { type: "priority" | "status"; value: StaffOpsPriority | StaffOpsStatus; urgent?: boolean }) {
  if (type === "priority" && urgent) return <span className="crossover-badge crossover-badge--urgent">URGENT</span>;
  const label = typeof value === "string" ? value.toUpperCase() : value;
  return <span className={type === "priority" ? priorityClass(value as StaffOpsPriority) : statusClass(value as StaffOpsStatus)}>{label}</span>;
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-wide text-admin-muted">{label}{required ? " *" : ""}</span>{children}</label>;
}

function FollowUpFormCard({ form, setForm, busy, staffOptions, onSubmit }: { form: FollowUpForm; setForm: (form: FollowUpForm) => void; busy: boolean; staffOptions: string[]; onSubmit: () => Promise<void> }) {
  return (
    <section className="crossover-card crossover-card--create crossover-card--sidebar">
      <h3 className="crossover-card__title">Quick Log</h3>
      <p className="crossover-card__subtitle mb-4">Create a new follow-up item.</p>
      <div className="grid gap-4">
        <Field label="Owner / Subject" required><input className="crossover-input" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value, owner_name: event.target.value })} /></Field>
        <Field label="Dog"><input className="crossover-input" value={form.dog_name} onChange={(event) => setForm({ ...form, dog_name: event.target.value })} /></Field>
        <SelectField label="Assigned To" value={form.assigned_to} options={["", ...staffOptions]} onChange={(value) => setForm({ ...form, assigned_to: value })} />
        <div className="grid gap-4 md:grid-cols-2"><PrioritySelect value={form.priority} onChange={(priority) => setForm({ ...form, priority })} /><Field label="Due Date"><input className="crossover-input" type="datetime-local" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></Field></div>
        <Field label="Follow-up Notes"><textarea className="crossover-input crossover-textarea min-h-[96px]" value={form.follow_up_notes} onChange={(event) => setForm({ ...form, follow_up_notes: event.target.value })} /></Field>
        <label className="admin-toggle-row"><span className="text-sm font-bold text-white">Urgent</span><button type="button" role="switch" aria-checked={form.urgent} className={`admin-toggle ${form.urgent ? "admin-toggle--on" : ""}`} onClick={() => setForm({ ...form, urgent: !form.urgent })}><span className="admin-toggle__knob" /></button></label>
        <button type="button" className="crossover-btn crossover-btn--primary crossover-btn--full inline-flex items-center justify-center gap-2" disabled={busy} onClick={() => void onSubmit()}><Send className="h-4 w-4" /> Create Follow Up</button>
      </div>
    </section>
  );
}

function IssueFormCard({ form, setForm, busy, staffOptions, onSubmit }: { form: IssueForm; setForm: (form: IssueForm) => void; busy: boolean; staffOptions: string[]; onSubmit: () => Promise<void> }) {
  return (
    <section className="crossover-card crossover-card--create crossover-card--sidebar">
      <h3 className="crossover-card__title">Log New Issue</h3>
      <p className="crossover-card__subtitle mb-4">Create a new front desk or operations issue.</p>
      <div className="grid gap-4">
        <Field label="Issue Title" required><input className="crossover-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
        <div className="grid gap-4 md:grid-cols-2"><SelectField label="Category" value={form.category} options={ISSUE_CATEGORIES} onChange={(value) => setForm({ ...form, category: value as IssueCategory })} /><SelectField label="Source" value={form.source} options={ISSUE_SOURCES} onChange={(value) => setForm({ ...form, source: value as IssueSource })} /></div>
        <SelectField label="Assigned To" value={form.assigned_to} options={["", ...staffOptions]} onChange={(value) => setForm({ ...form, assigned_to: value })} />
        <PrioritySelect value={form.priority} onChange={(priority) => setForm({ ...form, priority })} />
        <Field label="Notes"><textarea className="crossover-input crossover-textarea min-h-[96px]" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        <div className="grid gap-4 md:grid-cols-3"><Field label="Owner"><input className="crossover-input" value={form.related_owner_name} onChange={(event) => setForm({ ...form, related_owner_name: event.target.value })} /></Field><Field label="Dog"><input className="crossover-input" value={form.related_dog_name} onChange={(event) => setForm({ ...form, related_dog_name: event.target.value })} /></Field><Field label="Due Date"><input className="crossover-input" type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></Field></div>
        <button type="button" className="crossover-btn crossover-btn--primary crossover-btn--full inline-flex items-center justify-center gap-2" disabled={busy} onClick={() => void onSubmit()}><Send className="h-4 w-4" /> Create Issue</button>
      </div>
    </section>
  );
}

function PrioritySelect({ value, onChange }: { value: StaffOpsPriority; onChange: (value: StaffOpsPriority) => void }) {
  return <SelectField label="Priority" value={value} options={STAFF_PRIORITIES} onChange={(next) => onChange(next as StaffOpsPriority)} />;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <Field label={label}><select className="crossover-input crossover-select" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option || "blank"} value={option}>{option || "Select"}</option>)}</select></Field>;
}

function TemplatesPanel({ onPick }: { onPick: (template: { title: string; message: string }) => void }) {
  return (
    <section className="crossover-card crossover-card--sidebar">
      <div className="crossover-card__header crossover-card__header--compact">
        <h3 className="crossover-card__title">Communication Templates</h3>
        <button type="button" className="crossover-link-btn">View all</button>
      </div>
      <div className="grid gap-2">{CROSSOVER_TEMPLATES.map((template) => <button key={template.title} type="button" className="crossover-template-row" onClick={() => onPick(template)}><span>{template.title}</span><Pencil className="h-4 w-4 text-admin-muted" /></button>)}</div>
    </section>
  );
}

function RecentActivityPanel({ items }: { items: StaffActivityLog[] }) {
  return (
    <section className="crossover-card crossover-card--sidebar">
      <div className="crossover-card__header crossover-card__header--compact">
        <h3 className="crossover-card__title">Recent Activity</h3>
        <button type="button" className="crossover-link-btn">View all</button>
      </div>
      <div className="grid gap-3">{items.slice(0, 6).map((item) => (
        <article key={item.id} className="crossover-activity-row">
          <p className="crossover-activity-row__title">{item.title}</p>
          <p className="crossover-activity-row__meta">{item.created_by ?? "Admin"} • {formatDateTime(item.created_at)}</p>
        </article>
      ))}{!items.length ? <p className="text-sm text-admin-muted">No recent activity yet.</p> : null}</div>
    </section>
  );
}

function AutoReportedPanel({ items, onOpen }: { items: ActiveIssue[]; onOpen: (item: ActiveIssue) => void }) {
  return <section className="admin-card p-5"><h3 className="text-lg font-black text-white">Auto-Reported Urgent Items</h3><p className="mb-4 text-sm text-admin-muted">Urgent items marked in Crossover Communication and Owner Follow Up are automatically added here.</p><div className="grid gap-3">{items.slice(0, 5).map((item) => <button key={item.id} type="button" className="rounded-xl border border-admin-border bg-white/[0.03] p-3 text-left hover:border-fitdog-orange/50" onClick={() => onOpen(item)}><p className="text-xs text-fitdog-orange">{item.source}</p><p className="font-bold text-white">{item.title}</p><p className="text-xs text-admin-muted">{formatDateTime(item.reported_at)} • {item.priority}</p></button>)}{!items.length ? <p className="text-sm text-admin-muted">No auto-reported urgent items.</p> : null}</div></section>;
}

function EscalationsSection({ items }: { items: ActiveIssue[] }) {
  const urgent = items.filter((item) => item.priority === "High" || item.priority === "Critical").slice(0, 4);
  return <section className="admin-card p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-xl font-black text-white">Escalations & Follow-Up</h3><p className="text-sm text-admin-muted">High priority issues that require immediate action and follow-up.</p></div><span className="text-xs text-fitdog-orange">View all escalations</span></div><div className="grid gap-3 md:grid-cols-2">{urgent.map((item) => <article key={item.id} className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4"><Badge type="priority" value={item.priority} /><h4 className="mt-3 font-black text-white">{item.title}</h4><p className="mt-1 text-sm text-admin-muted">{item.notes}</p><p className="mt-3 text-xs text-admin-muted">Assigned to {item.assigned_to ?? "Unassigned"} • Due {formatDateTime(item.due_at)}</p></article>)}{!urgent.length ? <p className="text-sm text-admin-muted">No high priority escalations.</p> : null}</div></section>;
}

function UpcomingSection({ items }: { items: OwnerFollowUp[] }) {
  const upcoming = items.filter((item) => item.status !== "Resolved" && item.status !== "Archived").slice(0, 4);
  return <section className="admin-card p-5"><h3 className="text-xl font-black text-white">Upcoming Follow Ups / Escalations</h3><p className="mb-4 text-sm text-admin-muted">Items approaching due dates or requiring escalation.</p><div className="grid gap-3 md:grid-cols-2">{upcoming.map((item) => <article key={item.id} className="rounded-2xl border border-admin-border bg-white/[0.03] p-4"><Badge type="priority" value={item.priority} /><h4 className="mt-3 font-black text-white">{item.subject}</h4><p className="mt-1 text-sm text-admin-muted">Owner: {item.owner_name}</p><p className="mt-3 text-xs text-admin-muted">Assigned to {item.assigned_to} • Due {formatDateTime(item.due_date)}</p></article>)}{!upcoming.length ? <p className="text-sm text-admin-muted">No upcoming follow-ups.</p> : null}</div></section>;
}

function DetailModal({ data, detail, busy, staffOptions, onMutate, onClose }: { data: StaffOpsPayload | null; detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null; busy: boolean; staffOptions: string[]; onMutate: StaffOpsMutate; onClose: () => void }) {
  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReply("");
      setResolution("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [detail?.item.id]);
  if (!detail) return null;
  const item = resolveDetailItem(data, detail) ?? detail.item;
  const title = "subject" in item ? item.subject : item.title;
  const description =
    "message" in item
      ? displayCrossoverMessage(item as CrossoverMessage)
      : "follow_up_notes" in item
        ? item.follow_up_notes
        : item.notes;
  const replies = detail.type === "crossover" ? (data?.crossover_message_replies ?? []).filter((entry) => entry.crossover_message_id === item.id) : [];
  const resolveStatus =
    detail.type === "crossover" ? resolveStatusForShiftLog(item as CrossoverMessage) : ("Resolved" as const);
  const resolveLabel =
    detail.type === "crossover" && isAssessmentDogLog(item as CrossoverMessage) ? "Check Out" : "Resolve";
  const updateAction =
    detail.type === "crossover" ? "update_crossover" : detail.type === "follow_up" ? "update_follow_up" : "update_issue";

  async function saveAndClose(label: string, payload: Record<string, unknown>, success: string) {
    const ok = await onMutate(label, payload, success);
    if (ok) onClose();
  }

  return (
    <Modal
      open={Boolean(detail)}
      title={title}
      description="View details and update this record without leaving the page."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button className="admin-btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="admin-btn-secondary"
            type="button"
            disabled={busy}
            onClick={() => void saveAndClose("Unable to mark in progress.", { action: updateAction, id: item.id, status: "In Progress" }, "Marked in progress.")}
          >
            Mark In Progress
          </button>
          <button
            className="admin-btn-secondary"
            type="button"
            disabled={busy}
            onClick={() => void saveAndClose("Unable to mark pending review.", { action: updateAction, id: item.id, status: "Pending Review" }, "Marked pending review.")}
          >
            Pending Review
          </button>
          <button
            className="admin-btn-primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void saveAndClose(
                resolveStatus === "Check Out" ? "Unable to check out." : "Unable to resolve.",
                { action: updateAction, id: item.id, status: resolveStatus, resolution_notes: resolution },
                resolveStatus === "Check Out" ? "Assessment marked Check Out." : "Record resolved."
              )
            }
          >
            {resolveLabel}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        {detail.type === "crossover" && "subject" in item ? (
          <div className="grid gap-2 rounded-2xl border border-admin-border bg-white/[0.03] p-4 text-sm text-admin-muted md:grid-cols-2">
            <p><span className="font-bold text-white">Log type:</span> {shiftLogType(item as CrossoverMessage)}</p>
            <p><span className="font-bold text-white">Submitted by:</span> {shiftLogSubmittedBy(item as CrossoverMessage)}</p>
            <p><span className="font-bold text-white">Submitted:</span> {formatDateTime(item.created_at)}</p>
            <p><span className="font-bold text-white">Assigned to:</span> {(item as CrossoverMessage).assigned_to ?? (item as CrossoverMessage).assigned_team ?? "Unassigned"}</p>
            {(item as CrossoverMessage).related_dog_name ? <p><span className="font-bold text-white">Dog:</span> {(item as CrossoverMessage).related_dog_name}</p> : null}
            {(item as CrossoverMessage).related_owner_name ? <p><span className="font-bold text-white">Owner:</span> {(item as CrossoverMessage).related_owner_name}</p> : null}
            {(item as CrossoverMessage).due_at ? <p><span className="font-bold text-white">Due:</span> {formatDateTime((item as CrossoverMessage).due_at ?? null)}</p> : null}
            {(item as CrossoverMessage).reminder_at ? <p><span className="font-bold text-white">Reminder:</span> {formatDateTime((item as CrossoverMessage).reminder_at ?? null)}</p> : null}
            {(item as CrossoverMessage).linked_owner_follow_up_id ? <p><span className="font-bold text-white">Linked Owner Follow Up:</span> Yes</p> : null}
            {(item as CrossoverMessage).linked_active_issue_id ? <p><span className="font-bold text-white">Linked Active Issue:</span> Yes</p> : null}
          </div>
        ) : null}
        <div className="rounded-2xl border border-admin-border bg-white/[0.03] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge type="priority" value={item.priority} />
            <Badge type="status" value={item.status} />
          </div>
          <p className="whitespace-pre-wrap text-sm text-admin-muted">{description || "No notes provided."}</p>
        </div>
        {"assigned_to" in item ? (
          <SelectField
            label="Assign / Reassign"
            value={item.assigned_to ?? ""}
            options={["", ...staffOptions]}
            onChange={(value) => void saveAndClose("Unable to assign.", { action: updateAction, id: item.id, assigned_to: value }, "Assignment updated.")}
          />
        ) : null}
        <PrioritySelect
          value={item.priority}
          onChange={(priority) => void saveAndClose("Unable to change priority.", { action: updateAction, id: item.id, priority }, "Priority updated.")}
        />
        {detail.type === "crossover" ? (
          <div className="grid gap-3">
            <h4 className="font-bold text-white">Updates / Internal Notes</h4>
            {replies.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-admin-border p-3 text-sm text-admin-muted">
                <p className="text-xs font-semibold uppercase tracking-wide text-fitdog-orange">{entry.update_type ?? "Internal Note"}</p>
                <p className="mt-1 text-white">{entry.message}</p>
                <p className="mt-1 text-xs">{entry.created_by ?? "Staff"} • {formatDateTime(entry.created_at)}</p>
              </div>
            ))}
            <textarea
              className="admin-input min-h-[80px]"
              placeholder="Add an update or internal note..."
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
            <button
              className="admin-btn-primary justify-self-end"
              type="button"
              disabled={busy || !reply.trim()}
              onClick={() =>
                void (async () => {
                  const ok = await onMutate(
                    "Unable to add update.",
                    { action: "reply_crossover", id: item.id, message: reply, update_type: "Internal Note" },
                    "Update added."
                  );
                  if (ok) {
                    setReply("");
                    onClose();
                  }
                })()
              }
            >
              Add Update
            </button>
          </div>
        ) : null}
        {detail.type === "issues" ? (
          <Field label="Resolution notes">
            <textarea className="admin-input min-h-[80px]" value={resolution} onChange={(event) => setResolution(event.target.value)} />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

function resolveDetailItem(data: StaffOpsPayload | null, detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue }) {
  if (!data) return null;
  if (detail.type === "crossover") return data.crossover_messages.find((item) => item.id === detail.item.id) ?? null;
  if (detail.type === "follow_up") return data.owner_follow_ups.find((item) => item.id === detail.item.id) ?? null;
  return data.active_issues.find((item) => item.id === detail.item.id) ?? null;
}
