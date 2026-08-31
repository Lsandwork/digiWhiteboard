/**
 * Eligible Gingr activities for the Gingr Route Generator.
 * Centralized metadata — colors stay restrained and professional.
 */

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
  | "reliable_recall";

export type GingrRouteActivityMeta = {
  id: GingrRouteActivityId;
  label: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  aliases: string[];
};

export const GINGR_ROUTE_ACTIVITIES: GingrRouteActivityMeta[] = [
  {
    id: "adventure_hike",
    label: "Adventure Hike",
    accent: "#2F9E6B",
    accentSoft: "#E8F6EF",
    accentText: "#1B6B46",
    aliases: ["adventure hike", "adventure hikes"]
  },
  {
    id: "beach_excursion",
    label: "Beach Excursion",
    accent: "#2F80ED",
    accentSoft: "#E8F1FC",
    accentText: "#1A5BB5",
    aliases: ["beach excursion", "beach excursions"]
  },
  {
    id: "recall_at_the_beach",
    label: "Recall At The Beach",
    accent: "#3B82F6",
    accentSoft: "#EAF2FE",
    accentText: "#1D4ED8",
    aliases: ["recall at the beach", "recall at beach", "beach recall"]
  },
  {
    id: "canine_fitness",
    label: "Canine Fitness",
    accent: "#7C3AED",
    accentSoft: "#F1E9FE",
    accentText: "#5B21B6",
    aliases: ["canine fitness", "canine conditioning"]
  },
  {
    id: "cool_tricks",
    label: "Cool Tricks",
    accent: "#DB2777",
    accentSoft: "#FCE7F3",
    accentText: "#9D174D",
    aliases: ["cool tricks"]
  },
  {
    id: "fun_and_fit_agility",
    label: "Fun & Fit Agility",
    accent: "#EA580C",
    accentSoft: "#FFF1E7",
    accentText: "#C2410C",
    aliases: ["fun & fit agility", "fun and fit agility", "fun & fit"]
  },
  {
    id: "scent_works",
    label: "Scent Works",
    accent: "#E11D48",
    accentSoft: "#FFE4E9",
    accentText: "#9F1239",
    aliases: ["scent works", "scent work", "nose work"]
  },
  {
    id: "leash_manners",
    label: "Leash Manners",
    accent: "#0D9488",
    accentSoft: "#E6FAF7",
    accentText: "#0F766E",
    aliases: ["leash manners", "leash manner"]
  },
  {
    id: "foundations_and_focus",
    label: "Foundations & Focus",
    accent: "#CA8A04",
    accentSoft: "#FEF9C3",
    accentText: "#A16207",
    aliases: ["foundations & focus", "foundations and focus", "trail foundations"]
  },
  {
    id: "reliable_recall",
    label: "Reliable Recall",
    accent: "#8B5CF6",
    accentSoft: "#F3E8FF",
    accentText: "#6D28D9",
    aliases: ["reliable recall"]
  }
];

export const GINGR_ROUTE_ACTIVITY_BY_ID = Object.fromEntries(
  GINGR_ROUTE_ACTIVITIES.map((a) => [a.id, a])
) as Record<GingrRouteActivityId, GingrRouteActivityMeta>;

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
  return best;
}

export function isPickUpService(rawName: string | null | undefined) {
  const token = normalizeToken(String(rawName || ""));
  if (!token) return false;
  if (/\bpick ?up\b/.test(token) || /\bpickup\b/.test(token)) return true;
  if (/\bdrop ?off\b/.test(token) || /\bdropoff\b/.test(token)) return false;
  return /\btaxi\b/.test(token) || /\btransport\b/.test(token) || /\bdoor to door\b/.test(token);
}

export function isDropOffService(rawName: string | null | undefined) {
  const token = normalizeToken(String(rawName || ""));
  if (!token) return false;
  return /\bdrop ?off\b/.test(token) || /\bdropoff\b/.test(token);
}
