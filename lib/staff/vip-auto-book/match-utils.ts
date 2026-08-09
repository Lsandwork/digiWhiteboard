import type { VipAutoBookClient, VipServiceKind } from "@/lib/staff/vip-auto-book/types";

export function normalizeVipName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function ownerNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeVipName(a);
  const right = normalizeVipName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftParts = left.split(" ");
  const rightParts = right.split(" ");
  const leftLast = leftParts[leftParts.length - 1];
  const rightLast = rightParts[rightParts.length - 1];
  if (leftLast && rightLast && leftLast === rightLast && leftLast.length >= 3) {
    const leftFirst = leftParts[0];
    const rightFirst = rightParts[0];
    if (leftFirst && rightFirst && (leftFirst[0] === rightFirst[0] || leftFirst === rightFirst)) return true;
  }
  return false;
}

export function dogNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeVipName(a);
  const right = normalizeVipName(b);
  if (!left || !right) return false;
  return left === right;
}

export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

export function pacificTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

export function pacificDateOffset(daysFromToday: number): string {
  const now = new Date();
  const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  pacific.setDate(pacific.getDate() + daysFromToday);
  const y = pacific.getFullYear();
  const m = String(pacific.getMonth() + 1).padStart(2, "0");
  const d = String(pacific.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Clear Re-book Needed when there is a booking on/after today (Pacific). */
export function shouldClearNeedToRebook(lastBookedFor: string | null | undefined, today = pacificTodayIso()) {
  const day = dateOnly(lastBookedFor);
  if (!day) return false;
  return day >= today;
}

export function isFitdogVipPlatform(platform: string | null | undefined) {
  const text = String(platform ?? "").toLowerCase();
  return text.includes("app") || text.includes("fitdog");
}

export function fitdogServiceMatches(kind: VipServiceKind, serviceRaw: string | null | undefined) {
  const raw = String(serviceRaw ?? "").toLowerCase();
  if (!raw) return true;
  switch (kind) {
    case "adventure_hike":
      return raw.includes("adventure") || (raw.includes("hike") && !raw.includes("trainer"));
    case "trainer_led_hike":
      return raw.includes("trainer") || raw.includes("led hike");
    case "beach_excursion":
      return raw.includes("beach") || raw.includes("excursion");
    case "group_class":
      return raw.includes("class") || raw.includes("training");
    case "taxi":
      return raw.includes("taxi");
    default:
      return true;
  }
}

export function matchVipToFitdogHit(
  client: VipAutoBookClient,
  hit: { dogId: string | null; ownerId: string | null; dogName: string | null; ownerName: string | null }
) {
  if (client.fitdogDogId && hit.dogId && String(client.fitdogDogId) === String(hit.dogId)) {
    return true;
  }
  if (
    client.fitdogOwnerId &&
    hit.ownerId &&
    String(client.fitdogOwnerId) === String(hit.ownerId) &&
    dogNamesMatch(client.dogName, hit.dogName)
  ) {
    return true;
  }
  if (!dogNamesMatch(client.dogName, hit.dogName)) return false;
  return ownerNamesMatch(client.ownerName, hit.ownerName);
}
