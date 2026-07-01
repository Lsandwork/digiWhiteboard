"use client";

import Image from "next/image";
import { lobbyAssets } from "@/lib/lobby/assets";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { LobbyScheduleCard } from "@/components/lobby/LobbyScheduleCard";

export function LobbyClassSchedule() {
  return (
    <section className="lobby-class-schedule relative overflow-hidden rounded-[1.5rem] border border-white/10 p-4 sm:p-5">
      <Image src={lobbyAssets.eventsCard} alt="" fill className="pointer-events-none object-cover opacity-35" loading="lazy" />
      <div className="relative z-10">
        <h3 className="text-xl font-black uppercase tracking-[0.24em] text-white sm:text-2xl">Class Schedule</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
          {LOBBY_CLASS_SCHEDULE.map((entry) => (
            <LobbyScheduleCard key={entry.day} day={entry.day} classes={entry.classes} />
          ))}
        </div>
      </div>
    </section>
  );
}
