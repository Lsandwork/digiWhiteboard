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
    <div className="blog-dash-panel space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">Fitdog Knowledge Base</h2>
        <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">Never invent Fitdog facts. Only approved entries may inform public content.</p>
      </div>
      <form onSubmit={create} className="blog-dash-form-panel">
        <input className="blog-dash-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="blog-dash-input" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <textarea className="blog-dash-textarea" rows={6} placeholder="Approved statement" value={approvedStatement} onChange={(e) => setApprovedStatement(e.target.value)} required />
        <label className="flex items-center gap-2 text-sm text-[var(--fitdog-heading,#121417)]">
          <input type="checkbox" checked={publicUseAllowed} onChange={(e) => setPublicUseAllowed(e.target.checked)} />
          Approved for public use
        </label>
        <button type="submit" className="blog-dash-toolbar-btn blog-dash-toolbar-btn--success w-fit">
          Add approved knowledge
        </button>
      </form>
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="blog-dash-side-card text-sm">
            <p className="font-medium text-[var(--fitdog-heading,#121417)]">
              {entry.title} <span className="text-xs text-[var(--fitdog-muted,#6b7280)]">({entry.category})</span>
            </p>
            <p className="mt-1 text-[var(--fitdog-body,#2f363d)]">{entry.approved_statement}</p>
            <p className="mt-1 text-xs text-[var(--fitdog-muted,#6b7280)]">
              {entry.public_use_allowed ? "Public use allowed" : "Internal only"} · {entry.status}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
