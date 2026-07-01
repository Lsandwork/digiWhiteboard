import { Suspense } from "react";
import { LobbyCheckoutBoard } from "@/components/lobby/LobbyCheckoutBoard";

export default function LobbyCheckoutsPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-ink-950 text-white">Loading lobby board...</div>}>
      <LobbyCheckoutBoard />
    </Suspense>
  );
}
