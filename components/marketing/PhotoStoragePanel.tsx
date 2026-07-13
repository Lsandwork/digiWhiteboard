"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/ui/ToastProvider";

export function PhotoStoragePanel() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [dog, setDog] = useState("");
  const [approvalState, setApprovalState] = useState("");
  const [fileType, setFileType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dog) params.set("dog", dog);
    if (approvalState) params.set("approvalState", approvalState);
    if (fileType) params.set("fileType", fileType);
    const response = await fetch(`/api/marketing/storage?${params}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Unable to load media.", "error");
    else setItems(body.items ?? []);
    setLoading(false);
  }, [approvalState, dog, fileType, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateItem(id: string, patch: Record<string, unknown>) {
    const response = await fetch("/api/marketing/storage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch })
    });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Update failed.", "error");
    else await load();
  }

  async function downloadItem(id: string) {
    const response = await fetch("/api/marketing/storage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "download", id })
    });
    const body = await response.json();
    if (!response.ok) return showToast(body.error ?? "Download failed.", "error");
    window.open(body.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="marketing-card">
      <div className="marketing-card__header">
        <h2 className="marketing-card__title">Photo Storage</h2>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <input placeholder="Dog" value={dog} onChange={(e) => setDog(e.target.value)} className="rounded-lg border px-3 py-2" />
        <select value={approvalState} onChange={(e) => setApprovalState(e.target.value)} className="rounded-lg border px-3 py-2">
          <option value="">All approval states</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={fileType} onChange={(e) => setFileType(e.target.value)} className="rounded-lg border px-3 py-2">
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <button type="button" className="marketing-btn marketing-btn--secondary" onClick={() => void load()}>Search</button>
      </div>
      {loading ? <div className="marketing-empty">Loading media library…</div> : null}
      {!loading && !items.length ? <div className="marketing-empty">No media found.</div> : null}
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <article key={String(item.id)} className="rounded-xl border p-3">
            <p className="font-semibold">{String(item.display_title ?? item.file_name)}</p>
            <p className="text-sm text-slate-500">{String(item.mime_type)} · {String(item.approval_state)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="marketing-btn marketing-btn--secondary" onClick={() => void downloadItem(String(item.id))}>Download</button>
              <button type="button" className="marketing-btn marketing-btn--secondary" onClick={() => void updateItem(String(item.id), { approval_state: "approved" })}>Approve</button>
              <button type="button" className="marketing-btn marketing-btn--secondary" onClick={() => void updateItem(String(item.id), { is_archived: true })}>Archive</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
