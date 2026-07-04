"use client";

import type { LobbyScheduleDay } from "@/lib/lobby/class-schedule";

type ClassScheduleEditorProps = {
  schedule: LobbyScheduleDay[];
  onChange: (schedule: LobbyScheduleDay[]) => void;
};

export function ClassScheduleEditor({ schedule, onChange }: ClassScheduleEditorProps) {
  return (
    <section className="admin-card p-5">
      <h2 className="mb-4 text-lg font-black text-white">Class Schedule</h2>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {schedule.map((day, dayIndex) => (
          <article key={day.day} className="rounded-xl border border-admin-border p-4">
            <h3 className="mb-3 font-bold text-fitdog-orange">{day.day}</h3>
            <ul className="space-y-2">
              {day.classes.map((className, classIndex) => (
                <li key={`${day.day}-${className}`}>
                  <input
                    className="admin-input"
                    value={className}
                    aria-label={`${day.day} class ${classIndex + 1}`}
                    onChange={(event) => {
                      const next = schedule.map((entry, index) =>
                        index === dayIndex
                          ? { ...entry, classes: entry.classes.map((item, i) => (i === classIndex ? event.target.value : item)) }
                          : entry
                      );
                      onChange(next);
                    }}
                  />
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
