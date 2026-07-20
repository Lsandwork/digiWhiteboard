"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, LogIn, Pencil, Plus, Search, Trash2, UserRound, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { AdminUserRole } from "@/lib/admin/users";
import { ADMIN_USER_ROLE_LABELS, canManageStaffDirectory, isAdminOrManagementRole } from "@/lib/admin/users";
import type { StaffActivityLog, StaffDirectoryMember } from "@/lib/staff/admin-ops";
import { STAFF_DEPARTMENTS, departmentForDashboardRole } from "@/lib/staff/admin-ops";

type StaffDirectoryPayload = {
  staff_directory: StaffDirectoryMember[];
  activity_logs: StaffActivityLog[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

type StaffMemberForm = {
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  status: "Active" | "Inactive";
  notes: string;
  checklist_items: string;
  dashboard_role: AdminUserRole;
  temp_password: string;
  confirm_password: string;
};

const staffStatusOptions: StaffMemberForm["status"][] = ["Active", "Inactive"];

const dashboardRoleOptions: { value: AdminUserRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "marketing", label: "Marketing Account" },
  { value: "groomer", label: "Groomer" },
  { value: "trainer", label: "Trainer" },
  { value: "daycare", label: "Dog Handler" },
  { value: "driver", label: "Driver/Hiker" },
  { value: "front_desk_coordinator", label: "Front Desk - Coordinator" },
  { value: "team_leader", label: "Team Lead" },
  { value: "manager_admin", label: "Manager Admin" },
  { value: "owner_admin", label: "Owner Admin" }
];

const dashboardRoleLabels = ADMIN_USER_ROLE_LABELS;

const emptyForm: StaffMemberForm = {
  name: "",
  role: "",
  department: "Front Desk",
  email: "",
  phone: "",
  status: "Active",
  notes: "",
  checklist_items: "",
  dashboard_role: "viewer",
  temp_password: "",
  confirm_password: ""
};

function formFromMember(member: StaffDirectoryMember): StaffMemberForm {
  return {
    name: member.name,
    role: member.role ?? "",
    department: member.department,
    email: member.email ?? "",
    phone: member.phone ?? "",
    status: member.status,
    notes: member.notes ?? "",
    checklist_items: (member.checklist_items ?? []).join("\n"),
    dashboard_role: member.dashboard_role ?? "viewer",
    temp_password: "",
    confirm_password: ""
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

function payloadFromForm(form: StaffMemberForm, includePassword: boolean) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    role: form.role.trim(),
    department: form.department,
    email: form.email.trim(),
    phone: form.phone.trim(),
    status: form.status,
    notes: form.notes.trim(),
    checklist_items: form.checklist_items
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    dashboard_role: form.email.trim() ? form.dashboard_role : null
  };

  if (includePassword && form.temp_password.trim()) {
    payload.temp_password = form.temp_password;
    payload.confirm_password = form.confirm_password;
  }

  return payload;
}

export function StaffDirectoryPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<StaffDirectoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StaffDirectoryMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<StaffDirectoryMember | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load staff directory.");
      setData(body as StaffDirectoryPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load staff directory.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const members = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.staff_directory ?? []).filter((member) => {
      if (department && member.department !== department) return false;
      if (status && member.status !== status) return false;
      if (!normalized) return true;
      return [member.name, member.role, member.department, member.email, member.phone, member.notes]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [data?.staff_directory, department, query, status]);

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
      await load(true);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : label, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const activeCount = (data?.staff_directory ?? []).filter((member) => member.status === "Active").length;
  const inactiveCount = (data?.staff_directory ?? []).filter((member) => member.status === "Inactive").length;
  const canManageDirectory = canManageStaffDirectory(data?.currentUser.role);
  const canImpersonate = isAdminOrManagementRole(data?.currentUser.role);
  const currentAdminUserId = data?.currentUser.adminUserId ?? null;
  const [impersonateTarget, setImpersonateTarget] = useState<StaffDirectoryMember | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  function canLogInAsMember(member: StaffDirectoryMember) {
    return Boolean(
      canImpersonate && member.admin_user_id && member.admin_user_id !== currentAdminUserId && member.status === "Active"
    );
  }

  async function logInAsMember(member: StaffDirectoryMember) {
    if (!member.admin_user_id) return;
    setImpersonating(true);
    try {
      const response = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetAdminUserId: member.admin_user_id })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to log in as this employee.");
      showToast(`Logging in as ${member.name}…`, "success");
      window.location.assign("/admin");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to log in as this employee.", "error");
      setImpersonating(false);
      setImpersonateTarget(null);
    }
  }
  const [selectedChecklistUserId, setSelectedChecklistUserId] = useState<string>("");
  const selectedChecklistMember = useMemo(
    () => (data?.staff_directory ?? []).find((member) => member.id === selectedChecklistUserId) ?? null,
    [data?.staff_directory, selectedChecklistUserId]
  );
  const [checklistDraft, setChecklistDraft] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(
      () => setChecklistDraft((selectedChecklistMember?.checklist_items ?? []).join("\n")),
      0
    );
    return () => window.clearTimeout(timer);
  }, [selectedChecklistMember]);

  return (
    <div className="crossover-dashboard crossover-dashboard__layout space-y-5">
      <header className="crossover-dashboard__page-header">
        <div>
          <h2 className="crossover-dashboard__page-title">Staff Directory</h2>
          <p className="crossover-dashboard__page-subtitle">
            {canManageDirectory
              ? "Manage staff assignments, contact details, and dashboard login access in one place."
              : "View staff assignments, contact details, and dashboard roles. Only full admins can add or edit entries."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loading || refreshing ? <span className="crossover-badge crossover-badge--status-pending">{loading ? "Loading..." : "Refreshing..."}</span> : null}
          {canManageDirectory ? (
            <button type="button" className="crossover-btn crossover-btn--primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)} disabled={busy}>
              <Plus className="h-4 w-4" /> Add Staff Member
            </button>
          ) : null}
        </div>
      </header>

      <section className="crossover-stat-grid md:grid-cols-3">
        <div className="crossover-stat-card">
          <div className="crossover-stat-card__icon"><UserRound className="h-5 w-5" /></div>
          <div>
            <p className="crossover-stat-card__value">{data?.staff_directory.length ?? 0}</p>
            <p className="crossover-stat-card__label">Total directory entries</p>
          </div>
        </div>
        <div className="crossover-stat-card">
          <div className="crossover-stat-card__icon"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <p className="crossover-stat-card__value">{activeCount}</p>
            <p className="crossover-stat-card__label">Active assignment options</p>
          </div>
        </div>
        <div className="crossover-stat-card">
          <div className="crossover-stat-card__icon"><XCircle className="h-5 w-5" /></div>
          <div>
            <p className="crossover-stat-card__value">{inactiveCount}</p>
            <p className="crossover-stat-card__label">Inactive entries</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="crossover-card crossover-card--conversations">
          <div className="crossover-card__header">
            <div>
              <h3 className="crossover-card__title">Directory</h3>
              <p className="crossover-card__subtitle">
                {canManageDirectory ? "Search, edit, activate, deactivate, or delete staff entries." : "Search and review staff directory records."}
              </p>
            </div>
            <button type="button" className="crossover-btn crossover-btn--outline" onClick={() => void load(true)} disabled={loading || refreshing}>
              Refresh
            </button>
          </div>
          <div className="space-y-4 border-b border-[rgba(255,166,0,0.12)] px-5 pb-5">
            <label className="crossover-search">
              <Search className="crossover-search__icon-lucide" aria-hidden />
              <input
                className="crossover-input crossover-search__input"
                placeholder="Search name, department, email, notes..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <FilterButtonGroup label="Department" value={department} options={["", ...STAFF_DEPARTMENTS]} allLabel="All departments" onChange={setDepartment} />
            <FilterButtonGroup label="Status" value={status} options={["", ...staffStatusOptions]} allLabel="All statuses" onChange={setStatus} />
          </div>

          <div className="crossover-table-wrap hidden md:block">
            <table className="crossover-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Contact</th>
                  <th>Dashboard</th>
                  <th>Status</th>
                  {canManageDirectory ? <th className="crossover-table__actions-col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="crossover-table__emphasis">{member.name}</td>
                    <td className="px-4 py-3">{member.role ?? "Staff Member"}</td>
                    <td className="px-4 py-3">{member.department}</td>
                    <td className="px-4 py-3">
                      <p>{member.email ?? "No email"}</p>
                      <p className="text-xs">{member.phone ?? "No phone"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {member.admin_user_id ? (
                        <span className="admin-badge admin-badge--info">{dashboardRoleLabels[member.dashboard_role ?? "viewer"]}</span>
                      ) : (
                        <span className="admin-badge opacity-70">No login</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={member.status === "Active" ? "admin-badge admin-badge--green" : "admin-badge opacity-70"}>{member.status}</span>
                    </td>
                    {canManageDirectory ? (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {canLogInAsMember(member) ? (
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn--accent"
                              disabled={busy || impersonating}
                              aria-label={`Log in as ${member.name}`}
                              title="Log In As Employee"
                              onClick={() => setImpersonateTarget(member)}
                            >
                              <LogIn className="h-4 w-4" />
                            </button>
                          ) : null}
                          <button type="button" className="admin-icon-btn" disabled={busy} aria-label={`Edit ${member.name}`} onClick={() => setEditing(member)}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={busy}
                            aria-label={member.status === "Active" ? `Deactivate ${member.name}` : `Activate ${member.name}`}
                            onClick={() => void mutate("Unable to update status.", { action: "update_staff_member", id: member.id, status: member.status === "Active" ? "Inactive" : "Active" }, "Staff status updated.")}
                          >
                            {member.status === "Active" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          </button>
                          <button type="button" className="admin-icon-btn" disabled={busy} aria-label={`Delete ${member.name}`} onClick={() => setDeleteMember(member)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!members.length ? (
                  <tr>
                    <td className="crossover-table__empty-row text-admin-muted" colSpan={canManageDirectory ? 7 : 6}>No staff members found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {members.map((member) => (
              <article key={member.id} className="rounded-2xl border border-admin-border bg-[var(--surface)] p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fitdog-orange/15 text-fitdog-orange">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[var(--text-primary)]">{member.name}</p>
                    <p className="text-sm text-admin-muted">{member.role ?? "Staff Member"} • {member.department}</p>
                    <p className="mt-2 text-xs text-admin-muted">{member.email ?? "No email"} • {member.phone ?? "No phone"}</p>
                    <p className="mt-2 text-xs text-admin-muted">
                      Dashboard: {member.admin_user_id ? dashboardRoleLabels[member.dashboard_role ?? "viewer"] : "No login"}
                    </p>
                    {canLogInAsMember(member) ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          className="admin-btn-primary inline-flex items-center gap-2"
                          disabled={busy || impersonating}
                          onClick={() => setImpersonateTarget(member)}
                        >
                          <LogIn className="h-4 w-4" /> Log In As Employee
                        </button>
                      </div>
                    ) : null}
                    {canManageDirectory ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="admin-btn-secondary" disabled={busy} onClick={() => setEditing(member)}>Edit</button>
                        <button type="button" className="admin-btn-secondary" disabled={busy} onClick={() => void mutate("Unable to update status.", { action: "update_staff_member", id: member.id, status: member.status === "Active" ? "Inactive" : "Active" }, "Staff status updated.")}>{member.status === "Active" ? "Deactivate" : "Activate"}</button>
                        <button type="button" className="admin-btn-secondary" disabled={busy} onClick={() => setDeleteMember(member)}>Delete</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <section className="admin-card p-5">
          <h3 className="text-lg font-black text-[var(--text-primary)]">Recent Directory Activity</h3>
          <div className="mt-4 grid gap-3">
            {(data?.activity_logs ?? []).filter((item) => item.activity_type.startsWith("staff_directory")).slice(0, 8).map((item) => (
              <div key={item.id} className="flex gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">{item.title}</p>
                  <p className="text-xs text-admin-muted">{item.created_by ?? "Admin"} • {formatDateTime(item.created_at)}</p>
                </div>
              </div>
            ))}
            {!data?.activity_logs?.some((item) => item.activity_type.startsWith("staff_directory")) ? (
              <p className="text-sm text-admin-muted">No directory activity yet.</p>
            ) : null}
          </div>
        </section>
        {canManageDirectory ? (
          <section className="admin-card p-5">
            <h3 className="text-lg font-black text-white">Checklist Assignments</h3>
            <p className="mt-1 text-sm text-admin-muted">
              Place per-user checklist configuration here so admins and management can maintain unique checklist items by user.
            </p>
            <div className="mt-3 grid gap-3">
              <select
                className="admin-select"
                value={selectedChecklistUserId}
                onChange={(event) => setSelectedChecklistUserId(event.target.value)}
              >
                <option value="">Select a user</option>
                {(data?.staff_directory ?? []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} {member.email ? `(${member.email})` : ""}
                  </option>
                ))}
              </select>
              <textarea
                className="admin-input min-h-[180px]"
                placeholder="One checklist item per line"
                value={checklistDraft}
                onChange={(event) => setChecklistDraft(event.target.value)}
                disabled={!selectedChecklistMember}
              />
              <button
                type="button"
                className="admin-btn-primary justify-center"
                disabled={busy || !selectedChecklistMember}
                onClick={() => {
                  if (!selectedChecklistMember) return;
                  void mutate(
                    "Unable to save checklist items.",
                    {
                      action: "update_staff_member",
                      id: selectedChecklistMember.id,
                      checklist_items: checklistDraft
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean)
                    },
                    "Checklist items updated."
                  );
                }}
              >
                Save Checklist Items
              </button>
            </div>
          </section>
        ) : null}
      </section>

      {canManageDirectory ? (
        <>
          <StaffMemberModal
            open={addOpen}
            mode="add"
            title="Add Staff Member"
            description="Create a staff directory entry and optionally grant dashboard login access."
            busy={busy}
            onClose={() => setAddOpen(false)}
            onSubmit={async (form) => {
              const ok = await mutate("Unable to add staff member.", { ...payloadFromForm(form, true), action: "create_staff_member" }, "Staff member added.");
              if (ok) setAddOpen(false);
            }}
          />

          {editing ? (
            <StaffMemberModal
              key={editing.id}
              open
              mode="edit"
              member={editing}
              title={`Edit ${editing.name}`}
              description="Update staff details, dashboard role, or set a new temporary password."
              busy={busy}
              hasLogin={Boolean(editing.admin_user_id)}
              onClose={() => setEditing(null)}
              onSubmit={async (form) => {
                const ok = await mutate(
                  "Unable to update staff member.",
                  { ...payloadFromForm(form, true), id: editing.id, action: "update_staff_member" },
                  "Staff member updated."
                );
                if (ok) setEditing(null);
              }}
            />
          ) : null}

          <ConfirmDialog
            open={Boolean(impersonateTarget)}
            title="Log in as this employee?"
            description={`You will switch into ${impersonateTarget?.name ?? "this employee"}'s dashboard and see exactly what they see. You can return to your own account at any time using the banner at the top.`}
            confirmLabel="Log In As Employee"
            busy={impersonating}
            onCancel={() => setImpersonateTarget(null)}
            onConfirm={() => {
              if (impersonateTarget) void logInAsMember(impersonateTarget);
            }}
          />

          <ConfirmDialog
            open={Boolean(deleteMember)}
            title="Delete staff member?"
            description={`This removes ${deleteMember?.name ?? "this staff member"} from assignment dropdowns. Existing records will keep their saved assignment text.`}
            confirmLabel="Delete staff member"
            danger
            busy={busy}
            onCancel={() => setDeleteMember(null)}
            onConfirm={async () => {
              if (!deleteMember) return;
              const ok = await mutate("Unable to delete staff member.", { action: "delete_staff_member", id: deleteMember.id }, "Staff member deleted.");
              if (ok) setDeleteMember(null);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function StaffMemberModal({
  open,
  mode,
  member,
  title,
  description,
  busy,
  hasLogin = false,
  onClose,
  onSubmit
}: {
  open: boolean;
  mode: "add" | "edit";
  member?: StaffDirectoryMember;
  title: string;
  description: string;
  busy: boolean;
  hasLogin?: boolean;
  onClose: () => void;
  onSubmit: (form: StaffMemberForm) => Promise<void>;
}) {
  const [form, setForm] = useState<StaffMemberForm>(() => (mode === "edit" && member ? formFromMember(member) : emptyForm));
  const [setTempPassword, setSetTempPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setForm(mode === "edit" && member ? formFromMember(member) : emptyForm);
      setSetTempPassword(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [member, mode, open]);

  const canSave = form.name.trim().length > 0 && (!setTempPassword || (form.temp_password.length > 0 && form.confirm_password.length > 0));

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      closeOnBackdrop={false}
      closeOnEscape={!busy}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="admin-btn-primary" onClick={() => void onSubmit(form)} disabled={busy || !canSave}>
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      }
    >
      <StaffMemberFields form={form} onChange={setForm} setTempPassword={setTempPassword} onToggleTempPassword={setSetTempPassword} hasLogin={hasLogin} />
    </Modal>
  );
}

function StaffMemberFields({
  form,
  onChange,
  setTempPassword,
  onToggleTempPassword,
  hasLogin
}: {
  form: StaffMemberForm;
  onChange: (form: StaffMemberForm) => void;
  setTempPassword: boolean;
  onToggleTempPassword: (value: boolean) => void;
  hasLogin?: boolean;
}) {
  const hasEmail = form.email.trim().length > 0;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4">
        <h4 className="text-sm font-black uppercase tracking-wide text-white">Staff Details</h4>
        <FormField label="Name" required>
          <input className="admin-input" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} autoComplete="name" />
        </FormField>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Role / Title">
            <input className="admin-input" value={form.role} onChange={(event) => onChange({ ...form, role: event.target.value })} autoComplete="organization-title" />
          </FormField>
          <ChoiceGroup label="Department" value={form.department} options={[...STAFF_DEPARTMENTS]} onChange={(department) => onChange({ ...form, department })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Email">
            <input
              className="admin-input"
              type="email"
              value={form.email}
              onChange={(event) => onChange({ ...form, email: event.target.value })}
              autoComplete="off"
              inputMode="email"
            />
          </FormField>
          <FormField label="Phone">
            <input className="admin-input" value={form.phone} onChange={(event) => onChange({ ...form, phone: event.target.value })} autoComplete="tel" inputMode="tel" />
          </FormField>
        </div>
        <ChoiceGroup label="Status" value={form.status} options={staffStatusOptions} onChange={(status) => onChange({ ...form, status: status as StaffMemberForm["status"] })} />
        <FormField label="Notes">
          <textarea className="admin-input min-h-[90px]" value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} />
        </FormField>
        <FormField label="Checklist Items (one per line)">
          <textarea
            className="admin-input min-h-[110px]"
            value={form.checklist_items}
            onChange={(event) => onChange({ ...form, checklist_items: event.target.value })}
            placeholder="Clock in and confirm yard assignment."
          />
        </FormField>
      </section>

      <section className="rounded-2xl border border-admin-border bg-white/[0.03] p-4">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-fitdog-orange" />
          <h4 className="text-sm font-black uppercase tracking-wide text-white">Dashboard Login</h4>
        </div>
        {!hasEmail ? (
          <p className="text-sm text-admin-muted">Add an email address to enable dashboard login and temporary password setup.</p>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-admin-muted">
              {hasLogin
                ? "This staff member already has dashboard access. You can update their role or set a new temporary password."
                : "Set a dashboard role and temporary password to create login access for this staff member."}
            </p>
            <ChoiceGroup
              label="Dashboard Role"
              value={form.dashboard_role}
              options={dashboardRoleOptions.map((option) => option.value)}
              optionLabels={Object.fromEntries(dashboardRoleOptions.map((option) => [option.value, option.label]))}
              onChange={(dashboard_role) => {
                const role = dashboard_role as AdminUserRole;
                const next = { ...form, dashboard_role: role };
                const linkedDepartment = departmentForDashboardRole(role);
                if (linkedDepartment) next.department = linkedDepartment;
                onChange(next);
              }}
            />
            <label className="admin-toggle-row">
              <span className="text-sm font-bold text-white">Set temporary password</span>
              <button
                type="button"
                role="switch"
                aria-checked={setTempPassword}
                className={`admin-toggle ${setTempPassword ? "admin-toggle--on" : ""}`}
                onClick={() => onToggleTempPassword(!setTempPassword)}
              >
                <span className="admin-toggle__knob" />
              </button>
            </label>
            {setTempPassword ? (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Temporary password">
                  <input
                    className="admin-input"
                    type="password"
                    value={form.temp_password}
                    onChange={(event) => onChange({ ...form, temp_password: event.target.value })}
                    autoComplete="new-password"
                  />
                </FormField>
                <FormField label="Confirm temporary password">
                  <input
                    className="admin-input"
                    type="password"
                    value={form.confirm_password}
                    onChange={(event) => onChange({ ...form, confirm_password: event.target.value })}
                    autoComplete="new-password"
                  />
                </FormField>
              </div>
            ) : null}
            {setTempPassword ? (
              <p className="text-xs text-admin-muted">The user must change this temporary password the next time they sign in.</p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function FormField({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="grid gap-2">
      <label className="text-xs font-bold uppercase tracking-wide text-admin-muted">{label}{required ? " *" : ""}</label>
      {children}
    </div>
  );
}

function ChoiceGroup({
  label,
  value,
  options,
  optionLabels,
  onChange
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">{label}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={choiceButtonClass(value === option)}
            onClick={() => onChange(option)}
          >
            {optionLabels?.[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterButtonGroup({ label, value, options, allLabel, onChange }: { label: string; value: string; options: readonly string[]; allLabel: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-admin-muted">{label}</span>
      <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={`${label} filter`}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option || "all"}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`${choiceButtonClass(selected)} shrink-0`}
              onClick={() => onChange(option)}
            >
              {option || allLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function choiceButtonClass(selected: boolean) {
  return selected ? "admin-filter-chip admin-filter-chip--active shrink-0" : "admin-filter-chip shrink-0";
}
