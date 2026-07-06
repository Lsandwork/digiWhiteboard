"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, HelpCircle, Lock, RotateCcw, Search } from "lucide-react";
import {
  MATRIX_ROLE_KEYS,
  MATRIX_ROLE_LABELS,
  PERMISSION_CATEGORIES,
  type PermissionCategory
} from "@/lib/admin/permission-catalog";
import type { PermissionKey, RoleKey } from "@/lib/admin/permissions";
import type { RolePermissionMatrix } from "@/lib/admin/role-permission-matrix";
import { useToast } from "@/components/admin/ui/ToastProvider";

type MatrixPayload = {
  categories: typeof PERMISSION_CATEGORIES;
  roles: RoleKey[];
  matrix: RolePermissionMatrix;
  locked: Record<string, boolean>;
};

type SaveState = "saved" | "saving" | "unsaved" | "error";

function lockKey(role: RoleKey, permission: PermissionKey) {
  return `${role}:${permission}`;
}

export function UserGroupsPermissionsPage() {
  const { showToast } = useToast();
  const [payload, setPayload] = useState<MatrixPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/user-groups-permissions", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load permissions.");
      setPayload(body as MatrixPayload);
      setSaveState("saved");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load permissions.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return payload?.categories ?? [];
    return (payload?.categories ?? [])
      .map((category) => ({
        ...category,
        permissions: category.permissions.filter(
          (item) =>
            item.label.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            item.key.toLowerCase().includes(query) ||
            category.label.toLowerCase().includes(query)
        )
      }))
      .filter((category) => category.permissions.length > 0);
  }, [payload?.categories, search]);

  async function togglePermission(role: RoleKey, permission: PermissionKey, enabled: boolean) {
    if (!payload) return;
    if (payload.locked[lockKey(role, permission)]) return;

    const previous = payload.matrix;
    const optimistic: RolePermissionMatrix = {
      ...payload.matrix,
      [role]: {
        ...payload.matrix[role],
        [permission]: enabled
      }
    };

    setPayload({ ...payload, matrix: optimistic });
    setSaveState("saving");

    try {
      const response = await fetch("/api/admin/user-groups-permissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, permission, enabled })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Update failed.");
      setPayload({ ...payload, matrix: body.matrix as RolePermissionMatrix });
      setSaveState("saved");
      showToast("Permission updated.", "success");
    } catch (error) {
      setPayload({ ...payload, matrix: previous });
      setSaveState("error");
      showToast(error instanceof Error ? error.message : "Couldn't update permission. Try again.", "error");
    }
  }

  async function toggleCategoryAll(category: PermissionCategory, role: RoleKey, enabled: boolean) {
    if (!payload) return;
    const permissions = category.permissions
      .map((item) => item.key)
      .filter((permission) => !payload.locked[lockKey(role, permission)]);
    if (!permissions.length) return;

    const previous = payload.matrix;
    const optimistic: RolePermissionMatrix = {
      ...payload.matrix,
      [role]: { ...payload.matrix[role] }
    };
    for (const permission of permissions) {
      optimistic[role][permission] = enabled;
    }

    setPayload({ ...payload, matrix: optimistic });
    setSaveState("saving");

    try {
      const response = await fetch("/api/admin/user-groups-permissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, categoryPermissions: permissions, enabled, bulk: true })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Update failed.");
      setPayload({ ...payload, matrix: body.matrix as RolePermissionMatrix });
      setSaveState("saved");
      showToast("Permissions updated.", "success");
    } catch (error) {
      setPayload({ ...payload, matrix: previous });
      setSaveState("error");
      showToast("Couldn't update permissions. Try again.", "error");
    }
  }

  async function resetDefaults() {
    setSaveState("saving");
    try {
      const response = await fetch("/api/admin/user-groups-permissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetDefaults: true })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Reset failed.");
      setPayload((current) => (current ? { ...current, matrix: body.matrix } : current));
      setSaveState("saved");
      setResetOpen(false);
      showToast("Defaults restored.", "success");
    } catch (error) {
      setSaveState("error");
      showToast(error instanceof Error ? error.message : "Couldn't reset defaults.", "error");
    }
  }

  function categoryState(category: PermissionCategory, role: RoleKey): "all" | "none" | "mixed" {
    const values = category.permissions.map((item) => Boolean(payload?.matrix[role]?.[item.key]));
    if (values.every(Boolean)) return "all";
    if (values.every((value) => !value)) return "none";
    return "mixed";
  }

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "unsaved"
        ? "Unsaved changes"
        : saveState === "error"
          ? "Save failed"
          : "All changes saved";

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <p className="text-xs text-admin-muted">
            <Link href="/admin?tab=settings" className="hover:text-fitdog-orange">
              Settings
            </Link>
            <span className="mx-2">/</span>
            User Groups &amp; Permissions
          </p>
          <h2 className="admin-page-title">User Groups &amp; Permissions</h2>
          <p className="admin-page-subtitle">Manage what each role can access across the Fitdog admin system.</p>
        </div>
        <div className="admin-save-bar flex-wrap">
          <span
            className={`text-xs ${
              saveState === "error"
                ? "text-red-300"
                : saveState === "saving"
                  ? "text-amber-200"
                  : "text-admin-muted"
            }`}
          >
            {saveLabel}
          </span>
          <button type="button" className="admin-btn-secondary inline-flex items-center gap-2" onClick={() => setResetOpen(true)}>
            <RotateCcw className="h-4 w-4" /> Reset Defaults
          </button>
        </div>
      </header>

      <section className="admin-card p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
          <input
            className="admin-input pl-10"
            placeholder="Search permissions…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {loading ? (
        <div className="admin-card p-8 text-center text-admin-muted">Loading permissions matrix…</div>
      ) : (
        <div className="rbac-matrix-wrap admin-card p-0">
          <div className="rbac-matrix-scroll">
            <table className="rbac-matrix">
              <thead>
                <tr>
                  <th className="rbac-matrix-sticky-col rbac-matrix-sticky-head">Permission</th>
                  {MATRIX_ROLE_KEYS.map((role) => (
                    <th key={role} className="rbac-matrix-sticky-head">
                      <div className="rbac-role-head">
                        <span>{MATRIX_ROLE_LABELS[role] ?? role}</span>
                        {role === "super_admin" ? (
                          <span className="rbac-lock-hint" title="Super Admin always has full access.">
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((category) => {
                  const isCollapsed = collapsed[category.key] ?? false;
                  return (
                    <CategoryBlock
                      key={category.key}
                      category={category}
                      collapsed={isCollapsed}
                      onToggleCollapse={() =>
                        setCollapsed((current) => ({ ...current, [category.key]: !isCollapsed }))
                      }
                      payload={payload}
                      categoryState={categoryState}
                      onToggleAll={toggleCategoryAll}
                      onTogglePermission={togglePermission}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resetOpen ? (
        <div className="admin-modal-backdrop">
          <div className="admin-card max-w-md p-5">
            <h3 className="text-lg font-bold text-white">Reset permission defaults?</h3>
            <p className="mt-2 text-sm text-admin-muted">
              This restores the default role permissions. Super Admin permissions stay fully enabled.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="admin-btn-secondary" onClick={() => setResetOpen(false)}>
                Cancel
              </button>
              <button type="button" className="admin-btn-danger" onClick={() => void resetDefaults()}>
                Reset defaults
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CategoryBlock({
  category,
  collapsed,
  onToggleCollapse,
  payload,
  categoryState,
  onToggleAll,
  onTogglePermission
}: {
  category: PermissionCategory;
  collapsed: boolean;
  onToggleCollapse: () => void;
  payload: MatrixPayload | null;
  categoryState: (category: PermissionCategory, role: RoleKey) => "all" | "none" | "mixed";
  onToggleAll: (category: PermissionCategory, role: RoleKey, enabled: boolean) => void;
  onTogglePermission: (role: RoleKey, permission: PermissionKey, enabled: boolean) => void;
}) {
  return (
    <>
      <tr className="rbac-category-row">
        <td colSpan={MATRIX_ROLE_KEYS.length + 1}>
          <button type="button" className="rbac-category-toggle" onClick={onToggleCollapse}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span>{category.label}</span>
          </button>
        </td>
      </tr>
      {!collapsed ? (
        <>
          <tr className="rbac-all-row">
            <td className="rbac-matrix-sticky-col font-semibold text-admin-muted">All</td>
            {MATRIX_ROLE_KEYS.map((role) => {
              const state = categoryState(category, role);
              const lockedAll = category.permissions.every(
                (item) => payload?.locked[lockKey(role, item.key)]
              );
              return (
                <td key={`${category.key}-all-${role}`} className="text-center">
                  <MatrixCheckbox
                    checked={state === "all"}
                    indeterminate={state === "mixed"}
                    disabled={lockedAll}
                    title={
                      role === "super_admin"
                        ? "Super Admin always has full access."
                        : role === "admin"
                          ? "Some permissions are Super Admin only."
                          : undefined
                    }
                    onChange={(enabled) => void onToggleAll(category, role, enabled)}
                  />
                </td>
              );
            })}
          </tr>
          {category.permissions.map((permission) => (
            <tr key={permission.key} className="rbac-permission-row">
              <td className="rbac-matrix-sticky-col">
                <div className="rbac-permission-label">
                  <span>{permission.label}</span>
                  <span className="rbac-help" title={permission.description}>
                    <HelpCircle className="h-3.5 w-3.5" />
                  </span>
                </div>
              </td>
              {MATRIX_ROLE_KEYS.map((role) => {
                const locked = Boolean(payload?.locked[lockKey(role, permission.key)]);
                const checked = Boolean(payload?.matrix[role]?.[permission.key]);
                return (
                  <td key={`${permission.key}-${role}`} className="text-center">
                    <MatrixCheckbox
                      checked={checked}
                      disabled={locked}
                      title={
                        locked
                          ? role === "super_admin"
                            ? "Super Admin always has full access."
                            : "Only Super Admin can manage this permission."
                          : permission.description
                      }
                      onChange={(enabled) => void onTogglePermission(role, permission.key, enabled)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </>
      ) : null}
    </>
  );
}

function MatrixCheckbox({
  checked,
  indeterminate,
  disabled,
  title,
  onChange
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      disabled={disabled}
      title={title}
      className={`rbac-checkbox ${checked && !disabled ? "rbac-checkbox--on" : ""} ${indeterminate ? "rbac-checkbox--mixed" : ""} ${
        disabled ? "rbac-checkbox--locked" : ""
      }`}
      onClick={() => {
        if (disabled) return;
        onChange(indeterminate ? true : !checked);
      }}
    >
      {disabled ? <Lock className="h-3 w-3" /> : indeterminate ? <span className="rbac-checkbox-dash" /> : null}
    </button>
  );
}
