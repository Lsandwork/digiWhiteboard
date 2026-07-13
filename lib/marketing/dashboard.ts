import type { SupabaseClient } from "@supabase/supabase-js";
import { listMarketingMediaRequests } from "@/lib/marketing/media-requests";

type ServiceSupabase = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const STORAGE_QUOTA_BYTES = 300 * 1024 * 1024 * 1024; // 300 GB display quota

export async function loadMarketingDashboard(supabase: ServiceSupabase) {
  const [
    activeRequests,
    dogsInPhotoBox,
    awaitingHandler,
    uploadsProcessing,
    photosNeedingReview,
    storageUsed,
    recentRequests,
    recentUploads,
    upcomingEvents,
    notifications,
    activePhotoBox
  ] = await Promise.all([
    supabase
      .from("marketing_media_requests")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(completed,unavailable,canceled)"),
    supabase
      .from("marketing_media_requests")
      .select("id", { count: "exact", head: true })
      .eq("destination", "photo_box")
      .in("status", ["dog_ready", "in_session"]),
    supabase
      .from("marketing_media_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_handler"),
    supabase
      .from("marketing_upload_batches")
      .select("id", { count: "exact", head: true })
      .in("status", ["uploading", "processing"]),
    supabase
      .from("marketing_media_items")
      .select("id", { count: "exact", head: true })
      .eq("approval_state", "pending")
      .eq("is_archived", false),
    supabase.from("marketing_media_items").select("file_size_bytes, mime_type").eq("is_archived", false),
    listMarketingMediaRequests(supabase, { activeOnly: true, limit: 6 }),
    supabase
      .from("marketing_upload_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("marketing_calendar_events")
      .select("*")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(5),
    supabase
      .from("marketing_notifications")
      .select("*")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("marketing_media_requests")
      .select("*")
      .eq("destination", "photo_box")
      .in("status", ["dog_ready", "in_session", "dog_being_retrieved"])
      .order("updated_at", { ascending: false })
      .limit(6)
  ]);

  const usedBytes = (storageUsed.data ?? []).reduce((sum, row) => sum + Number(row.file_size_bytes ?? 0), 0);
  const photoBytes = (storageUsed.data ?? [])
    .filter((row) => String((row as { mime_type?: string }).mime_type ?? "").startsWith("image/"))
    .reduce((sum, row) => sum + Number(row.file_size_bytes ?? 0), 0);
  const videoBytes = (storageUsed.data ?? [])
    .filter((row) => String((row as { mime_type?: string }).mime_type ?? "").startsWith("video/"))
    .reduce((sum, row) => sum + Number(row.file_size_bytes ?? 0), 0);

  return {
    kpis: {
      activeRequests: activeRequests.count ?? 0,
      dogsInPhotoBox: dogsInPhotoBox.count ?? 0,
      awaitingHandler: awaitingHandler.count ?? 0,
      uploadsProcessing: uploadsProcessing.count ?? 0,
      photosNeedingReview: photosNeedingReview.count ?? 0,
      storageUsedPercent: STORAGE_QUOTA_BYTES > 0 ? Math.round((usedBytes / STORAGE_QUOTA_BYTES) * 100) : 0,
      storageUsedBytes: usedBytes,
      storageQuotaBytes: STORAGE_QUOTA_BYTES
    },
    storageBreakdown: {
      photos: photoBytes,
      videos: videoBytes,
      other: Math.max(0, usedBytes - photoBytes - videoBytes)
    },
    activeRequests: recentRequests.requests,
    dogsInPhotoBoxList: activePhotoBox.data ?? [],
    recentUploads: recentUploads.data ?? [],
    upcomingContent: upcomingEvents.data ?? [],
    notifications: notifications.data ?? []
  };
}
