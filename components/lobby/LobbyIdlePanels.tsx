"use client";

import { LobbyClassSchedule } from "@/components/lobby/LobbyClassSchedule";
import { LobbyServicesGrid } from "@/components/lobby/LobbyServicesGrid";

type LobbyIdlePanelsProps = {
  showPromotions: boolean;
  showEvents: boolean;
};

export function LobbyIdlePanels({ showPromotions, showEvents }: LobbyIdlePanelsProps) {
  return (
    <div className="grid gap-6">
      {showPromotions ? <LobbyServicesGrid /> : null}
      {showEvents ? <LobbyClassSchedule /> : null}
    </div>
  );
}
