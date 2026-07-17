import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/AdminLogin";

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="login-screen grid min-h-screen place-items-center text-[var(--text-primary)]">
          Loading…
        </main>
      }
    >
      <AdminLogin />
    </Suspense>
  );
}
