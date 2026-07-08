"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith("/display/")) return;

    const reloadTimer = window.setTimeout(() => {
      window.location.reload();
    }, 10_000);

    return () => window.clearTimeout(reloadTimer);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#02060b] px-6 text-center text-white">
      <div className="max-w-md">
        <p className="text-5xl" aria-hidden>
          !
        </p>
        <h1 className="mt-4 text-3xl font-black">Board failed to load</h1>
        <p className="mt-3 text-base text-slate-300">Try reloading the page. If this keeps happening, clear Safari cache for this site.</p>
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
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
                return;
              }
              reset();
            }}
            className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white"
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
