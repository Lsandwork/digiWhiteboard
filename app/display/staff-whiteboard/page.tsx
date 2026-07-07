"use client";

import { Suspense } from "react";
import { BoardClient } from "@/components/BoardClient";
import { CastKeeperChrome } from "@/components/display/CastKeeper";
import { CastKeeperProvider } from "@/hooks/useCastKeeper";

function StaffCastDisplayContent() {
  return (
    <CastKeeperProvider
      displayType="staff_whiteboard"
      route="/display/staff-whiteboard"
      onContentUpdate={() => {
        window.dispatchEvent(new CustomEvent("fitdog-cast-keeper-refresh"));
      }}
    >
      <CastKeeperChrome displayType="staff_whiteboard" />
      <BoardClient castKeeperMode />
    </CastKeeperProvider>
  );
}

export default function StaffCastDisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#02060b] text-lg font-semibold text-white">
          Loading cast display...
        </div>
      }
    >
      <StaffCastDisplayContent />
    </Suspense>
  );
}
