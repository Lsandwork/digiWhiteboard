import type { TlBoardAdditionalServiceRow } from "./types";

/**
 * Static checklist on the Team Lead Alerts + Reminders TV whiteboard.
 * Distinct from scheduled Team Lead push reminders (`lib/tl-digi-board/reminders.ts`).
 */
export const TL_DAILY_TEAM_REMINDERS = [
  "Body checks: AM / Midday / PM",
  "Engage with the dogs",
  "No phones on yard",
  "Make sure to check Walk Board",
  "Upload Photos & Report Cards",
  "Update the team log"
] as const;

/** Show Daily Team Reminders when unique incomplete Additional Service dogs are at or below this. */
export const TL_DAILY_TEAM_REMINDERS_MAX_UNIQUE_DOGS = 5;

/**
 * Count distinct dogs among incomplete Additional Service rows.
 * Prefer Gingr animal id; never inflate from multi-service dogs.
 */
export function countUniqueAdditionalServiceDogs(
  services: ReadonlyArray<Pick<TlBoardAdditionalServiceRow, "gingrAnimalId">>
): number {
  const ids = new Set<string>();
  for (const row of services) {
    const id = String(row.gingrAnimalId ?? "").trim();
    if (id) ids.add(id);
  }
  return ids.size;
}

/**
 * Exactly 5 unique dogs → show. Exactly 6 → hide.
 * Only call with the resolved Additional Services list (already incomplete-only on the board payload).
 */
export function shouldShowDailyTeamReminders(uniqueDogCount: number): boolean {
  return uniqueDogCount <= TL_DAILY_TEAM_REMINDERS_MAX_UNIQUE_DOGS;
}

export function shouldShowDailyTeamRemindersForServices(
  services: ReadonlyArray<Pick<TlBoardAdditionalServiceRow, "gingrAnimalId">>
): boolean {
  return shouldShowDailyTeamReminders(countUniqueAdditionalServiceDogs(services));
}
