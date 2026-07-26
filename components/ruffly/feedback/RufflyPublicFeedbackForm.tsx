"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Destination = { id: string; label: string; url: string };

export function RufflyPublicFeedbackForm({ token }: { token: string }) {
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/ruffly/public/feedback?token=${encodeURIComponent(token)}`);
      const body = await res.json();
      if (res.ok) setDestinations(body.destinations ?? []);
      else setError(body.error ?? "This link is invalid or expired.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ruffly/public/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, rating, feedback })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Unable to submit.");
      setDestinations(body.destinations ?? destinations);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(160deg,#fff8f3,#fff)] px-4 py-12 text-[#1f2933]">
      <div className="mx-auto max-w-lg rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
        <Image src="/ruffly/icon.svg" alt="Ruffly" width={48} height={48} className="mb-4" />
        <h1 className="text-2xl font-semibold">Private Fitdog feedback</h1>
        <p className="mt-2 text-sm text-slate-600">
          Share private feedback with our team. Public review options stay available for every rating — we never hide
          them.
        </p>
        {error ? <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        {!submitted ? (
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Rating
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {value} star{value === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Comments
              <textarea
                className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 px-3 py-2"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="w-full rounded-xl bg-[#ff6f26] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Submit feedback
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-slate-700">Thank you — your private feedback was received.</p>
            {destinations.map((destination) => (
              <a
                key={destination.id}
                href={destination.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#ff6f26]"
              >
                {destination.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
