"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, Plus, UserPlus } from "lucide-react";
import type { AdminUserPublic } from "@/lib/admin/users";
import {
  DEPARTMENT_LABELS,
  ROLE_LABELS,
  buildUserAccess,
  canManageAdminUsers,
  isSuperAdminAccess,
  isSuperAdminLegacyRole,
  legacyRoleToRoleKey,
  previewLabelsForAccess,
  type DepartmentKey,
  type RoleKey,
  type UserAccess
} from "@/lib/admin/permissions";
import { AdminTable } from "@/components/admin/ui/AdminTable";
import { Modal } from "@/components/admin/ui/Modal";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { useToast } from "@/components/admin/ui/ToastProvider";

type UserRow = AdminUserPublic & { access?: UserAccess };

type UsersPayload = {
  users: UserRow[];
  currentUser: {
    email: string | null;
    adminUserId: string | null;
    role: string;
    access?: UserAccess | null;
  };
};

const PRIMARY_ROLE_OPTIONS: { value: RoleKey; description: string }[] = [
  { value: "super_admin", description: "Full system access including integrations, API, and permissions matrix." },
  { value: "admin", description: "Manage users and day-to-day admin tools (no integrations or permissions matrix)." },
  { value: "management", description: "View and assign staff operations; receive management alerts." },
  { value: "front_desk_coordinator", description: "Push Notices, Grooming Push, Front Desk Log, Owner Follow Up, Active Issues." },
  { value: "team_leader", description: "Team Lead DigiBoard panel: push notices, grooming push, front desk log, video links, personal notifications, write-ups, and profile settings." },
  { value: "groomer", description: "Groomer DigiBoard panel: grooming push, front desk log, video links, personal notifications, complaints/requests, and profile settings." },
  { value: "trainer", description: "Training panel with trainer push, shift log entry, and package commissions." },
  { value: "daycare", description: "Dog Handler staff board access." },
  { value: "driver", description: "Transportation staff board access." },
  { value: "hiker", description: "Hiking/transportation staff board access." },
  { value: "overnight", description: "Overnight staff board access." },
  { value: "maintenance", description: "Maintenance staff board access." },
  { value: "staff", description: "Basic staff board access." },
  { value: "viewer", description: "Read-only dashboard access." }
];

const ADDITIONAL_ROLE_OPTIONS = PRIMARY_ROLE_OPTIONS.filter(
  (option) => !["super_admin", "admin", "viewer"].includes(option.value)
);

const DEPARTMENT_OPTIONS = Object.entries(DEPARTMENT_LABELS).map(([value, label]) => ({
  value: value as DepartmentKey,
  label
}));

export function AdminUsersPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load users.");
      setData(body as UsersPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load users.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!menuUserId) return;
    function onPointerDown(event: PointerEvent) {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setMenuUserId(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuUserId]);

  const canManage = canManageAdminUsers(data?.currentUser.access ?? null, data?.currentUser.role);
  const actorIsSuperAdmin =
    isSuperAdminLegacyRole(data?.currentUser.role) || isSuperAdminAccess(data?.currentUser.access ?? null);

  const filteredUsers = useMemo(() => {
    const users = data?.users ?? [];
    return users.filter((user) => {
      const access = user.access ?? buildUserAccess({ primaryRole: legacyRoleToRoleKey(user.role) });
      if (roleFilter !== "all" && !access.roles.includes(roleFilter as RoleKey)) return false;
      if (departmentFilter !== "all" && !access.departments.includes(departmentFilter as DepartmentKey)) return false;
      return true;
    });
  }, [data?.users, departmentFilter, roleFilter]);

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Admin Users</h2>
          <p className="admin-page-subtitle">Manage staff accounts, roles, departments, and password access.</p>
        </div>
        {canManage ? (
          <button type="button" className="admin-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Admin User
          </button>
        ) : null}
      </header>

      <section className="admin-card p-5">
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="text-sm text-admin-muted">
            Filter by role{" "}
            <select className="admin-input ml-2 inline-block w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              {PRIMARY_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{ROLE_LABELS[option.value]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-admin-muted">
            Filter by department{" "}
            <select className="admin-input ml-2 inline-block w-auto" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option value="all">All departments</option>
              {DEPARTMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <AdminTable
          loading={loading}
          rows={filteredUsers}
          rowKey={(row) => row.id}
          emptyTitle="No admin users yet"
          emptyDescription="Add your first admin user to share dashboard access safely."
          columns={[
            { key: "name", header: "Name", render: (row) => <span className="font-semibold text-white">{row.full_name}</span> },
            { key: "email", header: "Email / Username", render: (row) => row.email },
            {
              key: "role",
              header: "Roles",
              render: (row) => (
                <span className="admin-badge">
                  {row.access?.displayLabel ?? ROLE_LABELS[legacyRoleToRoleKey(row.role)]}
                </span>
              )
            },
            {
              key: "departments",
              header: "Departments",
              hideOnMobile: true,
              render: (row) => {
                const departments = row.access?.departments ?? [];
                if (!departments.length) return "—";
                return departments.map((d) => DEPARTMENT_LABELS[d]).join(", ");
              }
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <span className={`admin-badge ${row.status === "active" ? "admin-badge--green" : "admin-badge--amber"}`}>
                  {row.status === "active" ? "Active" : "Disabled"}
                </span>
              )
            },
            {
              key: "password",
              header: "Password",
              hideOnMobile: true,
              render: (row) => (
                row.force_password_change ? <span className="admin-badge admin-badge--amber">Must change</span> : "Set"
              )
            },
            { key: "last_login", header: "Last Login", hideOnMobile: true, render: (row) => row.last_login_at ? new Date(row.last_login_at).toLocaleString() : "Never" },
            { key: "created", header: "Created", hideOnMobile: true, render: (row) => new Date(row.created_at).toLocaleDateString() }
          ]}
          actions={(row) =>
            canManage ? (
              <div ref={menuUserId === row.id ? actionMenuRef : undefined} className="relative flex justify-end gap-1">
                <button type="button" className="admin-icon-btn" aria-label={`Edit ${row.full_name}`} onClick={() => setEditUser(row)}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" className="admin-icon-btn" aria-label={`More actions for ${row.full_name}`} onClick={() => setMenuUserId(menuUserId === row.id ? null : row.id)}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuUserId === row.id ? (
                  <div className="admin-action-menu">
                    <button type="button" onClick={() => { setPasswordUser(row); setMenuUserId(null); }}><KeyRound className="h-3.5 w-3.5" /> Reset password</button>
                    {row.id !== data?.currentUser.adminUserId ? (
                      <>
                        <button type="button" onClick={() => void toggleStatus(row)}>
                          {row.status === "active" ? "Disable user" : "Reactivate user"}
                        </button>
                        <button type="button" className="text-red-300" onClick={() => { setDeleteUser(row); setMenuUserId(null); }}>Delete user</button>
                      </>
                    ) : (
                      <p className="px-3 py-2 text-xs text-admin-muted">You cannot disable or delete yourself.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null
          }
        />
      </section>

      <AddUserModal open={addOpen} busy={busy} actorIsSuperAdmin={actorIsSuperAdmin} onClose={() => setAddOpen(false)} onSubmit={async (payload) => {
        setBusy(true);
        try {
          const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Unable to add user.");
          showToast("User added.", "success");
          setAddOpen(false);
          await load();
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Unable to add user.", "error");
        } finally {
          setBusy(false);
        }
      }} />

      {editUser ? (
        <EditUserModal
          user={editUser}
          busy={busy}
          actorIsSuperAdmin={actorIsSuperAdmin}
          onClose={() => setEditUser(null)}
          onSubmit={async (patch) => {
            setBusy(true);
            try {
              const response = await fetch(`/api/admin/users/${editUser.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
              const body = await response.json();
              if (!response.ok) throw new Error(body.error ?? "Unable to update user.");
              showToast("User updated.", "success");
              setEditUser(null);
              await load();
            } catch (error) {
              showToast(error instanceof Error ? error.message : "Unable to update user.", "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {passwordUser ? (
        <ChangePasswordModal
          user={passwordUser}
          busy={busy}
          onClose={() => setPasswordUser(null)}
          onSubmit={async (payload) => {
            setBusy(true);
            try {
              const response = await fetch(`/api/admin/users/${passwordUser.id}/change-password`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload)
              });
              const body = await response.json();
              if (!response.ok) throw new Error(body.error ?? "Unable to change password.");
              showToast("Password updated.", "success");
              setPasswordUser(null);
              await load();
            } catch (error) {
              showToast(error instanceof Error ? error.message : "Unable to change password.", "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteUser)}
        title="Delete admin user?"
        description={`This permanently removes ${deleteUser?.email}. They will no longer be able to log in.`}
        confirmLabel="Delete user"
        danger
        busy={busy}
        onCancel={() => setDeleteUser(null)}
        onConfirm={async () => {
          if (!deleteUser) return;
          setBusy(true);
          try {
            const response = await fetch(`/api/admin/users/${deleteUser.id}`, { method: "DELETE" });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Unable to delete user.");
            showToast("User deleted.", "success");
            setDeleteUser(null);
            await load();
          } catch (error) {
            showToast(error instanceof Error ? error.message : "Unable to delete user.", "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );

  async function toggleStatus(user: UserRow) {
    setMenuUserId(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: user.status === "active" ? "disabled" : "active" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update user.");
      showToast(user.status === "active" ? "User disabled." : "User reactivated.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update user.", "error");
    } finally {
      setBusy(false);
    }
  }
}

type RoleFormState = {
  primary_role: RoleKey;
  additional_roles: RoleKey[];
  departments: DepartmentKey[];
};

function AccessPreview({ primary_role, additional_roles, departments }: RoleFormState) {
  const access = buildUserAccess({
    primaryRole: primary_role,
    roles: [primary_role, ...additional_roles],
    departments
  });
  const labels = previewLabelsForAccess(access);

  return (
    <div className="rounded-xl border border-admin-border bg-white/[0.03] p-4">
      <p className="text-sm font-bold text-white">Effective access preview</p>
      <p className="mt-1 text-xs text-admin-muted">Generated from assigned roles — not a hardcoded guess.</p>
      {labels.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {labels.map((label) => (
            <li key={label} className="admin-badge admin-badge--green">{label}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-admin-muted">No admin panel pages unlocked with current roles.</p>
      )}
    </div>
  );
}

function PrimaryRoleChoiceGroup({
  value,
  onChange,
  actorIsSuperAdmin
}: {
  value: RoleKey;
  onChange: (role: RoleKey) => void;
  actorIsSuperAdmin?: boolean;
}) {
  const options = actorIsSuperAdmin
    ? PRIMARY_ROLE_OPTIONS
    : PRIMARY_ROLE_OPTIONS.filter((option) => option.value !== "super_admin");

  return (
    <div>
      <span className="admin-label">Primary role</span>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Primary role">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`rounded-xl border p-3 text-left transition ${
                selected
                  ? "border-fitdog-orange bg-fitdog-orange/15 text-white shadow-[0_0_0_1px_rgba(241,95,42,0.25)]"
                  : "border-admin-border bg-white/[0.03] text-admin-muted hover:border-fitdog-orange/60 hover:text-white"
              }`}
              onClick={() => onChange(option.value)}
            >
              <span className="block text-sm font-black">{ROLE_LABELS[option.value]}</span>
              <span className="mt-1 block text-xs leading-snug text-admin-muted">{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiSelectChips<T extends string>({
  label,
  options,
  selected,
  onChange,
  exclude
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  exclude?: T;
}) {
  const visible = options.filter((option) => option.value !== exclude);

  function toggle(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div>
      <span className="admin-label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {visible.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-fitdog-orange bg-fitdog-orange/20 text-white"
                  : "border-admin-border text-admin-muted hover:border-fitdog-orange/60 hover:text-white"
              }`}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddUserModal({
  open,
  busy,
  actorIsSuperAdmin,
  onClose,
  onSubmit
}: {
  open: boolean;
  busy: boolean;
  actorIsSuperAdmin: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    primary_role: "front_desk_coordinator" as RoleKey,
    additional_roles: [] as RoleKey[],
    departments: ["front_desk"] as DepartmentKey[],
    password: "",
    confirm_password: "",
    force_password_change: true
  });

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setForm({
        full_name: "",
        email: "",
        primary_role: "front_desk_coordinator",
        additional_roles: [],
        departments: ["front_desk"],
        password: "",
        confirm_password: "",
        force_password_change: true
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <Modal open={open} title="Add Admin User" description="Create a new dashboard account with a temporary password." onClose={onClose} closeOnBackdrop={false} closeOnEscape={!busy} footer={
      <div className="flex justify-end gap-2">
        <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="admin-btn-primary inline-flex items-center gap-2" disabled={busy} onClick={() => void onSubmit(form)}>
          <Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add user"}
        </button>
      </div>
    }>
      <div className="grid gap-4">
        <Field label="Full name"><input className="admin-input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="Email / username"><input className="admin-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <PrimaryRoleChoiceGroup value={form.primary_role} actorIsSuperAdmin={actorIsSuperAdmin} onChange={(primary_role) => setForm({ ...form, primary_role })} />
        <MultiSelectChips
          label="Additional roles"
          options={ADDITIONAL_ROLE_OPTIONS.map((option) => ({ value: option.value, label: ROLE_LABELS[option.value] }))}
          selected={form.additional_roles}
          onChange={(additional_roles) => setForm({ ...form, additional_roles })}
          exclude={form.primary_role}
        />
        <MultiSelectChips
          label="Departments"
          options={DEPARTMENT_OPTIONS}
          selected={form.departments}
          onChange={(departments) => setForm({ ...form, departments })}
        />
        <AccessPreview primary_role={form.primary_role} additional_roles={form.additional_roles} departments={form.departments} />
        <Field label="Temporary password"><input className="admin-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Confirm password"><input className="admin-input" type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} /></Field>
        <label className="admin-toggle-row">
          <span className="text-sm text-white">Force password change on next login</span>
          <button type="button" role="switch" aria-checked={form.force_password_change} className={`admin-toggle ${form.force_password_change ? "admin-toggle--on" : ""}`} onClick={() => setForm({ ...form, force_password_change: !form.force_password_change })}>
            <span className="admin-toggle__knob" />
          </button>
        </label>
      </div>
    </Modal>
  );
}

function EditUserModal({
  user,
  busy,
  actorIsSuperAdmin,
  onClose,
  onSubmit
}: {
  user: UserRow;
  busy: boolean;
  actorIsSuperAdmin: boolean;
  onClose: () => void;
  onSubmit: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const initialAccess = user.access ?? buildUserAccess({ primaryRole: legacyRoleToRoleKey(user.role) });
  const targetIsSuperAdmin = isSuperAdminLegacyRole(user.role) || isSuperAdminAccess(user.access ?? null);
  const readOnly = targetIsSuperAdmin && !actorIsSuperAdmin;
  const [form, setForm] = useState({
    full_name: user.full_name,
    email: user.email,
    primary_role: initialAccess.primaryRole,
    additional_roles: initialAccess.roles.filter((role) => role !== initialAccess.primaryRole),
    departments: initialAccess.departments,
    force_password_change: user.force_password_change
  });

  useEffect(() => {
    const access = user.access ?? buildUserAccess({ primaryRole: legacyRoleToRoleKey(user.role) });
    const timer = window.setTimeout(() => {
      setForm({
        full_name: user.full_name,
        email: user.email,
        primary_role: access.primaryRole,
        additional_roles: access.roles.filter((role) => role !== access.primaryRole),
        departments: access.departments,
        force_password_change: user.force_password_change
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  return (
    <Modal open title="Edit Admin User" onClose={onClose} closeOnBackdrop={false} closeOnEscape={!busy} footer={
      <div className="flex justify-end gap-2">
        <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="admin-btn-primary" disabled={busy || readOnly} onClick={() => void onSubmit(form)}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    }>
      <div className="grid gap-4">
        {readOnly ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Only Super Admin can edit Super Admin accounts.
          </p>
        ) : null}
        <Field label="Full name"><input className="admin-input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} disabled={readOnly} /></Field>
        <Field label="Email / username"><input className="admin-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={readOnly} /></Field>
        <PrimaryRoleChoiceGroup value={form.primary_role} actorIsSuperAdmin={actorIsSuperAdmin} onChange={(primary_role) => setForm({ ...form, primary_role })} />
        <MultiSelectChips
          label="Additional roles"
          options={ADDITIONAL_ROLE_OPTIONS.map((option) => ({ value: option.value, label: ROLE_LABELS[option.value] }))}
          selected={form.additional_roles}
          onChange={(additional_roles) => setForm({ ...form, additional_roles })}
          exclude={form.primary_role}
        />
        <MultiSelectChips
          label="Departments"
          options={DEPARTMENT_OPTIONS}
          selected={form.departments}
          onChange={(departments) => setForm({ ...form, departments })}
        />
        <AccessPreview primary_role={form.primary_role} additional_roles={form.additional_roles} departments={form.departments} />
        <label className="admin-toggle-row">
          <span className="text-sm text-white">Require password change at next login</span>
          <button type="button" role="switch" aria-checked={form.force_password_change} className={`admin-toggle ${form.force_password_change ? "admin-toggle--on" : ""}`} onClick={() => setForm({ ...form, force_password_change: !form.force_password_change })}>
            <span className="admin-toggle__knob" />
          </button>
        </label>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ user, busy, onClose, onSubmit }: { user: UserRow; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [force, setForce] = useState(true);

  return (
    <Modal open title={`Reset password — ${user.full_name}`} description="Sets a new temporary password. The user must change it at next login when forced." onClose={onClose} closeOnBackdrop={false} closeOnEscape={!busy} footer={
      <div className="flex justify-end gap-2">
        <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void onSubmit({ password, confirm_password: confirm, force_password_change: force })}>{busy ? "Updating…" : "Set temporary password"}</button>
      </div>
    }>
      <div className="grid gap-4">
        <Field label="New temporary password"><input className="admin-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Confirm new password"><input className="admin-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <label className="admin-toggle-row">
          <span className="text-sm text-white">Force password change on next login</span>
          <button type="button" role="switch" aria-checked={force} className={`admin-toggle ${force ? "admin-toggle--on" : ""}`} onClick={() => setForce(!force)}>
            <span className="admin-toggle__knob" />
          </button>
        </label>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="admin-label">{label}</span>{children}</label>;
}
