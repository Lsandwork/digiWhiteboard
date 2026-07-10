"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { StaffCastButton } from "@/components/board/StaffCastButton";
import { useStaffTvCast } from "@/hooks/useStaffTvCast";

export function StaffCastLiteSenderButton() {
  const searchParams = useSearchParams();
  const displayToken = searchParams.get("token")?.trim() ?? "";
  const {
    castUrl,
    isCasting,
    castError,
    canCast,
    castMethod,
    toggleTvCast,
    startChromecast,
    startWirelessCast,
    startAirPlayCast,
    copyCastUrl,
    stopTvCast,
    setCastError
  } = useStaffTvCast(displayToken);

  const runCastAction = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start casting.";
        if (!/cancel|abort|denied/i.test(message)) {
          setCastError(message);
        }
      }
    },
    [setCastError]
  );

  return (
    <StaffCastButton
      castUrl={castUrl}
      isCasting={isCasting}
      castError={castError}
      canCast={canCast}
      castMethod={castMethod}
      onToggle={() => void runCastAction(toggleTvCast)}
      onChromecast={() => void runCastAction(startChromecast)}
      onWireless={() => void runCastAction(startWirelessCast)}
      onAirPlay={() => void runCastAction(startAirPlayCast)}
      onCopyUrl={() => void runCastAction(copyCastUrl)}
      onStop={() => void runCastAction(stopTvCast)}
    />
  );
}
