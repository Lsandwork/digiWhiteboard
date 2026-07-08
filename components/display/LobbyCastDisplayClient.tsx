"use client";

import { LobbyCheckoutBoard } from "@/components/lobby/LobbyCheckoutBoard";
import { CastKeeperChrome } from "@/components/display/CastKeeper";
import { CastKeeperProvider } from "@/hooks/useCastKeeper";

export function LobbyCastDisplayClient({ embeddedDisplayToken }: { embeddedDisplayToken?: string }) {
  return (
    <CastKeeperProvider
      displayType="lobby_whiteboard"
      route="/display/lobby-whiteboard"
      onContentUpdate={() => {
        window.dispatchEvent(new CustomEvent("fitdog-cast-keeper-refresh"));
      }}
    >
      <CastKeeperChrome displayType="lobby_whiteboard" />
      <LobbyCheckoutBoard embeddedDisplayToken={embeddedDisplayToken} castKeeperMode />
    </CastKeeperProvider>
  );
}
