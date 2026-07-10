"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  ROLE_LABELS,
  buildUserAccess,
  previewLabelsForAccess,
  type DepartmentKey,
  type RoleKey
} from "@/lib/admin/permissions";
import { creatablePrimaryRolesForActor } from "@/lib/admin/user-creation-access";
import type { UserAccess } from "@/lib/admin/permissions";
import {
  ADDITIONAL_ROLE_OPTIONS,
  DEPARTMENT_OPTIONS,
  roleOptionsForCreatableRoles
} from "@/components/admin/admin-user-role-options";

type CreateAdminUserFormProps = {
  actorAccess: UserAccess | null;
  actorLegacyRole?: string | null;
  actorIsSuperAdmin: boolean;
  busy?: boolean;
  formResetVersion?: number;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

function buildInitialForm(defaultRole: RoleKey) {
  return {
    full_name: "",
    email: "",
    primary_role: defaultRole,
    additional_roles: [] as RoleKey[],
    departments: ["front_desk"] as DepartmentKey[],
    password: "",
    confirm_password: "",
    force_password_change: true
  };
}

export function CreateAdminUserForm({
  actorAccess,
  actorLegacyRole,
  actorIsSuperAdmin,
  busy = false,
  formResetVersion = 0,
  onSubmit
}: CreateAdminUserFormProps) {
  const creatableRoles = useMemo(
    () => creatablePrimaryRolesForActor(actorAccess, actorLegacyRole),
    [actorAccess, actorLegacyRole]
  );
  const primaryOptions = useMemo(() => roleOptionsForCreatableRoles(creatableRoles), [creatableRoles]);
  const defaultRole = creatableRoles.includes("front_desk_coordinator")
    ? "front_desk_coordinator"
    : creatableRoles[0] ?? "viewer";

  const [form, setForm] = useState(() => buildInitialForm(defaultRole));

  useEffect(() => {
    const timer = window.setTimeout(() => setForm(buildInitialForm(defaultRole)), 0);
    return () => window.clearTimeout(timer);
  }, [defaultRole, formResetVersion]);

  const accessPreview = buildUserAccess({
    primaryRole: form.primary_role,
    roles: [form.primary_role, ...form.additional_roles],
    departments: form.departments
  });
  const previewLabels = previewLabelsForAccess(accessPreview);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(form);
      }}
    >
      <Field label="Full name">
        <input
          className="admin-input"
          value={form.full_name}
          onChange={(event) => setForm({ ...form, full_name: event.target.value })}
          required
        />
      </Field>
      <Field label="Email / username">
        <input
          className="admin-input"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
      </Field>

      <div>
        <span className="admin-label">Primary role</span>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Primary role">
          {primaryOptions.map((option) => {
            const selected = form.primary_role === option.value;
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
                onClick={() => setForm({ ...form, primary_role: option.value })}
              >
                <span className="block text-sm font-black">{ROLE_LABELS[option.value]}</span>
                <span className="mt-1 block text-xs leading-snug text-admin-muted">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <MultiSelectChips
        label="Additional roles"
        options={ADDITIONAL_ROLE_OPTIONS.filter((option) => creatableRoles.includes(option.value)).map((option) => ({
          value: option.value,
          label: ROLE_LABELS[option.value]
        }))}
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

      <div className="rounded-xl border border-admin-border bg-white/[0.03] p-4">
        <p className="text-sm font-bold text-white">Effective access preview</p>
        <p className="mt-1 text-xs text-admin-muted">Based on assigned roles — not a guess.</p>
        {previewLabels.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {previewLabels.map((label) => (
              <li key={label} className="admin-badge admin-badge--green">
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-admin-muted">No admin panel pages unlocked with current roles.</p>
        )}
      </div>

      <Field label="Temporary password">
        <input
          className="admin-input"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          required
        />
      </Field>
      <Field label="Confirm password">
        <input
          className="admin-input"
          type="password"
          value={form.confirm_password}
          onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
          required
        />
      </Field>

      <label className="admin-toggle-row">
        <span className="text-sm text-white">Force password change on next login</span>
        <button
          type="button"
          role="switch"
          aria-checked={form.force_password_change}
          className={`admin-toggle ${form.force_password_change ? "admin-toggle--on" : ""}`}
          onClick={() => setForm({ ...form, force_password_change: !form.force_password_change })}
        >
          <span className="admin-toggle__knob" />
        </button>
      </label>

      {!actorIsSuperAdmin ? (
        <p className="text-xs text-admin-muted">
          Super Admin accounts can only be created by a Super Admin. Management users may create operational staff roles.
        </p>
      ) : null}

      <div className="flex justify-end pt-2">
        <button type="submit" className="admin-btn-primary inline-flex items-center gap-2" disabled={busy}>
          <UserPlus className="h-4 w-4" /> {busy ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="admin-label">{label}</span>
      {children}
    </label>
  );
}
