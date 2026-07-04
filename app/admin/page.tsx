import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";

export default function AdminPage() {
  return (
    <ToastProvider>
      <Suspense fallback={<main className="admin-theme grid min-h-screen place-items-center text-white">Loading…</main>}>
        <AdminDashboard />
      </Suspense>
    </ToastProvider>
  );
}
