/**
 * Eligible Gingr activities for the Gingr Route Generator.
 * Centralized metadata — colors stay restrained and professional.
 */

import { classifyTransportationText } from "@/lib/gingr-route-generator/transportation";

export type GingrRouteActivityId =
  | "adventure_hike"
  | "beach_excursion"
  | "recall_at_the_beach"
  | "canine_fitness"
  | "cool_tricks"
  | "fun_and_fit_agility"
  | "scent_works"
  | "leash_manners"
  | "foundations_and_focus"
  | "foundational_obedience"
  | "reliable_recall"
  | "trail_foundations"
  | "trainer_led_hike"
  | "urban_recall"
  | "sport_sign_ups"
  | "trainer_activity"
  | "club"
  | "taxi";

export type GingrRouteActivityCategory = "class" | "outing" | "club" | "taxi";

export type GingrRouteActivityMeta = {
  id: GingrRouteActivityId;
  label: string;
  category: GingrRouteActivityCategory;
  accent: string;
  accentSoft: string;
  accentText: string;
  aliases: string[];
};

export const GINGR_ROUTE_ACTIVITIES: GingrRouteActivityMeta[] = [
  {
    id: "adventure_hike",
    label: "Adventure Hike",
    category: "outing",
    accent: "#2F9E6B",
    accentSoft: "#E8F6EF",
    accentText: "#1B6B46",
    aliases: ["adventure hike", "adventure hikes"]
  },
  {
    id: "beach_excursion",
    label: "Beach Excursion",
    category: "outing",
    accent: "#2F80ED",
    accentSoft: "#E8F1FC",
    accentText: "#1A5BB5",
    aliases: ["beach excursion", "beach excursions"]
  },
  {
    id: "recall_at_the_beach",
    label: "Recall At The Beach",
    category: "outing",
    accent: "#3B82F6",
    accentSoft: "#EAF2FE",
    accentText: "#1D4ED8",
    aliases: ["recall at the beach", "recall at beach", "beach recall"]
  },
  {
    id: "canine_fitness",
    label: "Canine Fitness",
    category: "class",
    accent: "#7C3AED",
    accentSoft: "#F1E9FE",
    accentText: "#5B21B6",
    aliases: ["canine fitness", "canine conditioning"]
  },
  {
    id: "cool_tricks",
    label: "Cool Tricks",
    category: "class",
    accent: "#DB2777",
    accentSoft: "#FCE7F3",
    accentText: "#9D174D",
    aliases: ["cool tricks"]
  },
  {
    id: "fun_and_fit_agility",
    label: "Fun & Fit Agility",
    category: "class",
    accent: "#EA580C",
    accentSoft: "#FFF1E7",
    accentText: "#C2410C",
    aliases: ["fun & fit agility", "fun and fit agility", "fun & fit"]
  },
  {
    id: "scent_works",
    label: "Scent Works",
    category: "class",
    accent: "#E11D48",
    accentSoft: "#FFE4E9",
    accentText: "#9F1239",
    aliases: ["scent works", "scent work", "nose work"]
  },
  {
    id: "leash_manners",
    label: "Leash Manners",
    category: "class",
    accent: "#0D9488",
    accentSoft: "#E6FAF7",
    accentText: "#0F766E",
    aliases: ["leash manners", "leash manner"]
  },
  {
    id: "foundations_and_focus",
    label: "Foundations & Focus",
    category: "class",
    accent: "#CA8A04",
    accentSoft: "#FEF9C3",
    accentText: "#A16207",
    aliases: ["foundations & focus", "foundations and focus"]
  },
  {
    id: "foundational_obedience",
    label: "Foundational Obedience",
    category: "class",
    accent: "#B45309",
    accentSoft: "#FEF3C7",
    accentText: "#92400E",
    aliases: ["foundational obedience"]
  },
  {
    id: "reliable_recall",
    label: "Reliable Recall",
    category: "class",
    accent: "#8B5CF6",
    accentSoft: "#F3E8FF",
    accentText: "#6D28D9",
    aliases: ["reliable recall"]
  },
  {
    id: "trail_foundations",
    label: "Trail Foundations",
    category: "class",
    accent: "#65A30D",
    accentSoft: "#ECFCCB",
    accentText: "#3F6212",
    aliases: ["trail foundations"]
  },
  {
    id: "trainer_led_hike",
    label: "Trainer Led Hike",
    category: "class",
    accent: "#0F766E",
    accentSoft: "#CCFBF1",
    accentText: "#115E59",
    aliases: ["trainer led hike", "trainer-led hike"]
  },
  {
    id: "urban_recall",
    label: "Urban Recall",
    category: "class",
    accent: "#0369A1",
    accentSoft: "#E0F2FE",
    accentText: "#075985",
    aliases: ["urban recall"]
  },
  {
    id: "sport_sign_ups",
    label: "Sport Sign Ups",
    category: "class",
    accent: "#BE185D",
    accentSoft: "#FCE7F3",
    accentText: "#9D174D",
    aliases: ["sport sign ups", "sports sign ups", "sport sign up", "sports sign up"]
  },
  {
    id: "trainer_activity",
    label: "Trainer Activity",
    category: "class",
    accent: "#475569",
    accentSoft: "#F1F5F9",
    accentText: "#334155",
    aliases: ["activity with trainer", "trainer activity"]
  },
  {
    id: "club",
    label: "Club",
    category: "club",
    accent: "#57534E",
    accentSoft: "#F5F5F4",
    accentText: "#44403C",
    aliases: ["daycare", "day care", "boarding", "overnight", "dog hotel", "boarding at fitdog club"]
  },
  {
    id: "taxi",
    label: "Taxi",
    category: "taxi",
    accent: "#334155",
    accentSoft: "#F1F5F9",
    accentText: "#1E293B",
    aliases: ["taxi", "taxi service", "door to door"]
  }
];

export const GINGR_ROUTE_ACTIVITY_BY_ID = Object.fromEntries(
  GINGR_ROUTE_ACTIVITIES.map((a) => [a.id, a])
) as Record<GingrRouteActivityId, GingrRouteActivityMeta>;

export const GINGR_CLASS_ACTIVITY_IDS = GINGR_ROUTE_ACTIVITIES.filter((a) => a.category === "class").map(
  (a) => a.id
);

export type GingrSubjectGroupId = "class" | GingrRouteActivityId;

export function isGingrClassActivity(id: GingrRouteActivityId | null | undefined): boolean {
  if (!id) return false;
  return GINGR_ROUTE_ACTIVITY_BY_ID[id]?.category === "class";
}

export function dogHasClassActivity(activities: GingrRouteActivityId[]): boolean {
  return activities.some((id) => isGingrClassActivity(id));
}

const ACTIVITY_ORDER = new Map(GINGR_ROUTE_ACTIVITIES.map((activity, index) => [activity.id, index]));

const CATEGORY_RANK: Record<GingrRouteActivityCategory, number> = {
  class: 0,
  outing: 1,
  taxi: 2,
  club: 3
};

/** Class activities first so boarding+class dogs are not labeled Club. */
export function sortGingrRouteActivities(ids: Iterable<GingrRouteActivityId>): GingrRouteActivityId[] {
  return Array.from(new Set(ids)).sort((a, b) => {
    const catA = CATEGORY_RANK[GINGR_ROUTE_ACTIVITY_BY_ID[a]?.category ?? "club"] ?? 9;
    const catB = CATEGORY_RANK[GINGR_ROUTE_ACTIVITY_BY_ID[b]?.category ?? "club"] ?? 9;
    if (catA !== catB) return catA - catB;
    return (ACTIVITY_ORDER.get(a) ?? 99) - (ACTIVITY_ORDER.get(b) ?? 99);
  });
}

export function primarySubjectGroup(activities: GingrRouteActivityId[]): {
  id: GingrSubjectGroupId;
  label: string;
} {
  const ordered = sortGingrRouteActivities(activities);
  const classId = ordered.find((id) => isGingrClassActivity(id));
  if (classId && GINGR_ROUTE_ACTIVITY_BY_ID[classId]) {
    return { id: classId, label: GINGR_ROUTE_ACTIVITY_BY_ID[classId].label };
  }
  const first = ordered[0];
  if (first && GINGR_ROUTE_ACTIVITY_BY_ID[first]) {
    return { id: first, label: GINGR_ROUTE_ACTIVITY_BY_ID[first].label };
  }
  return { id: "club", label: "Other" };
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a Gingr service/type name to an eligible route activity (or null). */
export function matchGingrRouteActivity(
  rawName: string | null | undefined
): GingrRouteActivityMeta | null {
  try {
    const token = normalizeToken(String(rawName || ""));
    if (!token) return null;

    let best: GingrRouteActivityMeta | null = null;
    let bestLen = 0;
    for (const activity of GINGR_ROUTE_ACTIVITIES) {
      for (const alias of activity.aliases) {
        const aliasToken = normalizeToken(alias);
        if (!aliasToken) continue;
        if (token === aliasToken || token.includes(aliasToken)) {
          if (aliasToken.length > bestLen) {
            best = activity;
            bestLen = aliasToken.length;
          }
        }
      }
    }
    if (best) return best;
    const transport = classifyTransportationText(rawName);
    if (transport !== "UNKNOWN") return null;
    if (/\bgroup training\b/.test(token) || /\bactivity with trainer\b/.test(token)) {
      return GINGR_ROUTE_ACTIVITY_BY_ID.trainer_activity;
    }
    if (/\bactivity\b/.test(token) && /\btrainer\b/.test(token)) {
      return GINGR_ROUTE_ACTIVITY_BY_ID.trainer_activity;
    }
    return null;
  } catch {
    return null;
  }
}

/** FitDog/taxi home pickup — never owner club drop-off/pickup. */
export function isPickUpService(rawName: string | null | undefined) {
  const type = classifyTransportationText(rawName);
  return type === "FITDOG_HOME_PICKUP" || type === "TAXI";
}

/** FitDog home drop-off — never owner club pickup. */
export function isDropOffService(rawName: string | null | undefined) {
  return classifyTransportationText(rawName) === "FITDOG_HOME_DROPOFF";
}
