"use client";

import { useEffect, useState } from "react";

type Media = {
  id: string;
  public_url?: string | null;
  source_class: string;
  approval_status: string;
  alt_text: string;
  photographer?: string | null;
  license_notes?: string;
};

export function BlogMediaPanel({ approvalsOnly }: { approvalsOnly?: boolean }) {
  const [media, setMedia] = useState<Media[]>([]);
  const [publicUrl, setPublicUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [sourceClass, setSourceClass] = useState("fitdog_owned");
  const [licenseNotes, setLicenseNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const qs = approvalsOnly ? "?approval=pending" : "";
    const res = await fetch(`/api/blog/media${qs}`);
    const json = await res.json();
    if (res.ok) setMedia(json.media || []);
  }

  useEffect(() => {
    void load();
  }, [approvalsOnly]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/blog/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicUrl, altText, sourceClass, licenseNotes })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || "Failed");
      return;
    }
    setPublicUrl("");
    setAltText("");
    setMessage("Media recorded as pending approval. AI images remain disabled by default.");
    await load();
  }

  async function approve(id: string, approvalStatus: "approved" | "rejected") {
    const res = await fetch("/api/blog/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approvalStatus })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || "Failed");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{approvalsOnly ? "Image Approvals" : "Media Library"}</h2>
        <p className="text-sm text-slate-600">
          Prefer Fitdog-owned photography. AI-generated images are off by default and never presented as real Fitdog photos.
        </p>
      </div>
      {!approvalsOnly ? (
        <form onSubmit={create} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <input className="w-full rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" placeholder="Public URL (approved storage/CDN)" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} required />
          <input className="w-full rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" placeholder="Alt text" value={altText} onChange={(e) => setAltText(e.target.value)} />
          <select className="w-full rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" value={sourceClass} onChange={(e) => setSourceClass(e.target.value)}>
            <option value="fitdog_owned">Fitdog-owned</option>
            <option value="member_submitted">Member-submitted with consent</option>
            <option value="employee_submitted">Employee-submitted</option>
            <option value="licensed_stock">Licensed stock</option>
            <option value="photographer_licensed">Photographer-licensed</option>
            <option value="partner_provided">Partner-provided</option>
          </select>
          <textarea className="w-full rounded border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" rows={2} placeholder="License / consent notes" value={licenseNotes} onChange={(e) => setLicenseNotes(e.target.value)} />
          <button type="submit" className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white">
            Add media record
          </button>
        </form>
      ) : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      <ul className="space-y-2">
        {media.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
            <div>
              <p className="font-medium">{item.source_class} · {item.approval_status}</p>
              <p className="text-slate-600">{item.alt_text || "No alt text"}</p>
              {item.public_url ? (
                <a href={item.public_url} className="text-emerald-700 hover:underline" target="_blank" rel="noreferrer">
                  Open image
                </a>
              ) : null}
            </div>
            {item.approval_status === "pending" ? (
              <div className="flex gap-2">
                <button type="button" className="rounded bg-emerald-700 px-2 py-1 text-white" onClick={() => void approve(item.id, "approved")}>
                  Approve
                </button>
                <button type="button" className="rounded border px-2 py-1" onClick={() => void approve(item.id, "rejected")}>
                  Reject
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
