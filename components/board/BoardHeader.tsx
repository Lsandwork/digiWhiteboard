"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { ClockDate } from "@/components/board/ClockDate";
import { LiveStatus } from "@/components/board/LiveStatus";
import { WakeLockStatusChip } from "@/components/board/WakeLockStatusChip";
import { formatBoardTime } from "@/lib/board-utils";
import type { SantaMonicaWeather } from "@/lib/staff/santa-monica-weather";
import type { StaffWhiteboardThemeId } from "@/lib/staff/whiteboard-themes";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

type BoardHeaderProps = {
  connection: ConnectionState;
  clockTime: string;
  clockDate: string;
  lastUpdated: string;
  wakeLockStatus: "unsupported" | "active" | "released" | "error" | "idle";
  onRequestWakeLock: () => void;
  castKeeperMode?: boolean;
  weather?: SantaMonicaWeather | null;
  whiteboardTheme?: StaffWhiteboardThemeId;
};

export function BoardHeader({
  connection,
  clockTime,
  clockDate,
  lastUpdated,
  wakeLockStatus,
  onRequestWakeLock,
  castKeeperMode = false,
  weather = null,
  whiteboardTheme = "clear-white"
}: BoardHeaderProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const isCity = whiteboardTheme === "city";

  const logo = logoFailed ? (
    <span className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-3xl font-black text-white sm:text-4xl">
      F
    </span>
  ) : (
    <Image
      src="/assets/fitdog/replace_f-logo.png"
      alt="Fitdog Team"
      width={224}
      height={224}
      priority
      className="h-full w-full rounded-full object-contain"
      draggable={false}
      onError={() => setLogoFailed(true)}
    />
  );

  return (
    <header className="staff-wb-header mb-5 grid gap-5 lg:mb-6 lg:grid-cols-[1fr_auto] lg:items-start">
      <div className="flex min-w-0 items-start gap-4 sm:gap-5 lg:gap-6">
        {castKeeperMode ? (
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-fitdog-orange/70 bg-white p-1.5 shadow-glowBlue sm:h-24 sm:w-24 lg:h-28 lg:w-28">
            {logo}
          </div>
        ) : (
          <Link
            href="/admin"
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-fitdog-orange/70 bg-white p-1.5 shadow-glowBlue transition hover:ring-2 hover:ring-fitdog-orange/60 sm:h-24 sm:w-24 lg:h-28 lg:w-28"
            aria-label="Open Fitdog admin"
            title="Fitdog Digi-board"
          >
            {logo}
          </Link>
        )}
        <div className="min-w-0">
          {isCity ? <p className="staff-wb-header__eyebrow">Welcome to</p> : null}
          <h1 className="staff-wb-header__title text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Fitdog Health & Social Club
          </h1>
          <p className="staff-wb-header__subtitle mt-2 text-base sm:text-lg">
            Real-time updates of our four-legged guests.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-start gap-3 lg:items-end">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <LiveStatus connection={connection} />
          {castKeeperMode ? null : <WakeLockStatusChip status={wakeLockStatus} onRequest={onRequestWakeLock} />}
        </div>

        <ClockDate time={clockTime} date={clockDate} weather={weather} />

        <div className="board-chip inline-flex items-center gap-2 px-3 py-2 text-sm">
          <RefreshCw className="h-4 w-4 shrink-0" />
          Last updated {formatBoardTime(lastUpdated)}
        </div>
      </div>
    </header>
  );
}
