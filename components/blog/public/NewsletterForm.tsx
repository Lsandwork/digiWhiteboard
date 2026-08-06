"use client";

import { useState } from "react";

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/blog/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Subscription failed");
      setStatus("success");
      setMessage(json.message || "You are subscribed.");
      setEmail("");
      setConsent(false);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Subscription failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className={compact ? "space-y-3" : "space-y-3"}>
      <label className="block">
        <span className="sr-only">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="w-full rounded-md border border-white/40 bg-white px-3 py-2 text-sm text-[var(--fitdog-dark)]"
          autoComplete="email"
        />
      </label>
      <label className="flex items-start gap-2 text-xs text-white/95">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-0.5" />
        <span>I agree to receive Fitdog tips and updates. I can unsubscribe anytime.</span>
      </label>
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-[var(--fitdog-dark)] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {status === "loading" ? "Subscribing…" : "Subscribe"}
      </button>
      {message ? (
        <p className={`text-xs ${status === "error" ? "text-yellow-100" : "text-white"}`} role="status">
          {message}
        </p>
      ) : null}
      <p className="text-[11px] text-white/80">We never sell your email. See Fitdog’s privacy practices on fitdog.com.</p>
    </form>
  );
}
