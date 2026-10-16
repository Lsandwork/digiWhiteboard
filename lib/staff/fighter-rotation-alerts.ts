import {
  fetchCurrentlyCheckedInDogs,
  fetchFighterRotationIcon,
  fetchGingrCustomAnimalIcons,
  isFighterRotationIcon,
  type CheckedInGingrDog,
  type FighterRotationIcon
} from "@/lib/gingr-custom-animal-icons";
import { sendFighterRotationCheckInEmail } from "@/lib/staff/fighter-rotation-email";
import {
  createAndPushStaffNotice,
  FIGHTER_ROTATION_PUSH_SOURCE,
  loadActiveStaffPushNotice,
  type StaffPushNoticeInput
} from "@/lib/staff/push-notices";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const FIGHTER_ROTATION_NOTICE_SOURCE = FIGHTER_ROTATION_PUSH_SOURCE;
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
  // Board renders these verbatim (large) — keep the full icon comment/note text, tags stripped.
  const commentBlock = conflict.comments.map((comment) => stripHtml(comment)).filter(Boolean).join("\n\n");
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
  dog: Pick<LiveDog, "gingr_animal_id" | "animal_name" | "id" | "owner_name">
) {
  const arrivingAnimalId = dog.gingr_animal_id ? String(dog.gingr_animal_id) : "";
  const arrivingDogName = String(dog.animal_name ?? "").trim();
  if (!arrivingAnimalId || !arrivingDogName) {
    return { alerted: false as const, emailed: false as const, reason: "missing_animal" as const };
  }

  // Fetch the arriving dog's icon first: the contact@ email fires for EVERY
  // Fighter/Rotation dog checking in, even with no conflict / no other dogs in.
  let arrivingIcon: FighterRotationIcon | null = null;
  try {
    arrivingIcon = await fetchFighterRotationIcon(arrivingAnimalId);
  } catch (error) {
    console.error("fighter-rotation: arriving icon fetch failed", error);
  }
  // An icon with no comment text still counts — the email shows that no note text was returned.
  let hasFighterRotationIcon = Boolean(arrivingIcon);
  if (!arrivingIcon) {
    try {
      const rawIcons = await fetchGingrCustomAnimalIcons(arrivingAnimalId);
      const raw = rawIcons.find((icon) => isFighterRotationIcon(icon));
      if (raw) {
        hasFighterRotationIcon = true;
        arrivingIcon = {
          animalId: arrivingAnimalId,
          title: raw.title,
          comment: raw.comment ?? "",
          iconId: raw.id
        };
      }
    } catch {
      // Icon lookup already logged above; whiteboard/email simply will not fire.
    }
  }

  const emailArrivingDog = async (comments: string[]) => {
    if (!hasFighterRotationIcon) return false;
    try {
      const result = await sendFighterRotationCheckInEmail({
        dogName: arrivingDogName,
        ownerName: dog.owner_name ?? null,
        comments,
        checkedInAt: new Date().toISOString()
      });
      if (!result.ok) {
        console.error("fighter-rotation: check-in email failed", result.error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("fighter-rotation: check-in email failed", error);
      return false;
    }
  };

  let checkedInDogs: CheckedInGingrDog[];
  try {
    checkedInDogs = await fetchCurrentlyCheckedInDogs();
  } catch (error) {
    console.error("fighter-rotation: checked-in fetch failed", error);
    // Whiteboard conflict check needs the checked-in list; the email does not.
    const emailed = await emailArrivingDog(
      arrivingIcon?.comment ? [`${arrivingDogName}: ${arrivingIcon.comment}`] : []
    );
    return { alerted: false as const, emailed, reason: "checked_in_fetch_failed" as const };
  }

  // Ensure arriving dog is considered present even if Gingr stamp lags the webhook.
  if (!checkedInDogs.some((row) => row.animalId === arrivingAnimalId)) {
    checkedInDogs = [
      ...checkedInDogs,
      { animalId: arrivingAnimalId, dogName: arrivingDogName, ownerName: null, reservationId: null }
    ];
  }

  const others = checkedInDogs.filter((row) => row.animalId !== arrivingAnimalId);

  const otherIcons = new Map<string, FighterRotationIcon | null>();
  if (others.length) {
    await mapPool(others, 4, async (other) => {
      try {
        otherIcons.set(other.animalId, await fetchFighterRotationIcon(other.animalId));
      } catch (error) {
        console.error("fighter-rotation: other icon fetch failed", other.animalId, error);
        otherIcons.set(other.animalId, null);
      }
      return other.animalId;
    });
  }

  const conflict = others.length
    ? evaluateFighterRotationConflicts({
        arrivingAnimalId,
        arrivingDogName,
        arrivingIcon,
        checkedInDogs,
        otherIcons
      })
    : null;

  // Every Fighter/Rotation check-in emails contact@ with the icon comments/notes.
  // Webhook caller already drops continuing/duplicate transitions, so this runs
  // once per check-in session. Whiteboard dedupe below must not block the email,
  // and an already-active board notice means this check-in was already handled.
  let emailed = false;
  if (hasFighterRotationIcon) {
    const noticeInputForActiveCheck = conflict ? buildFighterRotationNoticeInput(conflict) : null;
    const active = await loadActiveStaffPushNotice(supabase, { mutate: false }).catch(() => null);
    const alreadyActive =
      Boolean(active?.is_active && active.source === FIGHTER_ROTATION_NOTICE_SOURCE) &&
      Boolean(active?.message?.includes(arrivingDogName)) &&
      (!noticeInputForActiveCheck ||
        active?.source_id === noticeInputForActiveCheck.source_id ||
        !conflict ||
        !conflict.relatedDogs.length ||
        conflict.relatedDogs.every((related) => Boolean(active?.message?.includes(related.dogName))));
    if (!alreadyActive) {
      emailed = await emailArrivingDog(
        conflict?.comments ?? (arrivingIcon?.comment ? [`${arrivingDogName}: ${arrivingIcon.comment}`] : [])
      );
    } else {
      return { alerted: false as const, emailed: false as const, reason: "already_active" as const, conflict };
    }
  }

  if (!others.length) {
    return { alerted: false as const, emailed, reason: "no_other_checked_in" as const };
  }

  if (!conflict) {
    return { alerted: false as const, emailed, reason: "no_conflict" as const };
  }

  const noticeInput = buildFighterRotationNoticeInput(conflict);
  const notice = await createAndPushStaffNotice(supabase, noticeInput, "gingr_checkin");
  return { alerted: true as const, emailed, notice, conflict };
}
