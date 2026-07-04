"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { LobbyScheduleDay } from "@/lib/lobby/class-schedule";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { useState } from "react";

type ClassScheduleEditorProps = {
  schedule: LobbyScheduleDay[];
  onChange: (schedule: LobbyScheduleDay[]) => void;
  onReset?: () => void;
};

export function ClassScheduleEditor({ schedule, onChange, onReset }: ClassScheduleEditorProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  function moveClass(dayIndex: number, classIndex: number, direction: -1 | 1) {
    const nextIndex = classIndex + direction;
    const classes = [...schedule[dayIndex].classes];
    if (nextIndex < 0 || nextIndex >= classes.length) return;
    [classes[classIndex], classes[nextIndex]] = [classes[nextIndex], classes[classIndex]];
    onChange(schedule.map((entry, index) => (index === dayIndex ? { ...entry, classes } : entry)));
  }

  return (
    <section className="admin-card p-5">
      <header className="admin-page-header mb-4">
        <div>
          <h2 className="admin-section-title">Class Schedule</h2>
          <p className="admin-section-helper">Edit Monday–Friday classes shown on the lobby board.</p>
        </div>
        <button type="button" className="admin-btn-ghost inline-flex items-center gap-2" onClick={() => setConfirmReset(true)}>
          <RotateCcw className="h-4 w-4" /> Reset to default
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {schedule.map((day, dayIndex) => (
          <article key={day.day} className="rounded-xl border border-admin-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-fitdog-orange">{day.day}</h3>
              <button
                type="button"
                className="admin-btn-ghost inline-flex items-center gap-1 text-xs"
                onClick={() => onChange(schedule.map((entry, index) => index === dayIndex ? { ...entry, classes: [...entry.classes, "New Class"] } : entry))}
              >
                <Plus className="h-3.5 w-3.5" /> Add class
              </button>
            </div>
            <ul className="space-y-2">
              {day.classes.map((className, classIndex) => (
                <li key={`${day.day}-${classIndex}`} className="flex items-center gap-2">
                  <input
                    className="admin-input flex-1"
                    value={className}
                    aria-label={`${day.day} class ${classIndex + 1}`}
                    onChange={(event) => {
                      onChange(schedule.map((entry, index) =>
                        index === dayIndex
                          ? { ...entry, classes: entry.classes.map((item, i) => (i === classIndex ? event.target.value : item)) }
                          : entry
                      ));
                    }}
                  />
                  <button type="button" className="admin-icon-btn" aria-label="Move up" onClick={() => moveClass(dayIndex, classIndex, -1)}>↑</button>
                  <button type="button" className="admin-icon-btn" aria-label="Move down" onClick={() => moveClass(dayIndex, classIndex, 1)}>↓</button>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    aria-label="Remove class"
                    onClick={() => onChange(schedule.map((entry, index) => index === dayIndex ? { ...entry, classes: entry.classes.filter((_, i) => i !== classIndex) } : entry))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset class schedule?"
        description="This restores the default Fitdog class schedule for all weekdays."
        confirmLabel="Reset schedule"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          onChange(LOBBY_CLASS_SCHEDULE);
          onReset?.();
          setConfirmReset(false);
        }}
      />
    </section>
  );
}
