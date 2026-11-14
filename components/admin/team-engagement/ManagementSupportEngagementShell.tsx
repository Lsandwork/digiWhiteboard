"use client";

import { useState } from "react";
import { ManagementSupportPanel } from "@/components/admin/ManagementSupportPanel";
import TeamEngagementParticipationPanel from "@/components/admin/team-engagement/TeamEngagementParticipationPanel";

export function ManagementSupportEngagementShell({
  mode,
  showEngagement
}: {
  mode: Parameters<typeof ManagementSupportPanel>[0]["mode"];
  showEngagement: boolean;
}) {
  const [view, setView] = useState<"support" | "engagement">("support");
  if (!showEngagement) {
    return <ManagementSupportPanel mode={mode} />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`crossover-btn ${view === "support" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
          onClick={() => setView("support")}
        >
          Complaints & requests
        </button>
        <button
          type="button"
          className={`crossover-btn ${view === "engagement" ? "crossover-btn--active" : "crossover-btn--ghost"}`}
          onClick={() => setView("engagement")}
        >
          Bark Outs & suggestions
        </button>
      </div>
      {view === "support" ? <ManagementSupportPanel mode={mode} /> : <TeamEngagementParticipationPanel />}
    </div>
  );
}