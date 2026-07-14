"use client";

type LobbyScheduleCardProps = {
  day: string;
  classes: string[];
};

export function LobbyScheduleCard({ day, classes }: LobbyScheduleCardProps) {
  const shortDay = day.length > 3 ? day.slice(0, 3).toUpperCase() : day.toUpperCase();

  return (
    <article className="lobby-schedule-day lobby-schedule-day--light flex min-w-0 flex-col">
      <h4 className="lobby-schedule-day__label">{shortDay}</h4>
      <ul className="lobby-schedule-day__list">
        {classes.map((className) => (
          <li key={className}>
            <span className="lobby-schedule-day__dot" aria-hidden />
            <span>{className}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
