"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fitdog-admin-error]", error);
  }, [error]);

  return (
    <main className="admin-theme grid min-h-screen place-items-center bg-[#02060b] px-6 text-center text-white">
      <div className="max-w-md">
        <h1 className="text-3xl font-black">Something went wrong</h1>
        <p className="mt-3 text-base text-slate-300">
          The admin dashboard hit a temporary error. Reload to continue — you will not be signed out.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-950"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
