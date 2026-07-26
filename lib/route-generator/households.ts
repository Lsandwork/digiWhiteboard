import type { NormalizedReportItem } from "@/lib/route-generator/parser";

export type HouseholdStopGroup = {
  householdKey: string;
  direction: "pickup" | "dropoff";
  address: string;
  ownerName: string | null;
  items: NormalizedReportItem[];
  dogCount: number;
};

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
        ownerName: item.ownerFullName,
        items: [item],
        dogCount: 1
      });
    } else {
      existing.items.push(item);
      existing.dogCount += 1;
      if (!existing.ownerName && item.ownerFullName) existing.ownerName = item.ownerFullName;
    }
  }
  return [...map.values()];
}
