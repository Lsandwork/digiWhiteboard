import { Suspense } from "react";
import { LobbyCastDisplayClient } from "@/components/display/LobbyCastDisplayClient";
import { getLobbyEmbeddedDisplayToken } from "@/lib/lobby/display-token";

export const dynamic = "force-dynamic";

export default function LobbyCastDisplayPage() {
  const embeddedDisplayToken = getLobbyEmbeddedDisplayToken();

  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-ink-950 text-white">Loading lobby cast display...</div>
      }
    >
      <LobbyCastDisplayClient embeddedDisplayToken={embeddedDisplayToken} />
    </Suspense>
  );
}
