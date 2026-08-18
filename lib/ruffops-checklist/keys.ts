export type ParsedChecklistItemKey =
  | { kind: "medication"; medicationId: string; scheduleKind: string; serviceDate: string }
  | { kind: "service"; reservationId: string; serviceId: string; serviceDate: string }
  | { kind: "reminder"; reminderId: string; shiftDate: string }
  | { kind: "walks"; cycleId: string }
  | { kind: "alert"; noticeId: string };

export function medicationItemKey(medicationId: string, scheduleKind: string, serviceDate: string) {
  return `gingr:med:${medicationId}:${scheduleKind}:${serviceDate}`;
}

export function serviceItemKey(reservationId: string, serviceId: string, serviceDate: string) {
  return `gingr:svc:${reservationId}:${serviceId}:${serviceDate}`;
}

export function reminderItemKey(reminderId: string, shiftDate: string) {
  return `daily_reminder:${reminderId}:${shiftDate}`;
}

export function walksItemKey(cycleId: string) {
  return `walks:${cycleId}`;
}

export function alertItemKey(noticeId: string) {
  return `push:${noticeId}`;
}

export function parseChecklistItemKey(key: string): ParsedChecklistItemKey | null {
  const value = String(key ?? "").trim();
  if (!value) return null;

  const med = value.match(/^gingr:med:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})$/);
  if (med) {
    return { kind: "medication", medicationId: med[1], scheduleKind: med[2], serviceDate: med[3] };
  }

  const svc = value.match(/^gingr:svc:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})$/);
  if (svc) {
    return { kind: "service", reservationId: svc[1], serviceId: svc[2], serviceDate: svc[3] };
  }

  const reminder = value.match(/^daily_reminder:([^:]+):(\d{4}-\d{2}-\d{2})$/);
  if (reminder) {
    return { kind: "reminder", reminderId: reminder[1], shiftDate: reminder[2] };
  }

  const walks = value.match(/^walks:([^:]+)$/);
  if (walks) {
    return { kind: "walks", cycleId: walks[1] };
  }

  const alert = value.match(/^push:([^:]+)$/);
  if (alert) {
    return { kind: "alert", noticeId: alert[1] };
  }

  return null;
}

export function sourceForParsedKey(parsed: ParsedChecklistItemKey): "gingr" | "reminder" | "walks" | "alert" {
  if (parsed.kind === "medication" || parsed.kind === "service") return "gingr";
  if (parsed.kind === "reminder") return "reminder";
  if (parsed.kind === "walks") return "walks";
  return "alert";
}

export function sourceIdForParsedKey(parsed: ParsedChecklistItemKey): string {
  switch (parsed.kind) {
    case "medication":
      return parsed.medicationId;
    case "service":
      return parsed.serviceId;
    case "reminder":
      return parsed.reminderId;
    case "walks":
      return parsed.cycleId;
    case "alert":
      return parsed.noticeId;
  }
}
