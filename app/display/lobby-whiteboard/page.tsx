import { Suspense } from "react";
import { LobbyCheckoutBoard } from "@/components/lobby/LobbyCheckoutBoard";
import { CastKeeperChrome } from "@/components/display/CastKeeper";
import { CastKeeperProvider } from "@/hooks/useCastKeeper";
import { getLobbyEmbeddedDisplayToken } from "@/lib/lobby/display-token";

export const dynamic = "force-dynamic";

function LobbyCastDisplayContent({ embeddedDisplayToken }: { embeddedDisplayToken?: string }) {
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

export default function LobbyCastDisplayPage() {
  const embeddedDisplayToken = getLobbyEmbeddedDisplayToken();

  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-ink-950 text-white">Loading lobby cast display...</div>
      }
    >
      <LobbyCastDisplayContent embeddedDisplayToken={embeddedDisplayToken} />
    </Suspense>
  );
}
