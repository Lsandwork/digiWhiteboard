import { YARD_LINK_FEEDS } from "@/lib/yard-links/config";
import { buildYouTubeCastEmbedUrl, youtubeThumbnailUrl } from "@/lib/yard-links/youtube";
import {
  clearCastVideoNotice,
  createCastVideoNotice,
  listCastVideoNotices,
  pushCastVideoNotice,
  type CastVideoNotice
} from "@/lib/staff/cast-video-notices";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const YARD_PUSH_YOUTUBE_MIME = "application/x-youtube-embed";
export const YARD_PUSH_SOURCE_PREFIX = "yard_push:";

export type YardPushSide = "large_side" | "small_side";

export const YARD_PUSH_SIDE_OPTIONS = [
  {
    id: "large_side" as const,
    label: "Large Side",
    feedTitle: "Big Side",
    description: "Cast the Large Side yard live camera to the Staff Digital Whiteboard."
  },
  {
    id: "small_side" as const,
    label: "Small Side",
    feedTitle: "Small Side",
    description: "Cast the Small Side yard live camera to the Staff Digital Whiteboard."
  }
] as const;

function feedForSide(side: YardPushSide) {
  const option = YARD_PUSH_SIDE_OPTIONS.find((item) => item.id === side);
  if (!option) throw new Error("Unknown yard side.");
  const feed = YARD_LINK_FEEDS.find((item) => item.title === option.feedTitle);
  if (!feed) throw new Error(`Yard link for ${option.label} is not configured.`);
  return { option, feed };
}

export function isYardPushCastNotice(notice: Pick<CastVideoNotice, "mime_type" | "description">) {
  return notice.mime_type === YARD_PUSH_YOUTUBE_MIME || String(notice.description ?? "").startsWith(YARD_PUSH_SOURCE_PREFIX);
}

export function yardPushSideFromNotice(notice: Pick<CastVideoNotice, "description">): YardPushSide | null {
  const raw = String(notice.description ?? "");
  if (!raw.startsWith(YARD_PUSH_SOURCE_PREFIX)) return null;
  const side = raw.slice(YARD_PUSH_SOURCE_PREFIX.length).split("\n")[0]?.trim();
  if (side === "large_side" || side === "small_side") return side;
  return null;
}

export function yardPushSideLabel(side: YardPushSide | null) {
  if (!side) return null;
  return YARD_PUSH_SIDE_OPTIONS.find((item) => item.id === side)?.label ?? null;
}

async function clearActiveYardPushNotices(supabase: SupabaseClient, actor?: string | null) {
  const notices = await listCastVideoNotices(supabase, 100);
  const activeYardNotices = notices.filter(
    (notice) => notice.status === "active" && isYardPushCastNotice(notice)
  );
  for (const notice of activeYardNotices) {
    await clearCastVideoNotice(supabase, notice.id, actor);
  }
}

export async function getActiveYardPushNotice(supabase: SupabaseClient) {
  const notices = await listCastVideoNotices(supabase, 100);
  return notices.find((notice) => notice.status === "active" && isYardPushCastNotice(notice)) ?? null;
}

export async function pushYardNotice(supabase: SupabaseClient, side: YardPushSide, actor?: string | null) {
  const { option, feed } = feedForSide(side);
  await clearActiveYardPushNotices(supabase, actor);

  const notice = await createCastVideoNotice(
    supabase,
    {
      title: `Yard Live — ${option.label}`,
      description: `${YARD_PUSH_SOURCE_PREFIX}${side}`,
      priority: "normal",
      departments: ["staff_whiteboard"],
      video_url: buildYouTubeCastEmbedUrl(feed.videoId, { muted: true }),
      thumbnail_url: youtubeThumbnailUrl(feed.videoId),
      mime_type: YARD_PUSH_YOUTUBE_MIME,
      allow_sound: true,
      require_acknowledgement: false,
      auto_clear_mode: "manual"
    },
    actor,
    { asDraft: true }
  );

  return pushCastVideoNotice(supabase, notice.id, actor);
}

export async function clearYardPushNotice(supabase: SupabaseClient, actor?: string | null) {
  const active = await getActiveYardPushNotice(supabase);
  if (!active) throw new Error("No active yard push notice to clear.");
  return clearCastVideoNotice(supabase, active.id, actor);
}
