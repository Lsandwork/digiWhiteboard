"use client";

import Image from "next/image";
import { lobbyAssets, lobbyIconPath } from "@/lib/lobby/assets";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { LobbyScheduleCard } from "@/components/lobby/LobbyScheduleCard";

export function LobbyClassSchedule() {
  return (
    <section className="lobby-panel lobby-class-schedule relative overflow-hidden rounded-2xl p-3 sm:p-4">
      <Image src={lobbyAssets.eventsCard} alt="" fill className="pointer-events-none object-cover opacity-50" loading="lazy" />
      <div className="relative z-10">
        <div className="mb-3 flex items-center gap-2">
          <Image src={lobbyIconPath("events")} alt="" width={24} height={24} className="h-6 w-6" />
          <h3 className="text-base font-black uppercase tracking-[0.18em] text-white xl:text-lg">Class Schedule</h3>
        </div>
        <div className="lobby-class-schedule-grid grid grid-cols-5 gap-2">
          {LOBBY_CLASS_SCHEDULE.map((entry) => (
            <LobbyScheduleCard key={entry.day} day={entry.day} classes={entry.classes} />
          ))}
        </div>
      </div>
    </section>
  );
}
