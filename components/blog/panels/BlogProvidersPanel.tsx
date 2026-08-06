"use client";

import { useEffect, useState } from "react";

export function BlogProvidersPanel() {
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/blog/providers");
      const json = await res.json();
      if (res.ok) setProviders(json.providers);
    })();
  }, []);

  async function test(provider: string) {
    setTestResult("Testing…");
    const res = await fetch("/api/blog/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider })
    });
    const json = await res.json();
    setTestResult(`${provider}: ${json.status}${json.detail ? ` — ${json.detail}` : ""}`);
  }

  return (
    <div className="blog-dash-panel space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">AI Providers</h2>
        <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">
          Keys are server-only environment variables. Never paste secrets into the browser. Cursor API keys must be entered
          manually in your host env (Vercel) — this app cannot create or retrieve a Cursor key.
        </p>
      </div>
      <div className="blog-dash-form-panel text-sm">
        <pre className="overflow-auto rounded-lg bg-[#f8f9fb] p-4 text-xs text-[var(--fitdog-heading,#121417)]">{JSON.stringify(providers, null, 2)}</pre>
        <div className="flex flex-wrap gap-2">
          {["gemini", "openai", "anthropic", "perplexity", "cursor"].map((provider) => (
            <button key={provider} type="button" onClick={() => void test(provider)} className="blog-dash-toolbar-btn px-3 py-2">
              Test {provider}
            </button>
          ))}
        </div>
        {testResult ? <p className="text-emerald-800">{testResult}</p> : null}
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Cursor API key setup</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Obtain a Cursor API key from your Cursor account settings (manually).</li>
          <li>Add <code>CURSOR_API_KEY</code> as a protected server env var in Vercel.</li>
          <li>Redeploy. Use “Test cursor” here — statuses: connected / invalid_credentials / not_configured / service_unavailable.</li>
          <li>Do not rely on Cursor as the only article writer unless official API capabilities support it.</li>
        </ol>
      </div>
    </div>
  );
}
