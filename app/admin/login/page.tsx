import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/AdminLogin";

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="login-screen grid min-h-screen place-items-center px-4 text-[var(--text-primary)]">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/30 p-6 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-admin-muted">Fitdog RuffOps</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Operations Login</h1>
            <p className="mt-2 text-sm text-admin-muted">Loading secure sign-in…</p>
          </div>
        </main>
      }
    >
      <AdminLogin />
    </Suspense>
  );
}
