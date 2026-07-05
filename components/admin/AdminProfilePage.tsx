"use client";

import { FormEvent, useState } from "react";
import { KeyRound, UserRound } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";

type AdminProfilePageProps = {
  username: string;
  role?: string | null;
  displayLabel?: string | null;
};

export function AdminProfilePage({ username, role, displayLabel }: AdminProfilePageProps) {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/change-own-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirm_password: confirmPassword })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update password.");
      setPassword("");
      setConfirmPassword("");
      showToast("Password updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update password.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Settings</h2>
          <p className="admin-page-subtitle">Manage your personal profile and account security.</p>
        </div>
      </header>

      <section className="crossover-card p-5">
        <div className="flex items-center gap-3">
          <div className="crossover-icon-tile h-12 w-12 text-[var(--crossover-gold)]">
            <UserRound className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h3 className="crossover-card__title">Profile</h3>
            <p className="crossover-card__subtitle">Your account details for the Team Lead panel.</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <dt className="admin-label">Email / Username</dt>
            <dd className="mt-1 text-sm font-bold text-white">{username}</dd>
          </div>
          <div>
            <dt className="admin-label">Role</dt>
            <dd className="mt-1 text-sm font-bold text-white">{displayLabel ?? role ?? "Team Lead"}</dd>
          </div>
        </dl>
      </section>

      <section className="crossover-card p-5">
        <div className="flex items-center gap-3">
          <div className="crossover-icon-tile h-12 w-12 text-[var(--crossover-gold)]">
            <KeyRound className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h3 className="crossover-card__title">Change Password</h3>
            <p className="crossover-card__subtitle">Update your login password for the admin dashboard.</p>
          </div>
        </div>
        <form className="mt-5 grid gap-4 md:max-w-lg" onSubmit={(event) => void changePassword(event)}>
          <label className="grid gap-2">
            <span className="admin-label">New password</span>
            <input type="password" className="crossover-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="grid gap-2">
            <span className="admin-label">Confirm password</span>
            <input type="password" className="crossover-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <div>
            <button type="submit" className="admin-btn-primary" disabled={busy || !password || !confirmPassword}>
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
