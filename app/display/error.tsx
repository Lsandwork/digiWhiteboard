"use client";

import { useEffect, useState } from "react";

const AUTO_RELOAD_MS = 8_000;

export default function DisplayError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(AUTO_RELOAD_MS / 1000));

  useEffect(() => {
    console.error("[display]", error);
  }, [error]);

  useEffect(() => {
    const reloadTimer = window.setTimeout(() => {
      window.location.reload();
    }, AUTO_RELOAD_MS);

    const countdownTimer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(reloadTimer);
      window.clearInterval(countdownTimer);
    };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-[#02060b] px-6 text-center text-white">
      <div className="max-w-lg">
        <p className="text-5xl" aria-hidden>
          !
        </p>
        <h1 className="mt-4 text-3xl font-black">Display reconnecting</h1>
        <p className="mt-3 text-base text-slate-300">
          The digital whiteboard hit a temporary error. Reloading automatically in {secondsLeft}s to keep the TV awake.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-950"
          >
            Reload now
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
