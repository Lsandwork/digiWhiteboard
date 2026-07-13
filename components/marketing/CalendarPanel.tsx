"use client";

import { useCallback, useEffect, useState } from "react";
import { MARKETING_CALENDAR_EVENT_LABELS } from "@/lib/marketing/constants";
import { useToast } from "@/components/admin/ui/ToastProvider";

export function CalendarPanel() {
  const { showToast } = useToast();
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [view, setView] = useState<"month" | "week" | "agenda">("agenda");
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("photo_session");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/marketing/calendar", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) showToast(body.error ?? "Unable to load calendar.", "error");
    else setEvents(body.events ?? []);
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createEvent() {
    const response = await fetch("/api/marketing/calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, eventType, startsAt, notes })
    });
    const body = await response.json();
    if (!response.ok) return showToast(body.error ?? "Unable to create event.", "error");
    setTitle("");
    setNotes("");
    showToast("Event created.", "success");
    await load();
  }

  return (
    <div className="marketing-grid-2">
      <section className="marketing-card">
        <div className="marketing-card__header">
          <h2 className="marketing-card__title">Content Calendar</h2>
          <div className="flex gap-2">
            {(["month", "week", "agenda"] as const).map((mode) => (
              <button key={mode} type="button" className={`marketing-btn ${view === mode ? "marketing-btn--primary" : "marketing-btn--secondary"}`} onClick={() => setView(mode)}>
                {mode[0]!.toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {view === "agenda" ? (
          <div className="space-y-3">
            {events.map((event) => (
              <article key={String(event.id)} className="rounded-xl border p-3">
                <strong>{String(event.title)}</strong>
                <div className="text-sm text-slate-500">
                  {MARKETING_CALENDAR_EVENT_LABELS[event.event_type as keyof typeof MARKETING_CALENDAR_EVENT_LABELS] ?? String(event.event_type)}
                  {" · "}
                  {new Date(String(event.starts_at)).toLocaleString()}
                </div>
              </article>
            ))}
            {!events.length ? <div className="marketing-empty">No upcoming events.</div> : null}
          </div>
        ) : (
          <div className="marketing-empty">{view === "month" ? "Month view groups events by day in agenda list for now." : "Week view uses the same live event feed grouped by date."}</div>
        )}
      </section>
      <section className="marketing-card">
        <h2 className="marketing-card__title mb-4">Create event</h2>
        <div className="marketing-form-grid">
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>
            Event type
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {Object.entries(MARKETING_CALENDAR_EVENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>Starts at<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
          <label>Notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <button type="button" className="marketing-btn marketing-btn--primary" onClick={() => void createEvent()}>Save event</button>
        </div>
      </section>
    </div>
  );
}
