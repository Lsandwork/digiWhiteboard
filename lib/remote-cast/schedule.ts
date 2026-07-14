import type { SupabaseClient } from "@supabase/supabase-js";
import { bumpCastHardReloadNonce } from "@/lib/display-sync-server";
import { queueDisplayCommand } from "@/lib/display-keeper-server";
import {
  CAST_DISPLAY_TIMEZONE,
  getCastDisplaySchedulePhase,
  isCastDisplayMorningOpenWindow,
  partsInCastDisplayTimeZone,
  type CastDisplaySchedulePhase
} from "@/lib/remote-cast/hours";
import { issueCommand, listReceivers } from "@/lib/remote-cast/server";
import type { RemoteCastCommand } from "@/lib/remote-cast/types";

export type CastDisplayScheduleAction = {
  receiverId: string;
  displayName: string | null;
  command: RemoteCastCommand;
};

export type CastDisplayScheduleSummary = {
  phase: CastDisplaySchedulePhase;
  timezone: string;
  localHour: number;
  localMinute: number;
  morningRefresh: boolean;
  actions: CastDisplayScheduleAction[];
  keeperHardRefresh: boolean;
  pairedCount: number;
};

export {
  CAST_DISPLAY_TIMEZONE,
  CAST_DISPLAY_OPEN_HOUR,
  CAST_DISPLAY_CLOSE_HOUR,
  isCastDisplayOpenHours,
  getCastDisplaySchedulePhase,
  isCastDisplayMorningOpenWindow,
  castDisplayScheduleLabel
} from "@/lib/remote-cast/hours";

/**
 * Desired-state scheduler for Remote Cast + Cast Keeper morning kick.
 * Intentionally does NOT touch Gingr sync, live-board, or whiteboard data paths.
 * Idempotent: only issues commands when a display is out of the desired phase.
 */
export async function applyCastDisplaySchedule(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<CastDisplayScheduleSummary> {
  const timeZone = CAST_DISPLAY_TIMEZONE;
  const { hour: localHour, minute: localMinute } = partsInCastDisplayTimeZone(now, timeZone);
  const phase = getCastDisplaySchedulePhase(now, timeZone);
  const morningRefresh = phase === "open" && isCastDisplayMorningOpenWindow(now, timeZone);

  const receivers = await listReceivers(supabase);
  const paired = receivers.filter((receiver) => receiver.paired);
  const actions: CastDisplayScheduleAction[] = [];

  for (const receiver of paired) {
    if (phase === "open") {
      // Leave intentional admin BLACKOUT alone; only auto-wake idle standby.
      if (receiver.activeScreen === "standby") {
        const result = await issueCommand(supabase, {
          receiverId: receiver.id,
          command: "WAKE",
          createdBy: "cron:cast-display-schedule"
        });
        if (result.ok) {
          actions.push({
            receiverId: receiver.id,
            displayName: receiver.displayName,
            command: "WAKE"
          });
        }
        continue;
      }

      if (morningRefresh && (receiver.activeScreen === "lobby" || receiver.activeScreen === "staff")) {
        const result = await issueCommand(supabase, {
          receiverId: receiver.id,
          command: "REFRESH",
          createdBy: "cron:cast-display-schedule"
        });
        if (result.ok) {
          actions.push({
            receiverId: receiver.id,
            displayName: receiver.displayName,
            command: "REFRESH"
          });
        }
      }
      continue;
    }

    if (receiver.activeScreen === "lobby" || receiver.activeScreen === "staff") {
      const result = await issueCommand(supabase, {
        receiverId: receiver.id,
        command: "STANDBY",
        createdBy: "cron:cast-display-schedule"
      });
      if (result.ok) {
        actions.push({
          receiverId: receiver.id,
          displayName: receiver.displayName,
          command: "STANDBY"
        });
      }
    }
  }

  let keeperHardRefresh = false;
  if (morningRefresh) {
    await Promise.all([
      queueDisplayCommand(supabase, { displayType: "lobby_whiteboard", commandType: "hard_refresh" }),
      queueDisplayCommand(supabase, { displayType: "staff_whiteboard", commandType: "hard_refresh" })
    ]);
    await bumpCastHardReloadNonce(supabase);
    keeperHardRefresh = true;
  }

  return {
    phase,
    timezone: timeZone,
    localHour,
    localMinute,
    morningRefresh,
    actions,
    keeperHardRefresh,
    pairedCount: paired.length
  };
}
