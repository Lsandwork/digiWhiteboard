"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  title: string;
  category: string;
  approved_statement: string;
  public_use_allowed: boolean;
  status: string;
};

export function BlogKnowledgePanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("daycare");
  const [approvedStatement, setApprovedStatement] = useState("");
  const [publicUseAllowed, setPublicUseAllowed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/blog/knowledge");
    const json = await res.json();
    if (res.ok) setEntries(json.entries || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/blog/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, approvedStatement, publicUseAllowed })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || "Failed");
      return;
    }
    setTitle("");
    setApprovedStatement("");
    setMessage("Knowledge entry saved. Agents may only use approved statements.");
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Fitdog Knowledge Base</h2>
        <p className="text-sm text-slate-600">Never invent Fitdog facts. Only approved entries may inform public content.</p>
      </div>
      <form onSubmit={create} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <input className="w-full rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="w-full rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <textarea className="w-full rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" rows={4} placeholder="Approved statement" value={approvedStatement} onChange={(e) => setApprovedStatement(e.target.value)} required />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={publicUseAllowed} onChange={(e) => setPublicUseAllowed(e.target.checked)} />
          Approved for public use
        </label>
        <button type="submit" className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white">
          Add approved knowledge
        </button>
      </form>
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
            <p className="font-medium">
              {entry.title} <span className="text-xs text-slate-500">({entry.category})</span>
            </p>
            <p className="mt-1 text-slate-700 dark:text-slate-300">{entry.approved_statement}</p>
            <p className="mt-1 text-xs text-slate-500">
              {entry.public_use_allowed ? "Public use allowed" : "Internal only"} · {entry.status}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
