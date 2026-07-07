"use client";

import { useCallback, useEffect, useState } from "react";
import {
  accessFromLegacyRole,
  isSuperAdminAccess,
  isSuperAdminLegacyRole,
  type UserAccess
} from "@/lib/admin/permissions";
import { CreateAdminUserForm } from "@/components/admin/CreateAdminUserForm";
import { useToast } from "@/components/admin/ui/ToastProvider";

type SessionPayload = {
  access?: UserAccess | null;
  role?: string | null;
  adminUserId?: string | null;
};

export function StaffCreateUserPage() {
  const { showToast } = useToast();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load session.");
      setSession(body as SessionPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load session.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const access =
    session?.access ??
    accessFromLegacyRole(session?.adminUserId ?? null, null, session?.role ?? null);
  const actorIsSuperAdmin =
    isSuperAdminLegacyRole(session?.role) || isSuperAdminAccess(access);

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Create User</h2>
          <p className="admin-page-subtitle">
            Add a new dashboard login with a role, departments, and temporary password.
          </p>
        </div>
      </header>

      <section className="admin-card p-5">
        {loading ? (
          <p className="text-sm text-admin-muted">Loading…</p>
        ) : (
          <CreateAdminUserForm
            actorAccess={access}
            actorLegacyRole={session?.role}
            actorIsSuperAdmin={actorIsSuperAdmin}
            busy={busy}
            onSubmit={async (payload) => {
              setBusy(true);
              try {
                const response = await fetch("/api/admin/users", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(payload)
                });
                const body = await response.json();
                if (!response.ok) throw new Error(body.error ?? "Unable to create user.");
                showToast("User created.", "success");
              } catch (error) {
                showToast(error instanceof Error ? error.message : "Unable to create user.", "error");
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </section>
    </div>
  );
}
