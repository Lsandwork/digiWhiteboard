"use client";

import Image from "next/image";
import { lobbyLightAssets } from "@/lib/lobby/assets";
import type { LobbyScheduleDay } from "@/lib/lobby/class-schedule";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { LobbyScheduleCard } from "@/components/lobby/LobbyScheduleCard";

export function LobbyClassSchedule({
  schedule = LOBBY_CLASS_SCHEDULE,
  compact = false
}: {
  schedule?: LobbyScheduleDay[];
  compact?: boolean;
}) {
  const safeSchedule = Array.isArray(schedule)
    ? schedule.filter(
        (entry) =>
          entry &&
          typeof entry.day === "string" &&
          entry.day.trim() &&
          Array.isArray(entry.classes) &&
          entry.classes.length > 0
      )
    : LOBBY_CLASS_SCHEDULE;

  const days = (safeSchedule.length ? safeSchedule : LOBBY_CLASS_SCHEDULE).slice(0, 5);

  return (
    <section
      className={`lobby-panel lobby-class-schedule lobby-class-schedule--light${compact ? " lobby-class-schedule--compact" : ""}`}
    >
      <div className="relative z-10">
        <div className="lobby-class-schedule__heading">
          <Image src={lobbyLightAssets.calendarTeal} alt="" width={36} height={36} className="h-8 w-8 object-contain" unoptimized />
          <h3>Class Schedule</h3>
        </div>
        <div className="lobby-class-schedule-grid grid grid-cols-5 gap-3">
          {days.map((entry) => (
            <LobbyScheduleCard key={entry.day} day={entry.day} classes={entry.classes} />
          ))}
        </div>
        <p className="lobby-class-schedule__footer">
          <Image src={lobbyLightAssets.pawOutlineTeal} alt="" width={20} height={20} className="h-4 w-4 object-contain" unoptimized />
          Ask our team about class add-ons to make your pup&apos;s day even more exciting!
        </p>
      </div>
    </section>
  );
}
