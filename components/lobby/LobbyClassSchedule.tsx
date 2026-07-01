"use client";

import Image from "next/image";
import { lobbyAssets } from "@/lib/lobby/assets";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { LobbyScheduleCard } from "@/components/lobby/LobbyScheduleCard";

export function LobbyClassSchedule() {
  return (
    <section className="lobby-class-schedule relative overflow-hidden rounded-[1.5rem] border border-white/10 p-4">
      <Image src={lobbyAssets.eventsCard} alt="" fill className="pointer-events-none object-cover opacity-30" loading="lazy" />
      <div className="relative z-10">
        <h3 className="text-lg font-black uppercase tracking-[0.22em] text-white xl:text-xl">Class Schedule</h3>
        <div className="lobby-class-schedule-grid mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
          {LOBBY_CLASS_SCHEDULE.map((entry) => (
            <LobbyScheduleCard key={entry.day} day={entry.day} classes={entry.classes} compact />
          ))}
        </div>
      </div>
    </section>
  );
}
