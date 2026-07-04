import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/AdminLogin";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="admin-theme grid min-h-screen place-items-center text-white">Loading…</main>}>
      <AdminLogin />
    </Suspense>
  );
}
