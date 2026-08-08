import {
  fetchCurrentlyCheckedInDogs,
  fetchFighterRotationIcon,
  type CheckedInGingrDog,
  type FighterRotationIcon
} from "@/lib/gingr-custom-animal-icons";
import {
  createAndPushStaffNotice,
  loadActiveStaffPushNotice,
  type StaffPushNoticeInput
} from "@/lib/staff/push-notices";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const FIGHTER_ROTATION_NOTICE_SOURCE = "fighter_rotation";
export const FIGHTER_ROTATION_NOTICE_TITLE = "FIGHTER / ROTATIONS";
const FIGHTER_ROTATION_DURATION_MINUTES = 8;

export type FighterRotationConflict = {
  arrivingAnimalId: string;
  arrivingDogName: string;
  relatedDogs: Array<{ animalId: string; dogName: string }>;
  comments: string[];
  sourceComment: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `comment` mentions `dogName` as a whole token (supports multi-word names). */
export function commentMentionsDogName(comment: string, dogName: string) {
  const haystack = stripHtml(comment);
  const name = String(dogName ?? "").trim();
  if (!haystack || name.length < 2) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
  return pattern.test(haystack);
}

export function findDogsMentionedInComment(
  comment: string,
  candidates: Array<{ animalId: string; dogName: string }>,
  options?: { excludeAnimalId?: string | null }
) {
  const exclude = options?.excludeAnimalId ? String(options.excludeAnimalId) : null;
  const sorted = [...candidates]
    .filter((dog) => dog.animalId && dog.dogName && dog.animalId !== exclude)
    .sort((a, b) => b.dogName.length - a.dogName.length);

  const matches: Array<{ animalId: string; dogName: string }> = [];
  const seen = new Set<string>();
  for (const dog of sorted) {
    if (!commentMentionsDogName(comment, dog.dogName)) continue;
    if (seen.has(dog.animalId)) continue;
    seen.add(dog.animalId);
    matches.push({ animalId: dog.animalId, dogName: dog.dogName });
  }
  return matches;
}

export function buildFighterRotationNoticeInput(conflict: FighterRotationConflict): StaffPushNoticeInput {
  const related = conflict.relatedDogs.map((dog) => dog.dogName).join(", ");
  const commentBlock = conflict.comments.filter(Boolean).join("\n\n");
  const message = [
    `${conflict.arrivingDogName} is checking in.`,
    related ? `Named in notes / also checked in: ${related}.` : "Other dogs are currently checked in.",
    commentBlock ? `Fighter/Rotations: ${commentBlock}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const relatedIds = conflict.relatedDogs.map((dog) => dog.animalId).sort().join("-") || "present";
  return {
    title: FIGHTER_ROTATION_NOTICE_TITLE,
    message,
    priority: "urgent",
    display_mode: "urgent",
    display_duration_minutes: FIGHTER_ROTATION_DURATION_MINUTES,
    is_default: false,
    source: FIGHTER_ROTATION_NOTICE_SOURCE,
    source_id: `${conflict.arrivingAnimalId}:${relatedIds}`.slice(0, 80)
  };
}

export function evaluateFighterRotationConflicts(input: {
  arrivingAnimalId: string;
  arrivingDogName: string;
  arrivingIcon: FighterRotationIcon | null;
  checkedInDogs: CheckedInGingrDog[];
  otherIcons: Map<string, FighterRotationIcon | null>;
}): FighterRotationConflict | null {
  const arrivingId = String(input.arrivingAnimalId ?? "").trim();
  const arrivingName = String(input.arrivingDogName ?? "").trim();
  if (!arrivingId || !arrivingName) return null;

  const others = input.checkedInDogs.filter((dog) => dog.animalId !== arrivingId);
  if (!others.length) return null;

  const related = new Map<string, { animalId: string; dogName: string }>();
  const comments: string[] = [];

  // Arriving dog has Fighter/Rotations notes and others are already in — surface Gingr comments.
  if (input.arrivingIcon?.comment) {
    const mentioned = findDogsMentionedInComment(input.arrivingIcon.comment, others, {
      excludeAnimalId: arrivingId
    });
    for (const dog of mentioned) related.set(dog.animalId, dog);
    comments.push(`${arrivingName}: ${input.arrivingIcon.comment}`);
  }

  // Other checked-in dogs whose Fighter/Rotations notes name the arriving dog.
  for (const other of others) {
    const icon = input.otherIcons.get(other.animalId) ?? null;
    if (!icon?.comment) continue;
    if (!commentMentionsDogName(icon.comment, arrivingName)) continue;
    related.set(other.animalId, { animalId: other.animalId, dogName: other.dogName });
    comments.push(`${other.dogName}: ${icon.comment}`);
  }

  if (!comments.length) return null;

  return {
    arrivingAnimalId: arrivingId,
    arrivingDogName: arrivingName,
    relatedDogs: [...related.values()].sort((a, b) => a.dogName.localeCompare(b.dogName)),
    comments,
    sourceComment: comments[0] ?? input.arrivingIcon?.comment ?? ""
  };
}

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  });
  await Promise.all(runners);
  return results;
}

export async function evaluateFighterRotationAlertForCheckIn(
  supabase: SupabaseClient,
  dog: Pick<LiveDog, "gingr_animal_id" | "animal_name" | "id">
) {
  const arrivingAnimalId = dog.gingr_animal_id ? String(dog.gingr_animal_id) : "";
  const arrivingDogName = String(dog.animal_name ?? "").trim();
  if (!arrivingAnimalId || !arrivingDogName) {
    return { alerted: false as const, reason: "missing_animal" as const };
  }

  let checkedInDogs: CheckedInGingrDog[];
  try {
    checkedInDogs = await fetchCurrentlyCheckedInDogs();
  } catch (error) {
    console.error("fighter-rotation: checked-in fetch failed", error);
    return { alerted: false as const, reason: "checked_in_fetch_failed" as const };
  }

  // Ensure arriving dog is considered present even if Gingr stamp lags the webhook.
  if (!checkedInDogs.some((row) => row.animalId === arrivingAnimalId)) {
    checkedInDogs = [
      ...checkedInDogs,
      { animalId: arrivingAnimalId, dogName: arrivingDogName, ownerName: null, reservationId: null }
    ];
  }

  const others = checkedInDogs.filter((row) => row.animalId !== arrivingAnimalId);
  if (!others.length) {
    return { alerted: false as const, reason: "no_other_checked_in" as const };
  }

  let arrivingIcon: FighterRotationIcon | null = null;
  try {
    arrivingIcon = await fetchFighterRotationIcon(arrivingAnimalId);
  } catch (error) {
    console.error("fighter-rotation: arriving icon fetch failed", error);
  }

  const otherIcons = new Map<string, FighterRotationIcon | null>();
  await mapPool(others, 4, async (other) => {
    try {
      otherIcons.set(other.animalId, await fetchFighterRotationIcon(other.animalId));
    } catch (error) {
      console.error("fighter-rotation: other icon fetch failed", other.animalId, error);
      otherIcons.set(other.animalId, null);
    }
    return other.animalId;
  });

  const conflict = evaluateFighterRotationConflicts({
    arrivingAnimalId,
    arrivingDogName,
    arrivingIcon,
    checkedInDogs,
    otherIcons
  });

  if (!conflict) {
    return { alerted: false as const, reason: "no_conflict" as const };
  }

  const noticeInput = buildFighterRotationNoticeInput(conflict);
  const active = await loadActiveStaffPushNotice(supabase, { mutate: false }).catch(() => null);
  if (
    active?.is_active &&
    active.source === FIGHTER_ROTATION_NOTICE_SOURCE &&
    (active.source_id === noticeInput.source_id ||
      (Boolean(active.message?.includes(arrivingDogName)) &&
        conflict.relatedDogs.every((dog) => Boolean(active.message?.includes(dog.dogName)))))
  ) {
    return { alerted: false as const, reason: "already_active" as const, conflict };
  }

  const notice = await createAndPushStaffNotice(supabase, noticeInput, "gingr_checkin");
  return { alerted: true as const, notice, conflict };
}
