"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Invalid username or password.");

      if (body.forcePasswordChange && body.adminUserId) {
        setMustChangePassword(true);
        setAdminUserId(body.adminUserId);
        return;
      }

      const next = searchParams.get("next") || "/admin";
      router.replace(next);
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Invalid username or password.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    if (!adminUserId) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${adminUserId}/change-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: newPassword,
          confirm_password: confirmPassword,
          force_password_change: false
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update password.");

      const next = searchParams.get("next") || "/admin";
      router.replace(next);
      router.refresh();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Unable to update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-theme grid min-h-screen place-items-center p-6">
      <form onSubmit={mustChangePassword ? submitPasswordChange : submit} className="admin-card w-full max-w-md rounded-2xl p-8">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Image src="/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-circle-badge-512.png" alt="Fitdog" width={72} height={72} className="rounded-full ring-2 ring-fitdog-orange/40" />
          <div>
            <h1 className="text-2xl font-black text-white">{mustChangePassword ? "Set New Password" : "Fitdog Admin"}</h1>
            <p className="mt-1 text-sm text-admin-muted">
              {mustChangePassword
                ? "Your temporary password must be changed before you can continue."
                : "Sign in to manage your digital whiteboards."}
            </p>
          </div>
        </div>

        {mustChangePassword ? (
          <>
            <label className="admin-label" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="admin-input mb-4"
              autoComplete="new-password"
            />

            <label className="admin-label" htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="admin-input mb-4"
              autoComplete="new-password"
            />
          </>
        ) : (
          <>
            <label className="admin-label" htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="admin-input mb-4" autoComplete="username" />

            <label className="admin-label" htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="admin-input mb-4" autoComplete="current-password" />
          </>
        )}

        {error ? <p className="admin-error mb-4">{error}</p> : null}

        <button type="submit" className="admin-btn-primary w-full" disabled={busy}>
          {busy ? (mustChangePassword ? "Updating..." : "Signing in...") : mustChangePassword ? "Update Password" : "Sign In"}
        </button>

        {mustChangePassword ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-admin-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-fitdog-orange" />
            Temporary passwords must be replaced before dashboard access is granted.
          </p>
        ) : null}
      </form>
    </main>
  );
}
