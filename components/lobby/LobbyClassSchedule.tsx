"use client";

import { LobbySectionDogIcon } from "@/components/lobby/LobbySectionDogIcon";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyAssets } from "@/lib/lobby/assets";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { LobbyScheduleCard } from "@/components/lobby/LobbyScheduleCard";

export function LobbyClassSchedule() {
  return (
    <section className="lobby-panel lobby-class-schedule relative overflow-hidden rounded-2xl p-4">
      <LobbyAssetImage
        src={lobbyAssets.eventsScenery}
        alt=""
        width={1920}
        height={400}
        fill
        className="pointer-events-none object-cover object-bottom opacity-[0.12]"
        loading="eager"
        priority
      />
      <div className="relative z-10">
        <div className="mb-3 flex items-center gap-2">
          <LobbySectionDogIcon />
          <h3 className="text-lg font-black uppercase tracking-[0.16em] text-white">Class Schedule</h3>
        </div>
        <div className="lobby-class-schedule-grid grid grid-cols-5 gap-3">
          {LOBBY_CLASS_SCHEDULE.map((entry) => (
            <LobbyScheduleCard key={entry.day} day={entry.day} classes={entry.classes} />
          ))}
        </div>
      </div>
    </section>
  );
}
