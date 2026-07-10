"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
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

type CreatedUser = {
  full_name: string;
  email: string;
};

export function StaffCreateUserPage() {
  const { showToast } = useToast();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formResetVersion, setFormResetVersion] = useState(0);
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);

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
            Add a new dashboard login with a role, departments, and temporary password. New accounts
            appear in{" "}
            <Link href="/admin?board=lobby&tab=users" className="text-fitdog-orange hover:underline">
              User Accounts
            </Link>
            , not Staff Directory.
          </p>
        </div>
      </header>

      {createdUser ? (
        <section className="admin-card flex flex-col gap-3 border-emerald-400/30 bg-emerald-400/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
            <div>
              <p className="font-bold text-white">User created</p>
              <p className="mt-1 text-sm text-emerald-100/90">
                {createdUser.full_name} ({createdUser.email}) can sign in with the temporary password
                you set.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin?board=lobby&tab=users" className="admin-btn-primary">
              Open User Accounts
            </Link>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => {
                setCreatedUser(null);
                setFormResetVersion((version) => version + 1);
              }}
            >
              Create another
            </button>
          </div>
        </section>
      ) : null}

      <section className="admin-card p-5">
        {loading ? (
          <p className="text-sm text-admin-muted">Loading…</p>
        ) : createdUser ? null : (
          <CreateAdminUserForm
            actorAccess={access}
            actorLegacyRole={session?.role}
            actorIsSuperAdmin={actorIsSuperAdmin}
            busy={busy}
            formResetVersion={formResetVersion}
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
                const full_name = String(payload.full_name ?? "").trim();
                const email = String(payload.email ?? "").trim();
                setCreatedUser({ full_name, email });
                setFormResetVersion((version) => version + 1);
                showToast("User created. Open User Accounts to review the new login.", "success");
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
