"use client";

type LobbyScheduleCardProps = {
  day: string;
  classes: string[];
};

export function LobbyScheduleCard({ day, classes }: LobbyScheduleCardProps) {
  return (
    <article className="lobby-schedule-day flex min-w-0 flex-col rounded-lg bg-lobby-card/55 p-2">
      <h4 className="border-b border-lobby-teal/30 pb-1.5 text-sm font-black uppercase tracking-[0.08em] text-lobby-teal">
        {day}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {classes.map((className) => (
          <li key={className} className="flex items-start gap-1.5 text-[11px] font-medium leading-snug text-white">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lobby-orange" aria-hidden />
            <span>{className}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
