"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BellRing,
  CheckCircle2,
  Eye,
  MessageSquare,
  Pencil,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UserRound
} from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
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
  buildMessageFromTemplate,
  extractCustomPlaceholdersFromEdit,
  findCrossoverTemplate,
  getTemplateFields,
  hasBracketPlaceholders,
  legacyFieldValuesFromMessage,
  messageMatchesTemplateStructure,
  resolveCrossoverMessage,
  type CrossoverTemplateField
} from "@/lib/staff/crossover-templates";

type StaffOpsTab = "crossover" | "follow_up" | "issues";

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

type CrossoverForm = {
  subject: string;
  message: string;
  active_template: string | null;
  template_title: string | null;
  custom_placeholders: Record<string, string>;
  field_values: Record<string, string>;
  from_department: string;
  to_department: string;
  priority: StaffOpsPriority;
  assigned_to: string;
  reported_to: string;
  urgent: boolean;
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

const emptyCrossoverForm: CrossoverForm = {
  subject: "",
  message: "",
  active_template: null,
  template_title: null,
  custom_placeholders: {},
  field_values: {},
  from_department: "Front Desk",
  to_department: "Daycare",
  priority: "Normal",
  assigned_to: "",
  reported_to: "",
  urgent: false
};

function crossoverContextFromForm(form: CrossoverForm) {
  return { toDepartment: form.to_department, fromDepartment: form.from_department };
}

function resolveCrossoverFormMessage(form: CrossoverForm): CrossoverForm {
  const template = form.active_template ?? findCrossoverTemplate(form.message, form.subject)?.message ?? null;
  const templateTitle = form.template_title ?? findCrossoverTemplate(form.message, form.subject)?.title ?? null;
  if (!template && !hasBracketPlaceholders(form.message)) return form;
  const source = template ?? form.message;
  return {
    ...form,
    active_template: template ?? form.active_template,
    template_title: templateTitle ?? form.template_title,
    message: buildMessageFromTemplate(source, templateTitle, form.field_values, crossoverContextFromForm(form), form.custom_placeholders)
  };
}

function patchCrossoverForm(form: CrossoverForm, patch: Partial<CrossoverForm>, options?: { manualMessage?: string }): CrossoverForm {
  const next = { ...form, ...patch };
  if (options?.manualMessage !== undefined) {
    next.message = options.manualMessage;
    const template = next.active_template ?? findCrossoverTemplate(options.manualMessage, next.subject)?.message ?? null;
    const templateTitle = next.template_title ?? findCrossoverTemplate(options.manualMessage, next.subject)?.title ?? null;
    if (template) {
      next.active_template = template;
      next.template_title = templateTitle;
      if (!messageMatchesTemplateStructure(template, options.manualMessage)) {
        return { ...next, active_template: null, template_title: null, custom_placeholders: {} };
      }
      next.custom_placeholders = extractCustomPlaceholdersFromEdit(
        template,
        options.manualMessage,
        templateTitle,
        next.field_values,
        crossoverContextFromForm(next)
      );
      return next;
    }
    if (hasBracketPlaceholders(options.manualMessage)) {
      return { ...next, active_template: null, template_title: null };
    }
    return next;
  }
  return resolveCrossoverFormMessage(next);
}

function patchCrossoverFieldValue(form: CrossoverForm, key: string, value: string, field?: CrossoverTemplateField): Partial<CrossoverForm> {
  const field_values = { ...form.field_values, [key]: value };
  const patch: Partial<CrossoverForm> = { field_values };
  if (field?.type === "department" && value) {
    patch.to_department = value;
  }
  if (field?.type === "staff" && value) {
    patch.assigned_to = value;
  }
  return patch;
}

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
  if (!value || status === "Resolved" || status === "Archived") return false;
  return new Date(value).getTime() < nowMs;
}

function priorityClass(priority: StaffOpsPriority) {
  if (priority === "Critical") return "admin-badge admin-badge--amber border-red-400/40 bg-red-500/20 text-red-100";
  if (priority === "High") return "admin-badge admin-badge--amber";
  if (priority === "Medium") return "admin-badge";
  if (priority === "Low") return "admin-badge admin-badge--green";
  return "admin-badge";
}

function statusClass(status: StaffOpsStatus) {
  if (status === "Resolved") return "admin-badge admin-badge--green";
  if (status === "Archived") return "admin-badge opacity-60";
  if (status === "Pending Review") return "admin-badge admin-badge--amber";
  if (status === "In Progress") return "admin-badge";
  return "admin-badge border-blue-300/30 bg-blue-500/10 text-blue-200";
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
  const templateTitle = item.template_title ?? findCrossoverTemplate(item.message, item.subject)?.title ?? null;
  const fieldValues = legacyFieldValuesFromMessage(item);
  return resolveCrossoverMessage(item.message, templateTitle, fieldValues, {
    toDepartment: item.to_department,
    fromDepartment: item.from_department
  });
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load Staff Admin records.");
      setData(body as StaffOpsPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load Staff Admin records.", "error");
    } finally {
      setLoading(false);
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

  async function mutate(label: string, payload: Record<string, unknown>, success: string) {
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
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : label, "error");
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
        filters={filters}
        setFilters={setFilters}
        page={page}
        setPage={setPage}
        recentActivity={recentActivity}
        nowMs={nowMs}
        staffOptions={staffOptions}
        onMutate={mutate}
        onRefresh={load}
        onDetail={(item) => setDetail({ type: "crossover", item })}
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
    <header className="admin-page-header">
      <div>
        <h2 className="admin-page-title">{title}</h2>
        <p className="admin-page-subtitle">{subtitle}</p>
      </div>
      {loading ? <span className="admin-badge">Loading...</span> : null}
    </header>
  );
}

function StatGrid({ cards }: { cards: Array<{ label: string; value: string | number; helper: string; icon: React.ReactNode }> }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="admin-card flex items-center gap-4 p-4">
          <div className="inline-grid h-11 w-11 place-items-center rounded-full bg-fitdog-orange/20 text-fitdog-orange">{card.icon}</div>
          <div>
            <p className="text-2xl font-black text-white">{card.value}</p>
            <p className="text-sm font-bold text-white">{card.label}</p>
            <p className="text-xs text-admin-muted">{card.helper}</p>
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
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(4,160px)]">
      <label className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
        <input
          className="admin-input pl-9"
          placeholder={type === "crossover" ? "Search conversations..." : type === "follow_up" ? "Search follow-ups..." : "Search issues..."}
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
      </label>
      <select className="admin-input" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
        <option value="">All priorities</option>
        {STAFF_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </select>
      <select className="admin-input" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
        <option value="">All statuses</option>
        {STAFF_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <select className="admin-input" value={type === "crossover" ? filters.department : filters.assignedTo} onChange={(event) => setFilters(type === "crossover" ? { ...filters, department: event.target.value } : { ...filters, assignedTo: event.target.value })}>
        <option value="">{type === "crossover" ? "All departments" : "All assignees"}</option>
        {(type === "crossover" ? STAFF_DEPARTMENTS : staffOptions).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <label className="flex items-center gap-2 rounded-xl border border-admin-border bg-white/[0.03] px-3 text-sm text-admin-muted">
        <input type="checkbox" checked={filters.urgentOnly} onChange={(event) => setFilters({ ...filters, urgentOnly: event.target.checked })} />
        Urgent only
      </label>
    </div>
  );
}

function Pager({ page, maxPage, total, onPage }: { page: number; maxPage: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-admin-border px-4 py-3 text-sm text-admin-muted">
      <span>Showing page {page} of {maxPage} • {total} total</span>
      <div className="flex gap-2">
        <button className="admin-btn-secondary" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
        <button className="admin-btn-secondary" type="button" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function CrossoverPage(props: {
  data: StaffOpsPayload | null;
  loading: boolean;
  busy: boolean;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  page: number;
  setPage: (page: number) => void;
  recentActivity: StaffActivityLog[];
  nowMs: number;
  staffOptions: string[];
  onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDetail: (item: CrossoverMessage) => void;
  detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null;
  onCloseDetail: () => void;
}) {
  const [form, setForm] = useState<CrossoverForm>(emptyCrossoverForm);

  useEffect(() => {
    if (!props.data) return;
    const fromDepartment = homeDepartmentForUser(props.data.staff_directory, props.data.currentUser);
    setForm((current) => resolveCrossoverFormMessage({ ...current, from_department: fromDepartment }));
  }, [props.data?.currentUser.adminUserId, props.data?.currentUser.email, props.data?.currentUser.role, props.data?.staff_directory]);

  const patchForm = useCallback((patch: Partial<CrossoverForm>, options?: { manualMessage?: string }) => {
    setForm((current) => patchCrossoverForm(current, patch, options));
  }, []);

  const pickTemplate = useCallback((template: { title: string; message: string }) => {
    setForm((current) =>
      resolveCrossoverFormMessage({
        ...current,
        subject: template.title,
        template_title: template.title,
        active_template: template.message,
        field_values: {},
        custom_placeholders: {}
      })
    );
  }, []);

  const rows = useMemo(() => {
    return (props.data?.crossover_messages ?? []).filter((item) => {
      if (props.filters.priority && item.priority !== props.filters.priority) return false;
      if (props.filters.status && item.status !== props.filters.status) return false;
      if (props.filters.department && item.from_department !== props.filters.department && item.to_department !== props.filters.department) return false;
      if (props.filters.urgentOnly && !item.urgent && item.priority !== "High" && item.priority !== "Critical") return false;
      return includesQuery([item.subject, item.message, item.related_dog_name, item.traffic_weather_issue, item.created_by], props.filters.query);
    });
  }, [props.data?.crossover_messages, props.filters]);
  const paged = paginate(rows, props.page);
  const resolvedThisWeek = (props.data?.crossover_messages ?? []).filter((item) => item.status === "Resolved" && item.resolved_at && new Date(item.resolved_at).getTime() > props.nowMs - 7 * 86400000).length;

  async function submit() {
    const synced = resolveCrossoverFormMessage(form);
    const {
      active_template: _activeTemplate,
      template_title: _templateTitle,
      custom_placeholders: _customPlaceholders,
      ...payload
    } = synced;
    await props.onMutate(
      "Unable to send crossover message.",
      { ...payload, action: "create_crossover", template_title: synced.template_title, field_values: synced.field_values },
      "Crossover message sent."
    );
    const fromDepartment = props.data
      ? homeDepartmentForUser(props.data.staff_directory, props.data.currentUser)
      : emptyCrossoverForm.from_department;
    setForm({ ...emptyCrossoverForm, from_department: fromDepartment });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Crossover Communication"
        subtitle="Main staff communication log between departments. Every entry is timestamped with the sender and who it was reported to. Urgent or high-priority items trigger alerts with full message details."
        loading={props.loading}
      />
      <StatGrid cards={[
        { label: "Active Threads", value: rows.filter((item) => item.status !== "Resolved" && item.status !== "Archived").length, helper: "Require attention", icon: <MessageSquare className="h-5 w-5" /> },
        { label: "Messages Sent Today", value: (props.data?.crossover_messages ?? []).filter((item) => isToday(item.created_at)).length, helper: "Today", icon: <Send className="h-5 w-5" /> },
        { label: "Resolved This Week", value: resolvedThisWeek, helper: "This week", icon: <CheckCircle2 className="h-5 w-5" /> },
        { label: "Urgent / High Alerts", value: rows.filter((item) => item.urgent || item.priority === "High" || item.priority === "Critical").length, helper: "Active log entries", icon: <AlertTriangle className="h-5 w-5" /> }
      ]} />
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="admin-card overflow-hidden">
            <div className="space-y-4 border-b border-admin-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-white">Active Conversations</h3>
                  <p className="text-sm text-admin-muted">Ongoing crossover messages and updates.</p>
                </div>
                <button className="admin-btn-secondary" type="button" onClick={() => void props.onRefresh()}>Refresh</button>
              </div>
              <FilterBar filters={props.filters} setFilters={props.setFilters} type="crossover" staffOptions={props.staffOptions} />
            </div>
            <DesktopCrossoverTable rows={paged.rows} busy={props.busy} directory={props.data?.staff_directory} onMutate={props.onMutate} onDetail={props.onDetail} />
            <MobileCards rows={paged.rows} render={(item) => (
              <CrossoverCard item={item} busy={props.busy} directory={props.data?.staff_directory} onMutate={props.onMutate} onDetail={props.onDetail} />
            )} />
            <Pager page={paged.page} maxPage={paged.maxPage} total={rows.length} onPage={props.setPage} />
          </section>
          <CrossoverFormCard form={form} patchForm={patchForm} busy={props.busy} staffOptions={props.staffOptions} onSubmit={submit} />
        </div>
        <div className="space-y-5">
          <TemplatesPanel onPick={pickTemplate} />
          <RecentActivityPanel items={props.recentActivity} />
        </div>
      </section>
      <DetailModal data={props.data} detail={props.detail} busy={props.busy} staffOptions={props.staffOptions} onMutate={props.onMutate} onClose={props.onCloseDetail} />
    </div>
  );
}

function DesktopCrossoverTable({ rows, busy, directory, onMutate, onDetail }: { rows: CrossoverMessage[]; busy: boolean; directory?: StaffDirectoryMember[]; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onDetail: (item: CrossoverMessage) => void }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full divide-y divide-admin-border text-sm">
        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-admin-muted">
          <tr>
            <th className="px-4 py-3">Thread / Subject</th>
            <th className="px-4 py-3">From → To</th>
            <th className="px-4 py-3">Reported By</th>
            <th className="px-4 py-3">Reported To</th>
            <th className="px-4 py-3">Logged</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-admin-border">
          {rows.map((item) => (
            <tr key={item.id} className="text-admin-muted">
              <td className="max-w-xs px-4 py-3"><p className="font-bold text-white">{item.subject}</p><p className="truncate">{displayCrossoverMessage(item)}</p></td>
              <td className="px-4 py-3">{item.from_department} → {item.to_department}</td>
              <td className="px-4 py-3">{crossoverCreatedByLabel(directory, item.created_by)}</td>
              <td className="px-4 py-3 font-semibold text-white">{crossoverReportedTo(item)}</td>
              <td className="px-4 py-3">{formatDateTime(item.created_at)}</td>
              <td className="px-4 py-3"><Badge type="priority" value={item.priority} /></td>
              <td className="px-4 py-3"><Badge type="status" value={item.status} /></td>
              <td className="px-4 py-3"><RowActions busy={busy} onDetail={() => onDetail(item)} onResolve={() => onMutate("Unable to resolve.", { action: "update_crossover", id: item.id, status: "Resolved" }, "Conversation resolved.")} onReopen={() => onMutate("Unable to reopen.", { action: "update_crossover", id: item.id, status: "Active" }, "Conversation reopened.")} onArchive={() => onMutate("Unable to archive.", { action: "update_crossover", id: item.id, status: "Archived" }, "Conversation archived.")} onEscalate={() => onMutate("Unable to escalate.", { action: "update_crossover", id: item.id, urgent: true, priority: item.priority === "Critical" ? "Critical" : "High" }, "Escalated to Active Issues.")} onPush={() => onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.message, priority: item.priority }, "Pushed to Staff Whiteboard.")} /></td>
            </tr>
          ))}
          {!rows.length ? <tr><td className="px-4 py-8 text-center text-admin-muted" colSpan={8}>No conversations found.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function CrossoverCard({ item, busy, directory, onMutate, onDetail }: { item: CrossoverMessage; busy: boolean; directory?: StaffDirectoryMember[]; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onDetail: (item: CrossoverMessage) => void }) {
  return (
    <article className="rounded-2xl border border-admin-border bg-white/[0.03] p-4">
      <p className="font-bold text-white">{item.subject}</p>
      <p className="mt-1 text-sm text-admin-muted">{item.from_department} → {item.to_department}</p>
      <p className="mt-1 text-xs text-admin-muted">
        {crossoverCreatedByLabel(directory, item.created_by)} • {formatDateTime(item.created_at)} • Reported to {crossoverReportedTo(item)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2"><Badge type="priority" value={item.priority} /><Badge type="status" value={item.status} /></div>
      <p className="mt-3 text-sm text-admin-muted">{displayCrossoverMessage(item)}</p>
      <RowActions busy={busy} compact onDetail={() => onDetail(item)} onResolve={() => onMutate("Unable to resolve.", { action: "update_crossover", id: item.id, status: "Resolved" }, "Conversation resolved.")} onReopen={() => onMutate("Unable to reopen.", { action: "update_crossover", id: item.id, status: "Active" }, "Conversation reopened.")} onArchive={() => onMutate("Unable to archive.", { action: "update_crossover", id: item.id, status: "Archived" }, "Conversation archived.")} onEscalate={() => onMutate("Unable to escalate.", { action: "update_crossover", id: item.id, urgent: true, priority: "High" }, "Escalated to Active Issues.")} onPush={() => onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.message, priority: item.priority }, "Pushed to Staff Whiteboard.")} />
    </article>
  );
}

function FollowUpPage(props: {
  data: StaffOpsPayload | null; loading: boolean; busy: boolean; filters: Filters; setFilters: (filters: Filters) => void; page: number; setPage: (page: number) => void; recentActivity: StaffActivityLog[]; nowMs: number; staffOptions: string[]; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onRefresh: () => Promise<void>; onDetail: (item: OwnerFollowUp) => void; detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null; onCloseDetail: () => void;
}) {
  const [form, setForm] = useState<FollowUpForm>(emptyFollowUpForm);

  useEffect(() => {
    if (!props.data) return;
    const department = homeDepartmentForUser(props.data.staff_directory, props.data.currentUser);
    setForm((current) => ({ ...current, department }));
  }, [props.data?.currentUser.adminUserId, props.data?.currentUser.email, props.data?.currentUser.role, props.data?.staff_directory]);

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
    await props.onMutate("Unable to create follow up.", { ...form, action: "create_follow_up" }, "Follow up created.");
    setForm(emptyFollowUpForm);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Owner Follow Up" subtitle="Track owner issues, follow-up tasks, and management handoffs." loading={props.loading} />
      <StatGrid cards={[
        { label: "Open Items", value: rows.filter((item) => item.status !== "Resolved" && item.status !== "Archived").length, helper: "Need follow up", icon: <MessageSquare className="h-5 w-5" /> },
        { label: "Assigned Today", value: (props.data?.owner_follow_ups ?? []).filter((item) => isToday(item.created_at) && item.assigned_to).length, helper: "Coordination logged", icon: <UserRound className="h-5 w-5" /> },
        { label: "Overdue", value: (props.data?.owner_follow_ups ?? []).filter((item) => isOverdue(item.due_date, item.status, props.nowMs)).length, helper: "Requires attention", icon: <AlertTriangle className="h-5 w-5" /> },
        { label: "Resolved This Week", value: (props.data?.owner_follow_ups ?? []).filter((item) => item.resolved_at && new Date(item.resolved_at).getTime() > props.nowMs - 7 * 86400000).length, helper: "Great work", icon: <CheckCircle2 className="h-5 w-5" /> }
      ]} />
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="admin-card overflow-hidden">
            <div className="space-y-4 border-b border-admin-border p-5">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-xl font-black text-white">Owner Follow Up Queue</h3><p className="text-sm text-admin-muted">Track and manage owner follow-up items and next steps.</p></div><button className="admin-btn-secondary" type="button" onClick={() => void props.onRefresh()}>Refresh</button></div>
              <FilterBar filters={props.filters} setFilters={props.setFilters} type="follow_up" staffOptions={props.staffOptions} />
              <div className="flex flex-wrap gap-2 text-sm text-admin-muted"><label><input type="checkbox" checked={props.filters.overdueOnly} onChange={(event) => props.setFilters({ ...props.filters, overdueOnly: event.target.checked })} /> Overdue</label><label><input type="checkbox" checked={props.filters.dueTodayOnly} onChange={(event) => props.setFilters({ ...props.filters, dueTodayOnly: event.target.checked })} /> Due today</label></div>
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

function DesktopFollowUpTable({ rows, busy, onMutate, onDetail }: { rows: OwnerFollowUp[]; busy: boolean; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onDetail: (item: OwnerFollowUp) => void }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full divide-y divide-admin-border text-sm">
        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-admin-muted"><tr><th className="px-4 py-3">Subject / Owner</th><th className="px-4 py-3">Dog</th><th className="px-4 py-3">Logged By</th><th className="px-4 py-3">Assigned To</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Due Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-admin-border">
          {rows.map((item) => <tr key={item.id} className="text-admin-muted"><td className="px-4 py-3"><p className="font-bold text-white">{item.subject}</p><p>{item.owner_name}</p></td><td className="px-4 py-3">{item.dog_name ?? "N/A"}</td><td className="px-4 py-3">{item.logged_by ?? "Front Desk"}</td><td className="px-4 py-3 font-semibold text-white">{item.assigned_to}</td><td className="px-4 py-3"><Badge type="priority" value={item.priority} /></td><td className="px-4 py-3">{formatDateTime(item.due_date)}</td><td className="px-4 py-3"><Badge type="status" value={item.status} /></td><td className="px-4 py-3"><RowActions busy={busy} onDetail={() => onDetail(item)} onResolve={() => onMutate("Unable to resolve.", { action: "update_follow_up", id: item.id, status: "Resolved" }, "Follow up resolved.")} onReopen={() => onMutate("Unable to reopen.", { action: "update_follow_up", id: item.id, status: "Open" }, "Follow up reopened.")} onArchive={() => onMutate("Unable to archive.", { action: "update_follow_up", id: item.id, status: "Archived" }, "Follow up archived.")} onEscalate={() => onMutate("Unable to escalate.", { action: "update_follow_up", id: item.id, urgent: true, priority: item.priority === "Critical" ? "Critical" : "High" }, "Escalated to Active Issues.")} onPush={() => onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.follow_up_notes ?? item.owner_name, priority: item.priority }, "Pushed to Staff Whiteboard.")} /></td></tr>)}
          {!rows.length ? <tr><td className="px-4 py-8 text-center text-admin-muted" colSpan={8}>No follow-ups found.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function FollowUpCard({ item, busy, onMutate, onDetail }: { item: OwnerFollowUp; busy: boolean; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onDetail: (item: OwnerFollowUp) => void }) {
  return (
    <article className="rounded-2xl border border-admin-border bg-white/[0.03] p-4">
      <p className="font-bold text-white">{item.subject}</p><p className="mt-1 text-sm text-admin-muted">Owner: {item.owner_name} • Dog: {item.dog_name ?? "N/A"}</p><p className="mt-1 text-sm text-white">Assigned To: {item.assigned_to}</p>
      <div className="mt-3 flex flex-wrap gap-2"><Badge type="priority" value={item.priority} /><Badge type="status" value={item.status} /></div>
      <RowActions busy={busy} compact onDetail={() => onDetail(item)} onResolve={() => onMutate("Unable to resolve.", { action: "update_follow_up", id: item.id, status: "Resolved" }, "Follow up resolved.")} onReopen={() => onMutate("Unable to reopen.", { action: "update_follow_up", id: item.id, status: "Open" }, "Follow up reopened.")} onArchive={() => onMutate("Unable to archive.", { action: "update_follow_up", id: item.id, status: "Archived" }, "Follow up archived.")} onEscalate={() => onMutate("Unable to escalate.", { action: "update_follow_up", id: item.id, urgent: true, priority: "High" }, "Escalated to Active Issues.")} onPush={() => onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.subject, message: item.follow_up_notes ?? item.owner_name, priority: item.priority }, "Pushed to Staff Whiteboard.")} />
    </article>
  );
}

function IssuesPage(props: {
  data: StaffOpsPayload | null; loading: boolean; busy: boolean; filters: Filters; setFilters: (filters: Filters) => void; page: number; setPage: (page: number) => void; recentActivity: StaffActivityLog[]; nowMs: number; staffOptions: string[]; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onRefresh: () => Promise<void>; onDetail: (item: ActiveIssue) => void; detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null; onCloseDetail: () => void;
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
    await props.onMutate("Unable to create issue.", { ...form, action: "create_issue" }, "Active issue created.");
    setForm(emptyIssueForm);
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Active Issues" subtitle="Track urgent and active issues from front desk, crossover communications, and owner follow up." loading={props.loading} />
      <StatGrid cards={[
        { label: "Open Issues", value: rows.filter((item) => item.status !== "Resolved" && item.status !== "Archived").length, helper: "Need attention", icon: <AlertTriangle className="h-5 w-5" /> },
        { label: "Auto-Logged Urgent", value: autoReported.length, helper: "Pulled from urgent logs", icon: <BellRing className="h-5 w-5" /> },
        { label: "Assigned Today", value: rows.filter((item) => isToday(item.created_at) && item.assigned_to).length, helper: "Requires follow up", icon: <UserRound className="h-5 w-5" /> },
        { label: "Critical", value: rows.filter((item) => item.priority === "Critical").length, helper: "Immediate action", icon: <ShieldAlert className="h-5 w-5" /> }
      ]} />
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="admin-card overflow-hidden">
            <div className="space-y-4 border-b border-admin-border p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="text-xl font-black text-white">Active Issues Queue</h3><p className="text-sm text-admin-muted">Track and manage active issues across sources and teams.</p></div><button className="admin-btn-secondary" type="button" onClick={() => void props.onRefresh()}>Refresh</button></div><FilterBar filters={props.filters} setFilters={props.setFilters} type="issues" staffOptions={props.staffOptions} /></div>
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

function DesktopIssuesTable({ rows, busy, onMutate, onDetail }: { rows: ActiveIssue[]; busy: boolean; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onDetail: (item: ActiveIssue) => void }) {
  return (
    <div className="hidden overflow-x-auto md:block"><table className="min-w-full divide-y divide-admin-border text-sm"><thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-admin-muted"><tr><th className="px-4 py-3">Issue / Subject</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Reported By</th><th className="px-4 py-3">Assigned To</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Reported</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-admin-border">{rows.map((item) => <tr key={item.id} className="text-admin-muted"><td className="px-4 py-3"><p className="font-bold text-white">{item.title}</p><p className="truncate">{item.notes}</p></td><td className="px-4 py-3">{item.category}</td><td className="px-4 py-3">{item.source}</td><td className="px-4 py-3">{item.reported_by ?? "Front Desk"}</td><td className="px-4 py-3">{item.assigned_to ?? "Unassigned"}</td><td className="px-4 py-3"><Badge type="priority" value={item.priority} /></td><td className="px-4 py-3">{formatDateTime(item.reported_at)}</td><td className="px-4 py-3"><Badge type="status" value={item.status} /></td><td className="px-4 py-3"><RowActions busy={busy} onDetail={() => onDetail(item)} onResolve={() => onMutate("Unable to resolve.", { action: "update_issue", id: item.id, status: "Resolved" }, "Issue resolved.")} onReopen={() => onMutate("Unable to reopen.", { action: "update_issue", id: item.id, status: "Open" }, "Issue reopened.")} onArchive={() => onMutate("Unable to archive.", { action: "update_issue", id: item.id, status: "Archived" }, "Issue archived.")} onEscalate={() => onMutate("Unable to update priority.", { action: "update_issue", id: item.id, priority: "Critical" }, "Issue marked critical.")} onPush={() => onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.title, message: item.notes ?? item.category, priority: item.priority }, "Pushed to Staff Whiteboard.")} /></td></tr>)}{!rows.length ? <tr><td className="px-4 py-8 text-center text-admin-muted" colSpan={9}>No active issues found.</td></tr> : null}</tbody></table></div>
  );
}

function IssueCard({ item, busy, onMutate, onDetail }: { item: ActiveIssue; busy: boolean; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onDetail: (item: ActiveIssue) => void }) {
  return <article className="rounded-2xl border border-admin-border bg-white/[0.03] p-4"><p className="font-bold text-white">{item.title}</p><p className="mt-1 text-sm text-admin-muted">{item.category} • {item.source}</p><p className="mt-1 text-sm text-white">Assigned To: {item.assigned_to ?? "Unassigned"}</p><div className="mt-3 flex flex-wrap gap-2"><Badge type="priority" value={item.priority} /><Badge type="status" value={item.status} /></div><RowActions busy={busy} compact onDetail={() => onDetail(item)} onResolve={() => onMutate("Unable to resolve.", { action: "update_issue", id: item.id, status: "Resolved" }, "Issue resolved.")} onReopen={() => onMutate("Unable to reopen.", { action: "update_issue", id: item.id, status: "Open" }, "Issue reopened.")} onArchive={() => onMutate("Unable to archive.", { action: "update_issue", id: item.id, status: "Archived" }, "Issue archived.")} onEscalate={() => onMutate("Unable to update priority.", { action: "update_issue", id: item.id, priority: "Critical" }, "Issue marked critical.")} onPush={() => onMutate("Unable to push.", { action: "push_to_whiteboard", title: item.title, message: item.notes ?? item.category, priority: item.priority }, "Pushed to Staff Whiteboard.")} /></article>;
}

function MobileCards<T>({ rows, render }: { rows: T[]; render: (item: T) => React.ReactNode }) {
  return <div className="grid gap-3 p-4 md:hidden">{rows.length ? rows.map((item, index) => <div key={index}>{render(item)}</div>) : <p className="rounded-2xl border border-admin-border p-4 text-center text-admin-muted">No records found.</p>}</div>;
}

function RowActions({ busy, compact, onDetail, onResolve, onReopen, onArchive, onEscalate, onPush }: { busy: boolean; compact?: boolean; onDetail: () => void; onResolve: () => void; onReopen: () => void; onArchive: () => void; onEscalate: () => void; onPush: () => void }) {
  const className = compact ? "mt-4 flex flex-wrap gap-2" : "flex justify-end gap-1";
  return (
    <div className={className}>
      <button type="button" className="admin-icon-btn" disabled={busy} aria-label="View details" onClick={onDetail}><Eye className="h-4 w-4" /></button>
      <button type="button" className="admin-icon-btn" disabled={busy} aria-label="Mark resolved" onClick={onResolve}><CheckCircle2 className="h-4 w-4" /></button>
      <button type="button" className="admin-icon-btn" disabled={busy} aria-label="Reopen" onClick={onReopen}><RotateCcw className="h-4 w-4" /></button>
      <button type="button" className="admin-icon-btn" disabled={busy} aria-label="Escalate" onClick={onEscalate}><AlertTriangle className="h-4 w-4" /></button>
      <button type="button" className="admin-icon-btn" disabled={busy} aria-label="Push to staff whiteboard" onClick={onPush}><BellRing className="h-4 w-4" /></button>
      <button type="button" className="admin-icon-btn" disabled={busy} aria-label="Archive" onClick={onArchive}><Archive className="h-4 w-4" /></button>
    </div>
  );
}

function Badge({ type, value }: { type: "priority" | "status"; value: StaffOpsPriority | StaffOpsStatus }) {
  return <span className={type === "priority" ? priorityClass(value as StaffOpsPriority) : statusClass(value as StaffOpsStatus)}>{value}</span>;
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-wide text-admin-muted">{label}{required ? " *" : ""}</span>{children}</label>;
}

function CrossoverFormCard({
  form,
  patchForm,
  busy,
  staffOptions,
  onSubmit
}: {
  form: CrossoverForm;
  patchForm: (patch: Partial<CrossoverForm>, options?: { manualMessage?: string }) => void;
  busy: boolean;
  staffOptions: string[];
  onSubmit: () => Promise<void>;
}) {
  const templateFields = getTemplateFields(form.template_title);
  const hasTemplate = Boolean(form.template_title && templateFields.length);

  return (
    <section className="admin-card p-5">
      <h3 className="text-xl font-black text-white">Create New Crossover Message</h3>
      <p className="mb-4 text-sm text-admin-muted">
        Log handoffs in the main communication record. Timestamp, sender, and report-to are saved automatically. Urgent or high priority sends an alert with the full message.
      </p>
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField label="From" value={form.from_department} options={[...STAFF_DEPARTMENTS]} onChange={(value) => patchForm({ from_department: value })} />
          <SelectField label="To" value={form.to_department} options={[...STAFF_DEPARTMENTS]} onChange={(value) => patchForm({ to_department: value, reported_to: form.reported_to || value })} />
          <PrioritySelect value={form.priority} onChange={(priority) => patchForm({ priority })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Report To (Staff or Department)" value={form.reported_to} options={["", ...staffOptions, ...STAFF_DEPARTMENTS]} onChange={(value) => patchForm({ reported_to: value, assigned_to: staffOptions.includes(value) ? value : form.assigned_to })} />
          <SelectField label="Assign To (optional)" value={form.assigned_to} options={["", ...staffOptions]} onChange={(value) => patchForm({ assigned_to: value, reported_to: form.reported_to || value })} />
        </div>
        <Field label="Subject" required>
          <input className="admin-input" value={form.subject} onChange={(event) => patchForm({ subject: event.target.value })} />
        </Field>
        {hasTemplate ? (
          <div className="rounded-2xl border border-fitdog-orange/30 bg-fitdog-orange/5 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fitdog-orange">
              {form.template_title} — fill these in
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templateFields.map((field) => (
                <TemplateFieldInput
                  key={field.key}
                  field={field}
                  value={form.field_values[field.key] ?? (field.type === "department" ? form.to_department : "")}
                  staffOptions={staffOptions}
                  onChange={(value) => patchForm(patchCrossoverFieldValue(form, field.key, value, field))}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-admin-border px-4 py-3 text-sm text-admin-muted">
            Select a communication template to show smart fill fields for that topic.
          </p>
        )}
        <Field label="Message" required>
          <textarea
            className="admin-input min-h-[120px]"
            value={form.message}
            onChange={(event) => patchForm({}, { manualMessage: event.target.value })}
          />
        </Field>
        <label className="admin-toggle-row">
          <span className="text-sm font-bold text-white">Urgent Alert</span>
          <button type="button" role="switch" aria-checked={form.urgent} className={`admin-toggle ${form.urgent ? "admin-toggle--on" : ""}`} onClick={() => patchForm({ urgent: !form.urgent })}>
            <span className="admin-toggle__knob" />
          </button>
        </label>
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="admin-btn-secondary" disabled>
            Attach File
          </button>
          <button type="button" className="admin-btn-primary inline-flex items-center gap-2" disabled={busy} onClick={() => void onSubmit()}>
            <Send className="h-4 w-4" /> Send Message
          </button>
        </div>
        <p className="text-xs text-admin-muted">File upload is safely disabled until project storage is configured.</p>
      </div>
    </section>
  );
}

function TemplateFieldInput({
  field,
  value,
  staffOptions,
  onChange
}: {
  field: CrossoverTemplateField;
  value: string;
  staffOptions: string[];
  onChange: (value: string) => void;
}) {
  if (field.type === "select" && field.options?.length) {
    return (
      <SelectField
        label={field.label}
        value={value}
        options={["", ...field.options]}
        onChange={onChange}
      />
    );
  }
  if (field.type === "staff") {
    return <SelectField label={field.label} value={value} options={["", ...staffOptions]} onChange={onChange} />;
  }
  if (field.type === "department") {
    return <SelectField label={field.label} value={value} options={[...STAFF_DEPARTMENTS]} onChange={onChange} />;
  }
  return (
    <Field label={field.label}>
      <input
        className="admin-input"
        value={value}
        placeholder={field.hint}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function FollowUpFormCard({ form, setForm, busy, staffOptions, onSubmit }: { form: FollowUpForm; setForm: (form: FollowUpForm) => void; busy: boolean; staffOptions: string[]; onSubmit: () => Promise<void> }) {
  return <section className="admin-card p-5"><h3 className="text-xl font-black text-white">Quick Log</h3><p className="mb-4 text-sm text-admin-muted">Create a new follow-up item.</p><div className="grid gap-4"><Field label="Owner / Subject" required><input className="admin-input" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value, owner_name: event.target.value })} /></Field><Field label="Dog"><input className="admin-input" value={form.dog_name} onChange={(event) => setForm({ ...form, dog_name: event.target.value })} /></Field><SelectField label="Assigned To" value={form.assigned_to} options={["", ...staffOptions]} onChange={(value) => setForm({ ...form, assigned_to: value })} /><div className="grid gap-4 md:grid-cols-2"><PrioritySelect value={form.priority} onChange={(priority) => setForm({ ...form, priority })} /><Field label="Due Date"><input className="admin-input" type="datetime-local" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></Field></div><Field label="Follow-up Notes"><textarea className="admin-input min-h-[96px]" value={form.follow_up_notes} onChange={(event) => setForm({ ...form, follow_up_notes: event.target.value })} /></Field><label className="admin-toggle-row"><span className="text-sm font-bold text-white">Urgent</span><button type="button" role="switch" aria-checked={form.urgent} className={`admin-toggle ${form.urgent ? "admin-toggle--on" : ""}`} onClick={() => setForm({ ...form, urgent: !form.urgent })}><span className="admin-toggle__knob" /></button></label><button type="button" className="admin-btn-primary inline-flex items-center justify-center gap-2" disabled={busy} onClick={() => void onSubmit()}><Send className="h-4 w-4" /> Create Follow Up</button></div></section>;
}

function IssueFormCard({ form, setForm, busy, staffOptions, onSubmit }: { form: IssueForm; setForm: (form: IssueForm) => void; busy: boolean; staffOptions: string[]; onSubmit: () => Promise<void> }) {
  return <section className="admin-card p-5"><h3 className="text-xl font-black text-white">Log New Issue</h3><p className="mb-4 text-sm text-admin-muted">Create a new front desk or operations issue.</p><div className="grid gap-4"><Field label="Issue Title" required><input className="admin-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><div className="grid gap-4 md:grid-cols-2"><SelectField label="Category" value={form.category} options={ISSUE_CATEGORIES} onChange={(value) => setForm({ ...form, category: value as IssueCategory })} /><SelectField label="Source" value={form.source} options={ISSUE_SOURCES} onChange={(value) => setForm({ ...form, source: value as IssueSource })} /></div><SelectField label="Assigned To" value={form.assigned_to} options={["", ...staffOptions]} onChange={(value) => setForm({ ...form, assigned_to: value })} /><PrioritySelect value={form.priority} onChange={(priority) => setForm({ ...form, priority })} /><Field label="Notes"><textarea className="admin-input min-h-[96px]" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><div className="grid gap-4 md:grid-cols-3"><Field label="Owner"><input className="admin-input" value={form.related_owner_name} onChange={(event) => setForm({ ...form, related_owner_name: event.target.value })} /></Field><Field label="Dog"><input className="admin-input" value={form.related_dog_name} onChange={(event) => setForm({ ...form, related_dog_name: event.target.value })} /></Field><Field label="Due Date"><input className="admin-input" type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></Field></div><button type="button" className="admin-btn-primary inline-flex items-center justify-center gap-2" disabled={busy} onClick={() => void onSubmit()}><Send className="h-4 w-4" /> Create Issue</button></div></section>;
}

function PrioritySelect({ value, onChange }: { value: StaffOpsPriority; onChange: (value: StaffOpsPriority) => void }) {
  return <SelectField label="Priority" value={value} options={STAFF_PRIORITIES} onChange={(next) => onChange(next as StaffOpsPriority)} />;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <Field label={label}><select className="admin-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option || "blank"} value={option}>{option || "Select"}</option>)}</select></Field>;
}

function TemplatesPanel({ onPick }: { onPick: (template: { title: string; message: string }) => void }) {
  return <section className="admin-card p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black text-white">Communication Templates</h3><span className="text-xs text-fitdog-orange">View all</span></div><div className="grid gap-2">{CROSSOVER_TEMPLATES.map((template) => <button key={template.title} type="button" className="flex items-center justify-between rounded-xl border border-admin-border bg-white/[0.03] px-3 py-3 text-left text-sm text-white hover:border-fitdog-orange/50" onClick={() => onPick(template)}><span>{template.title}</span><Pencil className="h-4 w-4 text-admin-muted" /></button>)}</div></section>;
}

function RecentActivityPanel({ items }: { items: StaffActivityLog[] }) {
  return <section className="admin-card p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black text-white">Recent Activity</h3><span className="text-xs text-fitdog-orange">View all</span></div><div className="grid gap-3">{items.slice(0, 6).map((item) => <div key={item.id} className="flex gap-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><div><p className="font-semibold text-white">{item.title}</p><p className="text-xs text-admin-muted">{item.created_by ?? "Admin"} • {formatDateTime(item.created_at)}</p></div></div>)}{!items.length ? <p className="text-sm text-admin-muted">No recent activity yet.</p> : null}</div></section>;
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

function DetailModal({ data, detail, busy, staffOptions, onMutate, onClose }: { data: StaffOpsPayload | null; detail: { type: StaffOpsTab; item: CrossoverMessage | OwnerFollowUp | ActiveIssue } | null; busy: boolean; staffOptions: string[]; onMutate: (label: string, payload: Record<string, unknown>, success: string) => Promise<void>; onClose: () => void }) {
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
  return (
    <Modal open={Boolean(detail)} title={title} description="View details and update this record without leaving the page." onClose={onClose} footer={<div className="flex flex-wrap justify-end gap-2"><button className="admin-btn-secondary" type="button" onClick={onClose}>Close</button><button className="admin-btn-secondary" type="button" disabled={busy} onClick={() => void onMutate("Unable to mark in progress.", { action: detail.type === "crossover" ? "update_crossover" : detail.type === "follow_up" ? "update_follow_up" : "update_issue", id: item.id, status: "In Progress" }, "Marked in progress.")}>Mark In Progress</button><button className="admin-btn-secondary" type="button" disabled={busy} onClick={() => void onMutate("Unable to mark pending review.", { action: detail.type === "crossover" ? "update_crossover" : detail.type === "follow_up" ? "update_follow_up" : "update_issue", id: item.id, status: "Pending Review" }, "Marked pending review.")}>Pending Review</button><button className="admin-btn-primary" type="button" disabled={busy} onClick={() => void onMutate("Unable to resolve.", { action: detail.type === "crossover" ? "update_crossover" : detail.type === "follow_up" ? "update_follow_up" : "update_issue", id: item.id, status: "Resolved", resolution_notes: resolution }, "Record resolved.")}>Resolve</button></div>}>
      <div className="grid gap-4">
        {detail.type === "crossover" && "from_department" in item ? (
          <div className="grid gap-2 rounded-2xl border border-admin-border bg-white/[0.03] p-4 text-sm text-admin-muted md:grid-cols-2">
            <p><span className="font-bold text-white">Logged:</span> {formatDateTime(item.created_at)}</p>
            <p><span className="font-bold text-white">Updated:</span> {formatDateTime(item.updated_at)}</p>
            <p><span className="font-bold text-white">Reported by:</span> {crossoverCreatedByLabel(data?.staff_directory, item.created_by)}</p>
            <p><span className="font-bold text-white">Reported to:</span> {crossoverReportedTo(item as CrossoverMessage)}</p>
            <p><span className="font-bold text-white">From → To:</span> {item.from_department} → {item.to_department}</p>
            {item.assigned_to ? <p><span className="font-bold text-white">Assigned to:</span> {item.assigned_to}</p> : null}
          </div>
        ) : null}
        <div className="rounded-2xl border border-admin-border bg-white/[0.03] p-4"><div className="mb-3 flex flex-wrap gap-2"><Badge type="priority" value={item.priority} /><Badge type="status" value={item.status} /></div><p className="whitespace-pre-wrap text-sm text-admin-muted">{description || "No notes provided."}</p></div>
        {"assigned_to" in item ? <SelectField label="Assign / Reassign" value={item.assigned_to ?? ""} options={["", ...staffOptions]} onChange={(value) => void onMutate("Unable to assign.", { action: detail.type === "crossover" ? "update_crossover" : detail.type === "follow_up" ? "update_follow_up" : "update_issue", id: item.id, assigned_to: value }, "Assignment updated.")} /> : null}
        <PrioritySelect value={item.priority} onChange={(priority) => void onMutate("Unable to change priority.", { action: detail.type === "crossover" ? "update_crossover" : detail.type === "follow_up" ? "update_follow_up" : "update_issue", id: item.id, priority }, "Priority updated.")} />
        {detail.type === "crossover" ? <div className="grid gap-3"><h4 className="font-bold text-white">Replies</h4>{replies.map((entry) => <div key={entry.id} className="rounded-xl border border-admin-border p-3 text-sm text-admin-muted"><p className="text-white">{entry.message}</p><p className="mt-1 text-xs">{entry.created_by ?? "Admin"} • {formatDateTime(entry.created_at)}</p></div>)}<textarea className="admin-input min-h-[80px]" placeholder="Write a reply..." value={reply} onChange={(event) => setReply(event.target.value)} /><button className="admin-btn-primary justify-self-end" type="button" disabled={busy || !reply.trim()} onClick={async () => { await onMutate("Unable to reply.", { action: "reply_crossover", id: item.id, message: reply }, "Reply added."); setReply(""); }}>Reply</button></div> : null}
        {detail.type === "issues" ? <Field label="Resolution notes"><textarea className="admin-input min-h-[80px]" value={resolution} onChange={(event) => setResolution(event.target.value)} /></Field> : null}
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
