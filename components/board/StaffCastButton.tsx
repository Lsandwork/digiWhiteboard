"use client";

import { TvCastControl } from "@/components/shared/TvCastControl";
import type { TvCastMethod } from "@/components/shared/TvCastControl";

type StaffCastButtonProps = {
  castUrl: string;
  isCasting: boolean;
  castError: string | null;
  canCast: boolean;
  castMethod: TvCastMethod;
  onChromecast: () => void;
  onWireless: () => void;
  onAirPlay: () => void;
  onCopyUrl: () => void;
  onStop: () => void;
  onToggle: () => void;
};

export function StaffCastButton({
  castUrl,
  isCasting,
  castError,
  canCast,
  castMethod,
  onChromecast,
  onWireless,
  onAirPlay,
  onCopyUrl,
  onStop,
  onToggle
}: StaffCastButtonProps) {
  return (
    <TvCastControl
      variant="staff"
      boardLabel="Staff Whiteboard"
      castUrl={castUrl}
      isCasting={isCasting}
      castError={castError}
      canCast={canCast}
      castMethod={castMethod}
      onChromecast={onChromecast}
      onWireless={onWireless}
      onAirPlay={onAirPlay}
      onCopyUrl={onCopyUrl}
      onStop={onStop}
      onQuickCast={onToggle}
    />
  );
}
