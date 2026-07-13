"use client";

import { useCallback, useEffect, useState } from "react";
import { MARKETING_CAMPAIGN_STATUS_LABELS } from "@/lib/marketing/constants";
import { useToast } from "@/components/admin/ui/ToastProvider";

export function CampaignsPanel() {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/marketing/campaigns", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Unable to load campaigns.", "error");
    else setCampaigns(body.campaigns ?? []);
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createCampaign() {
    const response = await fetch("/api/marketing/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, startDate, endDate })
    });
    const body = await response.json();
    if (!response.ok) return showToast(body.error ?? "Unable to create campaign.", "error");
    setName("");
    setDescription("");
    showToast("Campaign created.", "success");
    await load();
  }

  return (
    <div className="marketing-grid-2">
      <section className="marketing-card">
        <h2 className="marketing-card__title mb-4">Albums & Campaigns</h2>
        {loading ? <div className="marketing-empty">Loading campaigns…</div> : null}
        {!loading && !campaigns.length ? <div className="marketing-empty">No campaigns yet.</div> : null}
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <article key={String(campaign.id)} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <strong>{String(campaign.name)}</strong>
                <span className="text-sm text-slate-500">
                  {MARKETING_CAMPAIGN_STATUS_LABELS[campaign.status as keyof typeof MARKETING_CAMPAIGN_STATUS_LABELS] ?? String(campaign.status)}
                </span>
              </div>
              <p className="text-sm text-slate-600">{String(campaign.description ?? "")}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="marketing-card">
        <h2 className="marketing-card__title mb-4">Create campaign</h2>
        <div className="marketing-form-grid">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label>Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label>End date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <button type="button" className="marketing-btn marketing-btn--primary" onClick={() => void createCampaign()}>Create Campaign</button>
        </div>
      </section>
    </div>
  );
}
