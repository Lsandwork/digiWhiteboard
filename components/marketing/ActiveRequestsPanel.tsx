"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MARKETING_DESTINATION_LABELS, MARKETING_REQUEST_TYPE_LABELS } from "@/lib/marketing/constants";
import { MarketingStatusBadge } from "@/components/marketing/MarketingStatusBadge";
import { useToast } from "@/components/admin/ui/ToastProvider";

type RequestRow = Record<string, unknown>;

export function ActiveRequestsPanel() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dog, setDog] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "25", activeOnly: status ? "0" : "1" });
    if (status) params.set("status", status);
    if (dog) params.set("dog", dog);
    const response = await fetch(`/api/marketing/requests?${params}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      showToast(body.error ?? "Unable to load requests.", "error");
      setLoading(false);
      return;
    }
    setRows(body.requests ?? []);
    setTotal(body.total ?? 0);
    setLoading(false);
  }, [dog, showToast, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action(requestId: string, actionName: string) {
    setBusyId(requestId);
    try {
      const response = await fetch("/api/marketing/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: actionName, requestId })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Action failed.");
      showToast("Request updated.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Action failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="marketing-card">
      <div className="marketing-card__header">
        <h2 className="marketing-card__title">Active Media Requests ({total})</h2>
        <Link href="/marketing/media-push" className="marketing-btn marketing-btn--primary">Request a Dog</Link>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <input placeholder="Filter by dog" value={dog} onChange={(e) => setDog(e.target.value)} className="rounded-lg border px-3 py-2" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border px-3 py-2">
          <option value="">Active queue</option>
          <option value="awaiting_handler">Awaiting Handler</option>
          <option value="dog_ready">Dog Ready</option>
          <option value="in_session">In Session</option>
          <option value="completed">Completed</option>
          <option value="canceled">Canceled</option>
        </select>
        <button type="button" className="marketing-btn marketing-btn--secondary" onClick={() => void load()}>Apply filters</button>
      </div>
      {loading ? <div className="marketing-empty">Loading requests…</div> : null}
      {!loading && !rows.length ? <div className="marketing-empty">No requests match these filters.</div> : null}
      {!loading && rows.length ? (
        <table className="marketing-table">
          <thead>
            <tr>
              <th>Dog</th>
              <th>Type</th>
              <th>Destination</th>
              <th>Requested by</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <div className="marketing-dog-chip">
                    {row.dog_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(row.dog_photo_url)} alt="" />
                    ) : (
                      <div className="marketing-dog-chip__fallback">{String(row.dog_name).charAt(0)}</div>
                    )}
                    <span>{String(row.dog_name)}</span>
                  </div>
                </td>
                <td>{MARKETING_REQUEST_TYPE_LABELS[row.request_type as keyof typeof MARKETING_REQUEST_TYPE_LABELS] ?? String(row.request_type)}</td>
                <td>{MARKETING_DESTINATION_LABELS[row.destination as keyof typeof MARKETING_DESTINATION_LABELS] ?? String(row.destination)}</td>
                <td>{String(row.requested_by_name ?? row.requested_by_email ?? "—")}</td>
                <td><MarketingStatusBadge status={String(row.status)} /></td>
                <td className="flex flex-wrap gap-2">
                  <button type="button" className="marketing-btn marketing-btn--secondary" disabled={busyId === String(row.id)} onClick={() => void action(String(row.id), "mark_in_session")}>In Session</button>
                  <button type="button" className="marketing-btn marketing-btn--secondary" disabled={busyId === String(row.id)} onClick={() => void action(String(row.id), "complete")}>Complete</button>
                  <button type="button" className="marketing-btn marketing-btn--secondary" disabled={busyId === String(row.id)} onClick={() => void action(String(row.id), "resend")}>Resend</button>
                  <button type="button" className="marketing-btn marketing-btn--secondary" disabled={busyId === String(row.id)} onClick={() => void action(String(row.id), "cancel")}>Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
