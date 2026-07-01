"use client";

import { useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { ClockDate } from "@/components/board/ClockDate";
import { LiveStatus } from "@/components/board/LiveStatus";
import { WakeLockStatusChip } from "@/components/board/WakeLockStatusChip";
import { formatBoardTime } from "@/lib/board-utils";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

type BoardHeaderProps = {
  connection: ConnectionState;
  clockTime: string;
  clockDate: string;
  lastUpdated: string;
  wakeLockStatus: "unsupported" | "active" | "released" | "error" | "idle";
  onRequestWakeLock: () => void;
};

export function BoardHeader({
  connection,
  clockTime,
  clockDate,
  lastUpdated,
  wakeLockStatus,
  onRequestWakeLock
}: BoardHeaderProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="mb-5 grid gap-5 lg:mb-6 lg:grid-cols-[1fr_auto] lg:items-start">
      <div className="flex min-w-0 items-start gap-4 sm:gap-5 lg:gap-6">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-fitdog-blue/70 bg-white p-1.5 shadow-glowBlue sm:h-24 sm:w-24 lg:h-28 lg:w-28">
          {logoFailed ? (
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
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Fitdog Health & Social Club
          </h1>
          <p className="mt-2 text-base text-slate-400 sm:text-lg">Real-time updates of our four-legged guests.</p>
        </div>
      </div>

      <div className="flex flex-col items-start gap-3 lg:items-end">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <LiveStatus connection={connection} />
          <WakeLockStatusChip status={wakeLockStatus} onRequest={onRequestWakeLock} />
        </div>

        <ClockDate time={clockTime} date={clockDate} />

        <div className="board-chip inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-300">
          <RefreshCw className="h-4 w-4 shrink-0" />
          Last updated {formatBoardTime(lastUpdated)}
        </div>
      </div>
    </header>
  );
}
