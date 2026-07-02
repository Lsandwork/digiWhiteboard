import { Suspense } from "react";
import { LobbyCheckoutBoard } from "@/components/lobby/LobbyCheckoutBoard";
import { getLobbyEmbeddedDisplayToken } from "@/lib/lobby/display-token";

export const dynamic = "force-dynamic";

export default function LobbyCheckoutsPage() {
  const embeddedDisplayToken = getLobbyEmbeddedDisplayToken();

  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-ink-950 text-white">Loading lobby board...</div>}>
      <LobbyCheckoutBoard embeddedDisplayToken={embeddedDisplayToken} />
    </Suspense>
  );
}
