"use client";

type LobbyScheduleCardProps = {
  day: string;
  classes: string[];
};

export function LobbyScheduleCard({ day, classes }: LobbyScheduleCardProps) {
  return (
    <article className="lobby-schedule-card flex h-full min-w-0 flex-col rounded-xl border border-lobby-teal/20 bg-lobby-card-2/80 p-2.5 xl:p-3">
      <h4 className="text-sm font-black uppercase tracking-[0.1em] text-lobby-teal xl:text-base">{day}</h4>
      <ul className="mt-2 flex-1 space-y-1.5">
        {classes.map((className) => (
          <li
            key={className}
            className="flex items-start gap-1.5 text-[11px] font-medium leading-snug text-white xl:text-xs"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lobby-orange" aria-hidden />
            <span>{className}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
