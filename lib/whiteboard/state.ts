import { createHash } from "crypto";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { cachedLoadLobbySettings, WHITEBOARD_STATE_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { loadFastBoardTransitions } from "@/lib/board-fast-checkout";
import { loadDisplaySyncState } from "@/lib/display-sync-server";
import { loadLobbyCheckoutDogsFast } from "@/lib/lobby/checkout";
import type { LobbyCheckoutDog, LobbySettings } from "@/lib/lobby/types";
import { runDailyReminderDisplayScheduler } from "@/lib/staff/daily-reminder-display-scheduler";
import { loadGroomingPushBoardState, type GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import { loadCastVideoBoardState, type CastVideoNotice } from "@/lib/staff/cast-video-notices";
import { isDailyReminderPushNotice, loadActiveStaffPushNotice, type StaffPushNotice } from "@/lib/staff/push-notices";
import { isYardPushCastNotice } from "@/lib/staff/yard-push-notices";
import { getOrLoadTtlCache, setTtlCache, withTimeoutFallback } from "@/lib/server-ttl-cache";
import type { LiveDog } from "@/lib/types";
import type { CastBoardType } from "@/lib/whiteboard/cast-options";

const FEATURE_TIMEOUT_MS = 2500;

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const WHITEBOARD_STATE_POLL_MS = 6000;
export const WHITEBOARD_STATE_ALERT_POLL_MS = 4000;

export type CastLiteDog = {
  id: string;
  gingr_animal_id: string | null;
  animal_name: string;
  owner_name: string | null;
  photo_url: string | null;
  room: string | null;
  display_status: "checking_in" | "checking_out";
  status_started_at: string | null;
  display_until: string | null;
};

export type CastLitePushNotice = {
  id: string;
  title: string;
  message: string | null;
  priority: StaffPushNotice["priority"];
  display_mode: StaffPushNotice["display_mode"];
  notice_type?: StaffPushNotice["notice_type"];
  complaint_category?: StaffPushNotice["complaint_category"];
  dog_handler_name?: string | null;
  expires_at: string | null;
  is_daily_reminder: boolean;
  daily_reminder_scheduled_time?: string | null;
  daily_reminder_audience?: string[] | null;
  daily_reminder_sent_by_name?: string | null;
  daily_reminder_footer?: string | null;
};

export type CastLiteGroomingPush = {
  id: string;
  dog_id: string | null;
  dog_name: string;
  dog_photo_url: string | null;
  owner_name: string | null;
  owner_initial: string | null;
  service: string;
  groomer_name: string;
  action: string;
  notes: string | null;
  safety_tags: string[];
  requested_at: string;
  expires_at: string;
  gingr_display_status?: string | null;
  user_notes?: string | null;
};

export type CastLiteVideoPush = {
  id: string;
  title: string;
  video_url: string;
  mime_type: string | null;
  thumbnail_url: string | null;
  expires_at: string | null;
};

export type StaffWhiteboardStatePayload = {
  boardType: "staff";
  checkingInDogs: CastLiteDog[];
  checkingOutDogs: CastLiteDog[];
  activePushNotice: CastLitePushNotice | null;
  activeGroomingPush: CastLiteGroomingPush | null;
  activeDailyReminder: CastLitePushNotice | null;
  activeVideoPush: CastLiteVideoPush | null;
  footerMessage: string | null;
  lastUpdated: string;
};

export type LobbyWhiteboardStatePayload = {
  boardType: "lobby";
  featured: LobbyCheckoutDog | null;
  queue: LobbyCheckoutDog[];
  activeCount: number;
  settings: Pick<LobbySettings, "footer_message" | "lobby_message" | "show_events" | "show_promotions">;
  lastUpdated: string;
};

export type WhiteboardStatePayload = StaffWhiteboardStatePayload | LobbyWhiteboardStatePayload;

export type WhiteboardStateResponse = {
  version: string;
  updatedAt: string;
  boardType: CastBoardType;
  syncRevision: number;
  payload: WhiteboardStatePayload;
};

function optimizeCastPhotoUrl(url: string | null | undefined) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return null;
  return trimmed;
}

function toCastLiteDog(dog: LiveDog, displayStatus: "checking_in" | "checking_out"): CastLiteDog {
  return {
    id: dog.id,
    gingr_animal_id: dog.gingr_animal_id,
    animal_name: dog.animal_name,
    owner_name: dog.owner_name,
    photo_url: optimizeCastPhotoUrl(dog.photo_url ?? resolveDogPhotoUrl(dog)),
    room: dog.room,
    display_status: displayStatus,
    status_started_at: dog.status_started_at,
    display_until: dog.display_until
  };
}

function toCastLitePushNotice(notice: StaffPushNotice | null): CastLitePushNotice | null {
  if (!notice) return null;
  return {
    id: notice.id,
    title: notice.title,
    message: notice.message,
    priority: notice.priority,
    display_mode: notice.display_mode,
    notice_type: notice.notice_type,
    complaint_category: notice.complaint_category,
    dog_handler_name: notice.dog_handler_name,
    expires_at: notice.expires_at,
    is_daily_reminder: isDailyReminderPushNotice(notice),
    daily_reminder_scheduled_time: notice.daily_reminder_scheduled_time,
    daily_reminder_audience: notice.daily_reminder_audience,
    daily_reminder_sent_by_name: notice.daily_reminder_sent_by_name,
    daily_reminder_footer: notice.daily_reminder_footer
  };
}

function toCastLiteGroomingPush(notice: GroomingPushNotice | null | undefined): CastLiteGroomingPush | null {
  if (!notice) return null;
  return {
    id: notice.id,
    dog_id: notice.dog_id,
    dog_name: notice.dog_name,
    dog_photo_url: optimizeCastPhotoUrl(notice.dog_photo_url),
    owner_name: notice.owner_name,
    owner_initial: notice.owner_initial,
    service: notice.service,
    groomer_name: notice.groomer_name,
    action: notice.action,
    notes: notice.notes,
    safety_tags: notice.safety_tags ?? [],
    requested_at: notice.requested_at,
    expires_at: notice.expires_at,
    gingr_display_status: notice.gingr_display_status,
    user_notes: notice.user_notes
  };
}

function isLocalVideoNotice(notice: CastVideoNotice) {
  if (isYardPushCastNotice(notice)) return false;
  const mime = String(notice.mime_type ?? "").toLowerCase();
  if (mime.includes("youtube")) return false;
  if (String(notice.video_url ?? "").includes("youtube.com")) return false;
  return mime.startsWith("video/") || /\.(mp4|webm)(\?|$)/i.test(String(notice.video_url ?? ""));
}

function toCastLiteVideoPush(notice: CastVideoNotice | null, allowVideo: boolean): CastLiteVideoPush | null {
  if (!notice || !allowVideo || !isLocalVideoNotice(notice)) return null;
  const videoUrl = String(notice.video_url ?? "").trim();
  if (!videoUrl) return null;
  return {
    id: notice.id,
    title: notice.title,
    video_url: videoUrl,
    mime_type: notice.mime_type,
    thumbnail_url: notice.thumbnail_url,
    expires_at: notice.expires_at
  };
}

function hashStatePayload(payload: WhiteboardStatePayload, syncRevision: number) {
  const { lastUpdated: _lastUpdated, ...stablePayload } = payload;
  return createHash("sha256")
    .update(JSON.stringify({ syncRevision, payload: stablePayload }))
    .digest("hex")
    .slice(0, 16);
}

export async function buildStaffWhiteboardState(
  supabase: SupabaseClient,
  options: { allowVideo?: boolean } = {}
): Promise<WhiteboardStateResponse> {
  const now = new Date();
  const allowVideo = options.allowVideo !== false;

  // Never block cast state on the reminder scheduler.
  void runDailyReminderDisplayScheduler(supabase).catch(() => undefined);

  const emptyGrooming = {
    activeNotice: null as GroomingPushNotice | null,
    queue: [] as GroomingPushNotice[]
  };
  const emptyCast = { activeNotice: null as CastVideoNotice | null, queue: [] as CastVideoNotice[] };
  const emptySync = {
    display_content_revision: 0,
    cast_hard_reload_nonce: 0,
    build_id: "unknown",
    lobby_published_version: "v1.0.0",
    staff_published_version: "v1.0.0"
  };

  const emptyFastTransitions = {
    checking_in: [] as LiveDog[],
    checking_out: [] as LiveDog[],
    newest_checkout_at: null,
    prompted_count: 0,
    raw_checkout_rows: 0,
    filtered_unprompted_rows: 0,
    expired_checkout_rows: 0,
    basket_filtered: false,
    basket_cleared_rows: 0,
    data_source: "supabase_live_transition_dogs" as const
  };

  const [boardDogs, activePushNotice, groomingState, castVideoState, sync] = await Promise.all([
    withTimeoutFallback(
      loadFastBoardTransitions(supabase, now).catch(() => emptyFastTransitions),
      2500,
      emptyFastTransitions
    ),
    withTimeoutFallback(
      loadActiveStaffPushNotice(supabase, { mutate: false }).catch(() => null),
      FEATURE_TIMEOUT_MS,
      null
    ),
    withTimeoutFallback(
      loadGroomingPushBoardState(supabase, { mutate: false }).catch(() => emptyGrooming),
      FEATURE_TIMEOUT_MS,
      emptyGrooming
    ),
    withTimeoutFallback(
      loadCastVideoBoardState(supabase, {
        department: "staff_whiteboard",
        emergencyOnly: false,
        mutate: false
      }).catch(() => emptyCast),
      FEATURE_TIMEOUT_MS,
      emptyCast
    ),
    withTimeoutFallback(loadDisplaySyncState(supabase).catch(() => emptySync), FEATURE_TIMEOUT_MS, emptySync)
  ]);

  const checkingInDogs = boardDogs.checking_in.map((dog) => toCastLiteDog(dog, "checking_in"));
  const checkingOutDogs = boardDogs.checking_out.map((dog) => toCastLiteDog(dog, "checking_out"));

  const pushLite = toCastLitePushNotice(activePushNotice);
  const dailyReminder = pushLite?.is_daily_reminder ? pushLite : null;
  const standardPush = pushLite && !pushLite.is_daily_reminder ? pushLite : null;

  const payload: StaffWhiteboardStatePayload = {
    boardType: "staff",
    checkingInDogs,
    checkingOutDogs,
    activePushNotice: standardPush,
    activeGroomingPush: toCastLiteGroomingPush(groomingState.activeNotice),
    activeDailyReminder: dailyReminder,
    activeVideoPush: toCastLiteVideoPush(castVideoState.activeNotice, allowVideo),
    footerMessage: null,
    lastUpdated: now.toISOString()
  };

  const syncRevision = sync.display_content_revision ?? 0;

  return {
    version: hashStatePayload(payload, syncRevision),
    updatedAt: payload.lastUpdated,
    boardType: "staff",
    syncRevision,
    payload
  };
}

export async function buildLobbyWhiteboardState(supabase: SupabaseClient): Promise<WhiteboardStateResponse> {
  const now = new Date();

  const [checkout, settings, sync] = await Promise.all([
    loadLobbyCheckoutDogsFast(supabase, now).catch(() => ({
      featured: null as LobbyCheckoutDog | null,
      queue: [] as LobbyCheckoutDog[],
      activeCount: 0
    })),
    cachedLoadLobbySettings(supabase),
    loadDisplaySyncState(supabase).catch(() => ({
      display_content_revision: 0,
      cast_hard_reload_nonce: 0,
      build_id: "unknown",
      lobby_published_version: "v1.0.0",
      staff_published_version: "v1.0.0"
    }))
  ]);

  const payload: LobbyWhiteboardStatePayload = {
    boardType: "lobby",
    featured: checkout.featured,
    queue: checkout.queue,
    activeCount: checkout.activeCount,
    settings: {
      footer_message: settings.footer_message,
      lobby_message: settings.lobby_message,
      show_events: settings.show_events,
      show_promotions: false
    },
    lastUpdated: now.toISOString()
  };

  const syncRevision = sync.display_content_revision ?? 0;

  return {
    version: hashStatePayload(payload, syncRevision),
    updatedAt: payload.lastUpdated,
    boardType: "lobby",
    syncRevision,
    payload
  };
}

export async function loadWhiteboardState(
  supabase: SupabaseClient,
  board: CastBoardType,
  options: { allowVideo?: boolean; fresh?: boolean } = {}
) {
  const allowVideo = options.allowVideo !== false;
  const cacheKey = `whiteboard-state:${board}:video-${allowVideo ? "1" : "0"}`;
  const loader = async () => {
    if (board === "lobby") {
      return buildLobbyWhiteboardState(supabase);
    }
    return buildStaffWhiteboardState(supabase, options);
  };

  if (options.fresh) {
    const value = await loader();
    setTtlCache(cacheKey, value, WHITEBOARD_STATE_CACHE_TTL_MS);
    return value;
  }

  return getOrLoadTtlCache(cacheKey, WHITEBOARD_STATE_CACHE_TTL_MS, loader);
}

export async function persistWhiteboardState(supabase: SupabaseClient, state: WhiteboardStateResponse) {
  const boardType = state.boardType === "lobby" ? "lobby_whiteboard" : "staff_whiteboard";
  const { error } = await supabase.from("whiteboard_state").upsert(
    {
      board_type: boardType,
      version: state.version,
      updated_at: state.updatedAt,
      payload: state.payload
    },
    { onConflict: "board_type" }
  );

  if (error && !error.message.includes("whiteboard_state")) {
    throw error;
  }
}
