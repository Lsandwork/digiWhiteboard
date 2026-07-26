import type { NormalizedReportItem } from "@/lib/route-generator/parser";

export type HouseholdStopGroup = {
  householdKey: string;
  direction: "pickup" | "dropoff";
  address: string;
  ownerName: string | null;
  items: NormalizedReportItem[];
  dogCount: number;
};

function ownerLastName(item: NormalizedReportItem): string | null {
  if (item.ownerLastName?.trim()) return item.ownerLastName.trim();
  const full = item.ownerFullName?.trim();
  if (!full) return null;
  const parts = full.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : null;
}

/**
 * Samsara-style stop labels: "Remy Jaeger", "Bruno + Ollie", "Cali + Clover Bettelman".
 */
export function formatStopDisplayName(items: NormalizedReportItem[]): string {
  const dogNames = items
    .map((item) => String(item.dogName || "").trim())
    .filter(Boolean);
  if (!dogNames.length) {
    return items.find((item) => item.ownerFullName)?.ownerFullName?.trim() || "Stop";
  }

  const lastNames = [
    ...new Set(items.map((item) => ownerLastName(item)).filter((value): value is string => Boolean(value)))
  ];
  const dogsPart = dogNames.join(" + ");
  if (lastNames.length === 1) return `${dogsPart} ${lastNames[0]}`.trim();
  return dogsPart;
}

/** Combine dogs at the same address into one physical stop while preserving each dog item. */
export function groupHouseholds(items: NormalizedReportItem[]): HouseholdStopGroup[] {
  const map = new Map<string, HouseholdStopGroup>();
  for (const item of items) {
    if (item.validationStatus === "error" && item.validationReasons.includes("Missing address")) continue;
    const key = `${item.direction}|${item.householdKey || item.addressRaw || item.reservationId || item.dogName}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        householdKey: item.householdKey || key,
        direction: item.direction,
        address: item.addressRaw || "",
        ownerName: null,
        items: [item],
        dogCount: 1
      });
    } else {
      existing.items.push(item);
      existing.dogCount += 1;
    }
  }

  return [...map.values()].map((group) => ({
    ...group,
    ownerName: formatStopDisplayName(group.items)
  }));
}
