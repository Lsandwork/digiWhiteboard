"use client";

import { useEffect } from "react";

export default function LobbyCheckoutsError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#02060b] px-6 text-center text-white">
      <div className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-[#64B9DC]">Fitdog Lobby</p>
        <h1 className="mt-4 text-4xl font-black">Checkout board is reconnecting</h1>
        <p className="mt-3 text-base text-slate-300">
          The lobby checkout display hit a temporary loading issue. Reload the board to reconnect to live checkout data.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-950"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white"
          >
            Reload board
          </button>
        </div>
      </div>
    </main>
  );
}
