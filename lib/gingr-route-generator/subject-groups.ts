import {
  GINGR_ROUTE_ACTIVITIES,
  GINGR_ROUTE_ACTIVITY_BY_ID,
  dogHasClassActivity,
  isGingrClassActivity,
  type GingrRouteActivityId
} from "@/lib/gingr-route-generator/activities";
import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";

export type GingrActivityFilter = GingrRouteActivityId | "all" | "class";

export type GingrSubjectSubgroup = {
  id: GingrRouteActivityId;
  label: string;
  dogs: GingrRouteDog[];
};

export type GingrSubjectGroup = {
  id: string;
  label: string;
  dogs: GingrRouteDog[];
  subgroups: GingrSubjectSubgroup[];
};

/** Club filter never includes class dogs, even if they are also boarding. */
export function dogMatchesActivityFilter(dog: GingrRouteDog, filter: GingrActivityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "class") return dogHasClassActivity(dog.activities);
  if (filter === "club") return dog.activities.includes("club") && !dogHasClassActivity(dog.activities);
  if (isGingrClassActivity(filter)) return dog.activities.includes(filter);
  return !dogHasClassActivity(dog.activities) && dog.activities.includes(filter);
}

function sortDogs(a: GingrRouteDog, b: GingrRouteDog): number {
  return a.name.localeCompare(b.name);
}

/**
 * List grouping: class dogs go under that class name (Leash Manners, etc.).
 * Boarding does not steal them into Club when they have a same-day class.
 */
export function groupDogsBySubject(dogs: GingrRouteDog[]): GingrSubjectGroup[] {
  const classById = new Map<GingrRouteActivityId, GingrRouteDog[]>();
  const buckets = new Map<string, GingrSubjectGroup>();

  for (const activity of GINGR_ROUTE_ACTIVITIES) {
    if (activity.category === "class") continue;
    buckets.set(activity.id, {
      id: activity.id,
      label: activity.label,
      dogs: [],
      subgroups: []
    });
  }

  const other: GingrSubjectGroup = { id: "other", label: "Other", dogs: [], subgroups: [] };

  for (const dog of dogs) {
    if (dogHasClassActivity(dog.activities)) {
      for (const classId of dog.activities.filter((id) => isGingrClassActivity(id))) {
        const list = classById.get(classId) ?? [];
        list.push(dog);
        classById.set(classId, list);
      }
      continue;
    }
    const bucketId = dog.activities.find((id) => buckets.has(id));
    if (bucketId) buckets.get(bucketId)!.dogs.push(dog);
    else other.dogs.push(dog);
  }

  const groups: GingrSubjectGroup[] = [];
  for (const activity of GINGR_ROUTE_ACTIVITIES) {
    if (activity.category !== "class") continue;
    const list = classById.get(activity.id);
    if (!list?.length) continue;
    list.sort(sortDogs);
    groups.push({
      id: activity.id,
      label: activity.label,
      dogs: list,
      subgroups: [{ id: activity.id, label: activity.label, dogs: list }]
    });
  }

  for (const activity of GINGR_ROUTE_ACTIVITIES) {
    if (activity.category === "class") continue;
    const bucket = buckets.get(activity.id);
    if (!bucket?.dogs.length) continue;
    bucket.dogs.sort(sortDogs);
    groups.push(bucket);
  }

  if (other.dogs.length) {
    other.dogs.sort(sortDogs);
    groups.push(other);
  }

  return groups;
}

export function subjectGroupAccent(groupId: string): {
  accent: string;
  accentSoft: string;
  accentText: string;
} {
  if (groupId === "class") {
    return { accent: "#0F766E", accentSoft: "#CCFBF1", accentText: "#115E59" };
  }
  const meta = GINGR_ROUTE_ACTIVITY_BY_ID[groupId as GingrRouteActivityId];
  if (meta) return { accent: meta.accent, accentSoft: meta.accentSoft, accentText: meta.accentText };
  return { accent: "#64748B", accentSoft: "#F1F5F9", accentText: "#334155" };
}
