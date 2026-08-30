import { getOrLoadTtlCache, withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { BOARD_OVERLAY_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { runDailyReminderDisplayScheduler } from "@/lib/staff/daily-reminder-display-scheduler";
import { loadGroomingPushBoardState, type GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import { loadCastVideoBoardState, type CastVideoNotice } from "@/lib/staff/cast-video-notices";
import { loadActiveStaffPushNotice, type StaffPushNotice } from "@/lib/staff/push-notices";
import { loadTrainerPushBoardState, type TrainerPushNotice } from "@/lib/staff/trainer-push-notices";
import { loadStaffWhiteboardThemeId } from "@/lib/staff/whiteboard-theme-settings";
import {
  DEFAULT_STAFF_WHITEBOARD_THEME_ID,
  type StaffWhiteboardThemeId
} from "@/lib/staff/whiteboard-themes";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const FEATURE_TIMEOUT_MS = 2500;

export type StaffBoardOverlays = {
  activePushNotice: StaffPushNotice | null;
  grooming: { activeNotice: GroomingPushNotice | null; queue: GroomingPushNotice[] };
  trainer: { activeNotice: TrainerPushNotice | null; queue: TrainerPushNotice[] };
  castVideo: { activeNotice: CastVideoNotice | null; queue: CastVideoNotice[] };
  emergencyCastVideo: { activeNotice: CastVideoNotice | null; queue: CastVideoNotice[] };
  /** Selected staff whiteboard visual theme — piggybacks on existing overlay poll (no extra client requests). */
  whiteboardTheme: StaffWhiteboardThemeId;
  healthy: {
    push: boolean;
    grooming: boolean;
    trainer: boolean;
    castVideo: boolean;
    emergencyCastVideo: boolean;
  };
  loadedAt: string;
};

const emptyOverlays = (): StaffBoardOverlays => ({
  activePushNotice: null,
  grooming: { activeNotice: null, queue: [] },
  trainer: { activeNotice: null, queue: [] },
  castVideo: { activeNotice: null, queue: [] },
  emergencyCastVideo: { activeNotice: null, queue: [] },
  whiteboardTheme: DEFAULT_STAFF_WHITEBOARD_THEME_ID,
  healthy: {
    push: false,
    grooming: false,
    trainer: false,
    castVideo: false,
    emergencyCastVideo: false
  },
  loadedAt: new Date().toISOString()
});

async function safeLoad<T>(loader: () => Promise<T>, fallback: T, label: string): Promise<{ value: T; ok: boolean }> {
  try {
    const value = await withTimeoutOrThrow(loader(), FEATURE_TIMEOUT_MS, label);
    return { value, ok: true };
  } catch {
    return { value: fallback, ok: false };
  }
}

export async function loadStaffBoardOverlays(
  supabase: SupabaseClient,
  options: { department?: string; runScheduler?: boolean } = {}
): Promise<StaffBoardOverlays> {
  const department = options.department ?? "staff_whiteboard";
  const cacheKey = `board-overlays:${department}`;

  return getOrLoadTtlCache(cacheKey, BOARD_OVERLAY_CACHE_TTL_MS, async () => {
    // Never block overlays on the daily-reminder scheduler.
    if (options.runScheduler !== false) {
      void runDailyReminderDisplayScheduler(supabase).catch(() => undefined);
    }

    const emptyGrooming = {
      activeNotice: null as GroomingPushNotice | null,
      queue: [] as GroomingPushNotice[]
    };
    const emptyTrainer = {
      activeNotice: null as TrainerPushNotice | null,
      queue: [] as TrainerPushNotice[]
    };
    const emptyCast = {
      activeNotice: null as CastVideoNotice | null,
      queue: [] as CastVideoNotice[]
    };

    const [push, grooming, trainer, castVideo, emergencyCastVideo, theme] = await Promise.all([
      safeLoad(
        () => loadActiveStaffPushNotice(supabase, { mutate: false }),
        null as StaffPushNotice | null,
        "staff-push"
      ),
      safeLoad(() => loadGroomingPushBoardState(supabase, { mutate: false }), emptyGrooming, "grooming-push"),
      safeLoad(() => loadTrainerPushBoardState(supabase, { mutate: false }), emptyTrainer, "trainer-push"),
      safeLoad(
        () => loadCastVideoBoardState(supabase, { department, emergencyOnly: false, mutate: false }),
        emptyCast,
        "cast-video"
      ),
      safeLoad(
        () => loadCastVideoBoardState(supabase, { department, emergencyOnly: true, mutate: false }),
        emptyCast,
        "emergency-cast-video"
      ),
      safeLoad(() => loadStaffWhiteboardThemeId(supabase), DEFAULT_STAFF_WHITEBOARD_THEME_ID, "whiteboard-theme")
    ]);

    return {
      activePushNotice: push.value,
      grooming: grooming.value,
      trainer: trainer.value,
      castVideo: castVideo.value,
      emergencyCastVideo: emergencyCastVideo.value,
      whiteboardTheme: theme.value,
      healthy: {
        push: push.ok,
        grooming: grooming.ok,
        trainer: trainer.ok,
        castVideo: castVideo.ok,
        emergencyCastVideo: emergencyCastVideo.ok
      },
      loadedAt: new Date().toISOString()
    };
  });
}

export function emptyStaffBoardOverlays() {
  return emptyOverlays();
}
