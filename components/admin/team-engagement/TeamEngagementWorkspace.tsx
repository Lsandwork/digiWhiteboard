"use client";

import { useState } from "react";
import TeamEngagementPanel from "@/components/admin/team-engagement/TeamEngagementPanel";
import TeamEngagementParticipationPanel from "@/components/admin/team-engagement/TeamEngagementParticipationPanel";

/**
 * Leadership opens Manage + The Pack (participate). Staff only see The Pack.
 */
export default function TeamEngagementWorkspace({ leadership }: { leadership: boolean }) {
  const [mode, setMode] = useState<"pack" | "manage">(leadership ? "manage" : "pack");
  if (!leadership) {
    return <TeamEngagementParticipationPanel />;
  }
  return (
    <div className="ro-te-workspace">
      <div className="ro-te-workspace__toggle" role="tablist" aria-label="Team Engagement mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "pack"}
          className={`ro-te-btn ${mode === "pack" ? "ro-te-btn--primary" : "ro-te-btn--ghost"}`}
          onClick={() => setMode("pack")}
        >
          The Pack (participate)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manage"}
          className={`ro-te-btn ${mode === "manage" ? "ro-te-btn--primary" : "ro-te-btn--ghost"}`}
          onClick={() => setMode("manage")}
        >
          Manage Team Engagement
        </button>
      </div>
      {mode === "pack" ? <TeamEngagementParticipationPanel /> : <TeamEngagementPanel />}
    </div>
  );
}