"use client";

type LobbyScheduleCardProps = {
  day: string;
  classes: string[];
};

export function LobbyScheduleCard({ day, classes }: LobbyScheduleCardProps) {
  return (
    <article className="lobby-schedule-card rounded-2xl border border-white/10 bg-lobby-card/90 p-4 sm:p-5">
      <h4 className="text-xl font-black uppercase tracking-[0.18em] text-lobby-orange sm:text-2xl">{day}</h4>
      <ul className="mt-3 space-y-2">
        {classes.map((className) => (
          <li key={className} className="flex items-start gap-2 text-base font-semibold text-slate-100 sm:text-lg">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-lobby-orange" aria-hidden />
            <span>{className}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
