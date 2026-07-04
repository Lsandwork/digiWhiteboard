"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, Plus, UserPlus } from "lucide-react";
import type { AdminUserPublic, AdminUserRole } from "@/lib/admin/users";
import { ADMIN_USER_ROLE_LABELS } from "@/lib/admin/users";
import { AdminTable } from "@/components/admin/ui/AdminTable";
import { Modal } from "@/components/admin/ui/Modal";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { useToast } from "@/components/admin/ui/ToastProvider";

type UsersPayload = {
  users: AdminUserPublic[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

const roleOptions: { value: AdminUserRole; label: string; description: string }[] = [
  { value: "owner_admin", label: "Owner Admin", description: "Full dashboard and user management access." },
  { value: "manager_admin", label: "Manager Admin", description: "Manage day-to-day admin tools and board content." },
  { value: "front_desk_coordinator", label: "Front Desk - Coordinator", description: "Staff board Push Notices, staff operations tabs, and read-only Staff Directory." },
  { value: "team_leader", label: "Team Lead", description: "Team Lead department with staff operations tabs and read-only Staff Directory." },
  { value: "groomer", label: "Groomer", description: "Crossover Communication and notifications for Grooming department handoffs." },
  { value: "trainer", label: "Trainer", description: "Crossover Communication and notifications for Training department handoffs." },
  { value: "viewer", label: "Viewer", description: "Read-only dashboard access." }
];

export function AdminUsersPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserPublic | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUserPublic | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUserPublic | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const canManage = data?.currentUser.role !== "viewer";

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Admin Users</h2>
          <p className="admin-page-subtitle">Manage who can access this dashboard and what they can do.</p>
        </div>
        {canManage ? (
          <button type="button" className="admin-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Admin User
          </button>
        ) : null}
      </header>

      <section className="admin-card p-5">
        <AdminTable
          loading={loading}
          rows={data?.users ?? []}
          rowKey={(row) => row.id}
          emptyTitle="No admin users yet"
          emptyDescription="Add your first admin user to share dashboard access safely."
          columns={[
            { key: "name", header: "Name", render: (row) => <span className="font-semibold text-white">{row.full_name}</span> },
            { key: "email", header: "Email / Username", render: (row) => row.email },
            { key: "role", header: "Role", render: (row) => <span className="admin-badge">{ADMIN_USER_ROLE_LABELS[row.role] ?? row.role}</span> },
            { key: "status", header: "Status", render: (row) => (
              <span className={`admin-badge ${row.status === "active" ? "admin-badge--green" : "admin-badge--amber"}`}>
                {row.status === "active" ? "Active" : "Disabled"}
              </span>
            )},
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
                    <button type="button" onClick={() => { setPasswordUser(row); setMenuUserId(null); }}><KeyRound className="h-3.5 w-3.5" /> Change password</button>
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

      <AddUserModal open={addOpen} busy={busy} onClose={() => setAddOpen(false)} onSubmit={async (payload) => {
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

  async function toggleStatus(user: AdminUserPublic) {
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

function AddUserModal({ open, busy, onClose, onSubmit }: { open: boolean; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState<{ full_name: string; email: string; role: AdminUserRole; password: string; confirm_password: string; force_password_change: boolean }>({
    full_name: "",
    email: "",
    role: "manager_admin",
    password: "",
    confirm_password: "",
    force_password_change: true
  });

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setForm({ full_name: "", email: "", role: "manager_admin", password: "", confirm_password: "", force_password_change: true });
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
        <RoleChoiceGroup value={form.role} onChange={(role) => setForm({ ...form, role })} />
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

function EditUserModal({ user, busy, onClose, onSubmit }: { user: AdminUserPublic; busy: boolean; onClose: () => void; onSubmit: (patch: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState<{ full_name: string; email: string; role: AdminUserRole }>({
    full_name: user.full_name,
    email: user.email,
    role: user.role
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setForm({
        full_name: user.full_name,
        email: user.email,
        role: user.role
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user.email, user.full_name, user.role]);

  return (
    <Modal open title="Edit Admin User" onClose={onClose} closeOnBackdrop={false} closeOnEscape={!busy} footer={
      <div className="flex justify-end gap-2">
        <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void onSubmit(form)}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    }>
      <div className="grid gap-4">
        <Field label="Full name"><input className="admin-input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="Email / username"><input className="admin-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <RoleChoiceGroup value={form.role} onChange={(role) => setForm({ ...form, role })} />
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ user, busy, onClose, onSubmit }: { user: AdminUserPublic; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [force, setForce] = useState(false);

  return (
    <Modal open title={`Change password — ${user.full_name}`} onClose={onClose} closeOnBackdrop={false} closeOnEscape={!busy} footer={
      <div className="flex justify-end gap-2">
        <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="admin-btn-primary" disabled={busy} onClick={() => void onSubmit({ password, confirm_password: confirm, force_password_change: force })}>{busy ? "Updating…" : "Update password"}</button>
      </div>
    }>
      <div className="grid gap-4">
        <Field label="New password"><input className="admin-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
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

function RoleChoiceGroup({ value, onChange }: { value: AdminUserRole; onChange: (role: AdminUserRole) => void }) {
  return (
    <div>
      <span className="admin-label">Role</span>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Admin user role">
        {roleOptions.map((option) => {
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
              <span className="block text-sm font-black">{option.label}</span>
              <span className="mt-1 block text-xs leading-snug text-admin-muted">{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
