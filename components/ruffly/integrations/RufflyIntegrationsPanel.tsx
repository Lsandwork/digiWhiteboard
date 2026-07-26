"use client";

import { useCallback, useEffect, useState } from "react";

type Integration = {
  provider: string;
  displayName: string;
  status: string;
  configured: boolean;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  test?: { ok: boolean; message: string } | null;
};

export function RufflyIntegrationsPanel({ enabled = true }: { enabled?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Integration[]>([]);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ruffly/integrations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load integrations.");
      setItems(body.integrations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function testProvider(provider: string) {
    setBusyProvider(provider);
    setError(null);
    try {
      const response = await fetch("/api/ruffly/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test", provider })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? body.message ?? "Test failed.");
      setResults((current) => ({
        ...current,
        [provider]: { ok: Boolean(body.ok), message: String(body.message || (body.ok ? "OK" : "Failed")) }
      }));
      await load();
    } catch (err) {
      setResults((current) => ({
        ...current,
        [provider]: { ok: false, message: err instanceof Error ? err.message : "Test failed." }
      }));
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#1f2933]">Integrations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Test provider connections. Secrets are never shown after save. Approve each channel only after a successful
            test, then enable its sending flag in Vercel.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">
          Refresh
        </button>
      </div>

      {!enabled ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ruffly module flag is off in this environment.
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const result = results[item.provider];
            return (
              <article key={item.provider} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#1f2933]">{item.displayName}</h3>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{item.status.replaceAll("_", " ")}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                      item.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {item.configured ? "Credentials present" : "Setup required"}
                  </span>
                </div>
                {result ? (
                  <p className={`mt-3 text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyProvider === item.provider}
                    onClick={() => void testProvider(item.provider)}
                    className="rounded-xl bg-[#ff6f26] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busyProvider === item.provider ? "Testing…" : "Test connection"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        After a successful test, enable only that channel’s env flag (`RUFFLY_SENDING_SMS_ENABLED`,
        `RUFFLY_SENDING_EMAIL_ENABLED`, `RUFFLY_WEBCHAT_ENABLED`, etc.). Do not enable Gingr booking advertising — Ruffly
        does not create Gingr reservations yet.
      </div>
    </div>
  );
}
