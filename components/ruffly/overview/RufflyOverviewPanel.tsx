"use client";

import { useCallback, useEffect, useState } from "react";

type Metrics = Record<string, number | string | null | undefined>;

const LABELS: Record<string, string> = {
  newLeadsToday: "New leads today",
  unansweredConversations: "Unanswered conversations",
  averageFirstResponseMinutes: "Avg first response (min)",
  leadsAwaitingFollowUp: "Leads awaiting follow-up",
  assessmentsBooked: "Assessments booked",
  leadsWon: "Leads won",
  leadsLost: "Leads lost",
  reviewRequestsSent: "Review requests sent",
  reviewRequestConversionRate: "Review conversion rate",
  currentGoogleRating: "Current Google rating",
  newReviewsThisWeek: "New reviews (range)",
  reviewsAwaitingResponse: "Reviews awaiting response",
  privateFeedbackAlerts: "Private feedback alerts",
  reactivatedCustomers: "Reactivated customers",
  estimatedRevenueInfluenced: "Est. revenue influenced",
  aiConversationsHandled: "AI conversations",
  aiToHumanHandoffs: "AI-to-human handoffs",
  missedCallsRecovered: "Missed calls recovered",
  upcomingAutomations: "Upcoming automations"
};

export function RufflyOverviewPanel() {
  const [range, setRange] = useState("last_7");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [setup, setSetup] = useState<{ setup_completed?: boolean; setup_step?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, settingsRes] = await Promise.all([
        fetch(`/api/ruffly/overview?range=${range}`, { cache: "no-store" }),
        fetch("/api/ruffly/settings", { cache: "no-store" })
      ]);
      const overview = await overviewRes.json();
      const settings = await settingsRes.json();
      if (!overviewRes.ok) throw new Error(overview.error ?? "Unable to load overview.");
      setMetrics(overview.metrics ?? overview);
      if (settingsRes.ok) setSetup(settings.settings ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load overview.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#1f2933]">Overview</h2>
          <p className="mt-1 text-sm text-slate-500">Live metrics from Ruffly records — never sample data.</p>
        </div>
        <label className="text-sm text-slate-600">
          Range{" "}
          <select
            className="ml-2 rounded-xl border border-slate-200 px-3 py-1.5"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7">Last 7 days</option>
            <option value="last_30">Last 30 days</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </select>
        </label>
      </div>

      {setup && setup.setup_completed === false ? (
        <div className="rounded-2xl border border-orange-200 bg-[#fff8f3] px-4 py-3 text-sm text-[#1f2933]">
          Setup incomplete (step {Number(setup.setup_step || 0)}). Open <strong>Ruffly Settings</strong> to finish
          the onboarding wizard before enabling sends.
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      {!loading && metrics ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(LABELS).map(([key, label]) => {
            const value = metrics[key];
            const display = value == null || value === "" ? "—" : String(value);
            return (
              <article
                key={key}
                className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-[#1f2933]">{display}</div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
