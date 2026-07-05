"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { DEMO_ROLE_OPTIONS } from "@/lib/demo/constants";
import { ADMIN_SIDEBAR_ROLE_LABELS, type AdminUserRole } from "@/lib/admin/users";

type Props = {
  currentRole: string;
  onSwitched: () => void;
};

export function DemoRoleSwitcher({ currentRole, onSwitched }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const label =
    currentRole in ADMIN_SIDEBAR_ROLE_LABELS
      ? ADMIN_SIDEBAR_ROLE_LABELS[currentRole as AdminUserRole]
      : currentRole.replace(/_/g, " ");

  async function switchRole(role: string) {
    if (role === currentRole) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/demo/switch-role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to switch role.");
      setOpen(false);
      onSwitched();
    } catch {
      // ignore — page reload onSwitched handles refresh
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="demo-role-switcher">
      <button
        type="button"
        className="demo-role-switcher__trigger"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <Users className="h-4 w-4" aria-hidden />
        <span>Demo Role: {label}</span>
      </button>

      {open ? (
        <>
          <button type="button" className="demo-role-switcher__backdrop" aria-label="Close role menu" onClick={() => setOpen(false)} />
          <div className="demo-role-switcher__menu" role="menu">
            <p className="demo-role-switcher__menu-title">Switch demo role</p>
            <p className="demo-role-switcher__menu-copy">Preview each panel view. Changes are not saved.</p>
            {DEMO_ROLE_OPTIONS.map((role) => (
              <button
                key={role.value}
                type="button"
                role="menuitem"
                className={`demo-role-switcher__item ${currentRole === role.value ? "demo-role-switcher__item--active" : ""}`}
                disabled={busy}
                onClick={() => void switchRole(role.value)}
              >
                {role.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
