import type { FloorCategory, FloorDog, LiveFloor } from "@/lib/ops-command-center/live-floor";

export type FloorRowStatus =
  | "overdue"
  | "late"
  | "pending"
  | "upcoming"
  | "on_site"
  | "in_progress";

export type FloorRowAction = "gingr" | "team_log" | "follow_up";

export type FloorRow = {
  id: string;
  animalId: string;
  dogName: string;
  breed: string | null;
  ownerName: string | null;
  service: string;
  where: string;
  timeLabel: string;
  status: FloorRowStatus;
  statusLabel: string;
  flags: string[];
  next: string;
  sortMs: number;
  urgency: number;
  primaryAction: FloorRowAction;
  primaryLabel: string;
};

const CATEGORY_WHERE: Record<FloorCategory, string> = {
  boarding: "Boarding",
  daycare: "Daycare floor",
  training: "Training",
  grooming: "Grooming",
  outing: "Out / taxi",
  other: "On site"
};

const URGENCY: Record<FloorRowStatus, number> = {
  overdue: 0,
  late: 1,
  pending: 2,
  upcoming: 3,
  in_progress: 4,
  on_site: 5
};

function clock(value: string | null) {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
}

function rowFromDog(
  dog: FloorDog,
  partial: Pick<FloorRow, "status" | "statusLabel" | "timeLabel" | "sortMs" | "next" | "primaryAction" | "primaryLabel" | "where">
): FloorRow {
  const flags: string[] = [];
  if (dog.allergies) flags.push(dog.allergies.length > 24 ? `${dog.allergies.slice(0, 22)}…` : dog.allergies);
  if (dog.medicines) flags.push(dog.medicines.length > 24 ? `${dog.medicines.slice(0, 22)}…` : dog.medicines);
  return {
    id: dog.reservationId,
    animalId: dog.animalId,
    dogName: dog.dogName,
    breed: dog.breed,
    ownerName: dog.ownerName,
    service: dog.serviceType,
    where: partial.where,
    timeLabel: partial.timeLabel,
    status: partial.status,
    statusLabel: partial.statusLabel,
    flags,
    next: partial.next,
    sortMs: partial.sortMs,
    urgency: URGENCY[partial.status],
    primaryAction: partial.primaryAction,
    primaryLabel: partial.primaryLabel
  };
}

function sortMs(value: string | null, fallback = 0) {
  if (!value) return fallback;
  const at = Date.parse(value);
  return Number.isNaN(at) ? fallback : at;
}

export function buildFloorRows(floor: LiveFloor): FloorRow[] {
  const rows: FloorRow[] = [];

  for (const dog of floor.overduePickups) {
    rows.push(
      rowFromDog(dog, {
        status: "overdue",
        statusLabel: "Pickup overdue",
        timeLabel: clock(dog.endsAt),
        sortMs: sortMs(dog.endsAt),
        where: "Front desk",
        next: "Checkout happens in Gingr",
        primaryAction: "gingr",
        primaryLabel: "Open Gingr"
      })
    );
  }

  for (const dog of floor.lateArrivals) {
    rows.push(
      rowFromDog(dog, {
        status: "late",
        statusLabel: "Late arrival",
        timeLabel: clock(dog.startsAt),
        sortMs: sortMs(dog.startsAt),
        where: "Expected",
        next: "Check in in Gingr",
        primaryAction: "gingr",
        primaryLabel: "Open Gingr"
      })
    );
  }

  for (const dog of floor.pickupsRemaining) {
    rows.push(
      rowFromDog(dog, {
        status: "pending",
        statusLabel: "Pickup soon",
        timeLabel: clock(dog.endsAt),
        sortMs: sortMs(dog.endsAt),
        where: CATEGORY_WHERE[dog.category],
        next: "Stage in lobby, then Gingr checkout",
        primaryAction: "gingr",
        primaryLabel: "Open Gingr"
      })
    );
  }

  for (const dog of floor.arrivalsExpected) {
    rows.push(
      rowFromDog(dog, {
        status: "upcoming",
        statusLabel: "Arriving",
        timeLabel: clock(dog.startsAt),
        sortMs: sortMs(dog.startsAt),
        where: "Expected",
        next: "Check in in Gingr when they arrive",
        primaryAction: "gingr",
        primaryLabel: "Open Gingr"
      })
    );
  }

  for (const dog of floor.onSite) {
    const inService = dog.category === "grooming" || dog.category === "training";
    rows.push(
      rowFromDog(dog, {
        status: inService ? "in_progress" : "on_site",
        statusLabel: inService ? (dog.category === "grooming" ? "In groom" : "In class") : "On site",
        timeLabel: clock(dog.checkedInAt || dog.startsAt) || "In house",
        sortMs: sortMs(dog.checkedInAt || dog.startsAt, Date.now()),
        where: CATEGORY_WHERE[dog.category],
        next: inService ? "Note progress in RuffOps" : "Team log for moves and owner updates",
        primaryAction: "team_log",
        primaryLabel: "Team log"
      })
    );
  }

  return rows.sort((a, b) => a.urgency - b.urgency || a.sortMs - b.sortMs);
}

export function floorRowMatches(row: FloorRow, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return [row.dogName, row.ownerName, row.breed, row.service, row.where, row.animalId]
    .filter(Boolean)
    .some((part) => String(part).toLowerCase().includes(q));
}