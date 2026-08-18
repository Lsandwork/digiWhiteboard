import { loadAdminSettings } from "@/lib/admin/settings";
import { getDayKey, getShiftDate, listDailyRemindersWithState } from "@/lib/staff/daily-reminders";
import { listStaffPushNotices } from "@/lib/staff/push-notices";
import { loadTlDigiBoardSnapshot } from "@/lib/tl-digi-board/server";
import { loadWalkBoardPublicState } from "@/lib/walks-board/server";
import { assembleRuffopsChecklistItems, summarizeChecklist } from "./assemble";
import { listChecklistCompletions } from "./completions";
import { ensureRuffopsChecklistSchema } from "./ensure-schema";
import type { RuffopsChecklistState } from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function loadRuffopsChecklistState(
  supabase: SupabaseClient,
  options?: {
    userId?: string | null;
    legacyRole?: string | null;
    email?: string | null;
    now?: Date;
  }
): Promise<RuffopsChecklistState> {
  const now = options?.now ?? new Date();
  await ensureRuffopsChecklistSchema(supabase).catch(() => undefined);
  const settings = await loadAdminSettings(supabase);
  const timeZone = settings.timezone || "America/Los_Angeles";
  const shiftDate = getShiftDate(timeZone, now);
  const dayKey = getDayKey(timeZone, now);

  const [snapshot, reminderState, walks, notices, completions] = await Promise.all([
    loadTlDigiBoardSnapshot(supabase).catch(() => null),
    listDailyRemindersWithState(supabase, { timeZone }),
    loadWalkBoardPublicState(supabase, {
      userId: options?.userId,
      legacyRole: options?.legacyRole,
      email: options?.email,
      now
    }).catch(() => null),
    listStaffPushNotices(supabase, 80),
    listChecklistCompletions(supabase, shiftDate)
  ]);

  const items = assembleRuffopsChecklistItems({
    now,
    shiftDate,
    timeZone,
    dayKey,
    medications: snapshot?.medications ?? [],
    additionalServices: snapshot?.additionalServices ?? [],
    reminders: reminderState.reminders,
    walkCycles: walks?.todayCycles ?? [],
    notices,
    completions
  });

  return {
    shiftDate,
    timezone: timeZone,
    generatedAt: now.toISOString(),
    summary: summarizeChecklist(items),
    items,
    gingrSync: snapshot
      ? {
          health: snapshot.meta.gingrSyncHealth,
          lastSuccessfulSyncAt: snapshot.meta.lastSuccessfulSyncAt,
          isStale: snapshot.meta.isStale
        }
      : null
  };
}
