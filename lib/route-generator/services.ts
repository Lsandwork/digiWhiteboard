import { CANONICAL_SERVICES, type CanonicalService } from "@/lib/route-generator/flags";

const DEFAULT_ALIASES: Record<string, CanonicalService> = {
  "adventure hike": "Adventure Hike",
  "adventure hikes": "Adventure Hike",
  "beach excursion": "Beach Excursion",
  "beach excursions": "Beach Excursion",
  "trainer-led hike": "Trainer-Led Hike",
  "trainer led hike": "Trainer-Led Hike",
  "trainer-led hikes": "Trainer-Led Hike",
  "trainer led hikes": "Trainer-Led Hike",
  "group class": "Group Class",
  "group classes": "Group Class",
  taxi: "Taxi Service",
  "taxi service": "Taxi Service",
  "taxi services": "Taxi Service"
};

export function normalizeServiceName(
  raw: string | null | undefined,
  aliases: Record<string, CanonicalService> = DEFAULT_ALIASES
): CanonicalService | null {
  const cleaned = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!cleaned) return null;
  if ((CANONICAL_SERVICES as readonly string[]).includes(String(raw ?? "").trim())) {
    return String(raw).trim() as CanonicalService;
  }
  return aliases[cleaned] ?? null;
}

export function classifyDirection(params: {
  pickupRequested?: boolean | string | null;
  dropoffRequested?: boolean | string | null;
  explicit?: "pickup" | "dropoff" | null;
}): "pickup" | "dropoff" | null {
  if (params.explicit === "pickup" || params.explicit === "dropoff") return params.explicit;
  const pick = coerceBool(params.pickupRequested);
  const drop = coerceBool(params.dropoffRequested);
  if (pick && !drop) return "pickup";
  if (drop && !pick) return "dropoff";
  if (pick && drop) return null; // ambiguous — caller should emit two items
  return null;
}

function coerceBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "pickup" || s === "dropoff" || s === "x";
}
