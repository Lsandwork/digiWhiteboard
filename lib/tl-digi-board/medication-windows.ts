import { TL_DIGI_BOARD_TIMEZONE, TL_KNOWN_SCHEDULE_ALIASES, TL_MEDICATION_WINDOWS, type TlMedicationPeriod } from "./constants";

type LaParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function laPartsAt(instant: Date): LaParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TL_DIGI_BOARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second")
  };
}

/** Minutes since midnight in Los Angeles for comparison. */
export function laMinutesSinceMidnight(instant: Date): number {
  const p = laPartsAt(instant);
  return p.hour * 60 + p.minute + (p.second >= 30 ? 0.5 : 0);
}

function minutesFromWindow(hour: number, minute: number, second = 0) {
  return hour * 60 + minute + (second >= 30 ? 0.5 : 0);
}

export function currentMedicationPeriodAt(instant: Date): TlMedicationPeriod | null {
  const minutes = laMinutesSinceMidnight(instant);
  const amStart = minutesFromWindow(TL_MEDICATION_WINDOWS.am.startHour, TL_MEDICATION_WINDOWS.am.startMinute);
  const amEnd = minutesFromWindow(
    TL_MEDICATION_WINDOWS.am.endHour,
    TL_MEDICATION_WINDOWS.am.endMinute,
    TL_MEDICATION_WINDOWS.am.endSecond
  );
  const midStart = minutesFromWindow(TL_MEDICATION_WINDOWS.mid_day.startHour, TL_MEDICATION_WINDOWS.mid_day.startMinute);
  const midEnd = minutesFromWindow(
    TL_MEDICATION_WINDOWS.mid_day.endHour,
    TL_MEDICATION_WINDOWS.mid_day.endMinute,
    TL_MEDICATION_WINDOWS.mid_day.endSecond
  );
  const pmStart = minutesFromWindow(TL_MEDICATION_WINDOWS.pm.startHour, TL_MEDICATION_WINDOWS.pm.startMinute);
  const pmEnd = minutesFromWindow(
    TL_MEDICATION_WINDOWS.pm.endHour,
    TL_MEDICATION_WINDOWS.pm.endMinute,
    TL_MEDICATION_WINDOWS.pm.endSecond
  );

  if (minutes >= amStart && minutes <= amEnd) return "am";
  if (minutes >= midStart && minutes <= midEnd) return "mid_day";
  if (minutes >= pmStart && minutes <= pmEnd) return "pm";
  return null;
}

export function nextMedicationPeriodAt(instant: Date): { period: TlMedicationPeriod; startsAtLa: string } | null {
  const minutes = laMinutesSinceMidnight(instant);
  const amStart = minutesFromWindow(TL_MEDICATION_WINDOWS.am.startHour, TL_MEDICATION_WINDOWS.am.startMinute);
  const midStart = minutesFromWindow(TL_MEDICATION_WINDOWS.mid_day.startHour, TL_MEDICATION_WINDOWS.mid_day.startMinute);
  const pmStart = minutesFromWindow(TL_MEDICATION_WINDOWS.pm.startHour, TL_MEDICATION_WINDOWS.pm.startMinute);

  if (minutes < amStart) return { period: "am", startsAtLa: "4:00 AM" };
  if (minutes < midStart) return { period: "mid_day", startsAtLa: "10:00 AM" };
  if (minutes < pmStart) return { period: "pm", startsAtLa: "4:00 PM" };
  return null;
}

export function periodLabel(period: TlMedicationPeriod): string {
  switch (period) {
    case "am":
      return "AM";
    case "mid_day":
      return "MID-DAY";
    case "pm":
      return "PM";
    default:
      return period;
  }
}

export function normalizeScheduleLabel(raw: string | null | undefined): {
  kind: TlMedicationPeriod | "other_special";
  gingrScheduleLabel: string;
} {
  const label = String(raw ?? "").trim();
  if (!label) return { kind: "other_special", gingrScheduleLabel: "OTHER / SPECIAL" };
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  const mapped = TL_KNOWN_SCHEDULE_ALIASES[normalized];
  if (mapped) return { kind: mapped, gingrScheduleLabel: label };
  return { kind: "other_special", gingrScheduleLabel: label };
}

/** True when a completed medication from `medicationPeriod` should remain visible during `currentPeriod`. */
export function completedMedicationVisibleInPeriod(
  medicationPeriod: TlMedicationPeriod | "other_special",
  currentPeriod: TlMedicationPeriod | null
) {
  if (!currentPeriod) return false;
  if (medicationPeriod === "other_special") return true;
  return medicationPeriod === currentPeriod;
}

/** True when an incomplete medication from a prior period should appear in overdue. */
export function incompleteMedicationIsOverdue(
  medicationPeriod: TlMedicationPeriod | "other_special",
  currentPeriod: TlMedicationPeriod | null,
  now: Date
) {
  if (medicationPeriod === "other_special") {
    // Unknown schedules stay visible until Gingr confirms administration.
    return false;
  }
  const active = currentMedicationPeriodAt(now);
  if (!active) {
    // Between 12:00 AM and 3:59 AM — prior PM incomplete rows remain overdue.
    return medicationPeriod === "pm";
  }
  const order: TlMedicationPeriod[] = ["am", "mid_day", "pm"];
  const medIndex = order.indexOf(medicationPeriod);
  const activeIndex = order.indexOf(active);
  if (medIndex < 0 || activeIndex < 0) return false;
  return medIndex < activeIndex;
}

export function laServiceDate(instant: Date): string {
  const p = laPartsAt(instant);
  const month = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${p.year}-${month}-${day}`;
}

export function formatLaBoardClock(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TL_DIGI_BOARD_TIMEZONE
  }).format(instant);
}

/** Header clock — includes seconds and updates every second on the TL TV board. */
export function formatLaBoardLiveClock(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: TL_DIGI_BOARD_TIMEZONE
  }).format(instant);
}

export function formatLaBoardDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TL_DIGI_BOARD_TIMEZONE
  }).format(instant).toUpperCase();
}

/** For tests — build a Date whose LA local components match the given values (approximate via offset scan). */
export function dateAtLaLocal(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
}): Date {
  const target = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0
  };

  // Scan UTC instants around the expected offset window (PST/PDT ≈ UTC-7/8).
  for (let offsetHours = 7; offsetHours <= 8; offsetHours += 1) {
    const candidate = new Date(
      Date.UTC(target.year, target.month - 1, target.day, target.hour + offsetHours, target.minute, target.second)
    );
    const la = laPartsAt(candidate);
    if (
      la.year === target.year &&
      la.month === target.month &&
      la.day === target.day &&
      la.hour === target.hour &&
      la.minute === target.minute &&
      la.second === target.second
    ) {
      return candidate;
    }
  }

  throw new Error(`Unable to construct LA-local date for ${JSON.stringify(parts)}`);
}
