"use client";

type LobbyScheduleCardProps = {
  day: string;
  classes: string[];
  compact?: boolean;
};

export function LobbyScheduleCard({ day, classes, compact = false }: LobbyScheduleCardProps) {
  return (
    <article
      className={`lobby-schedule-card flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-lobby-card/90 ${
        compact ? "p-3" : "p-4 sm:p-5"
      }`}
    >
      <h4
        className={`font-black uppercase tracking-[0.14em] text-lobby-orange ${
          compact ? "text-base xl:text-lg" : "text-xl sm:text-2xl"
        }`}
      >
        {day}
      </h4>
      <ul className={`mt-2 flex-1 ${compact ? "space-y-1" : "space-y-2"}`}>
        {classes.map((className) => (
          <li
            key={className}
            className={`flex items-start gap-1.5 font-semibold text-slate-100 ${
              compact ? "text-xs leading-snug xl:text-sm" : "text-base sm:text-lg"
            }`}
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lobby-orange" aria-hidden />
            <span>{className}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
