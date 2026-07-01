"use client";

import { LobbyEventsPanel } from "@/components/lobby/LobbyEventsPanel";
import { LobbyServicesGrid } from "@/components/lobby/LobbyServicesGrid";
import type { LobbyEvent, LobbyPromotion } from "@/lib/lobby/types";

type LobbyIdlePanelsProps = {
  promotions: LobbyPromotion[];
  events: LobbyEvent[];
  showPromotions: boolean;
  showEvents: boolean;
};

export function LobbyIdlePanels({ promotions, events, showPromotions, showEvents }: LobbyIdlePanelsProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {showPromotions ? <LobbyServicesGrid promotions={promotions} /> : null}
      {showEvents ? <LobbyEventsPanel events={events} /> : null}
    </div>
  );
}
