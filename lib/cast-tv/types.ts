export type CastTvMediaType = "image" | "video";

export type CastTvTransitionStyle = "fade" | "crossfade" | "none";

export type CastTvObjectFit = "contain" | "cover";

export const CAST_TV_IMAGE_DURATION_OPTIONS = [5, 10, 15, 20, 30, 60] as const;

export type CastTvImageDuration = (typeof CAST_TV_IMAGE_DURATION_OPTIONS)[number];

export type CastTvMediaRecord = {
  id: string;
  display_name: string | null;
  file_name: string;
  storage_path: string;
  public_url: string | null;
  media_type: CastTvMediaType;
  mime_type: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  image_display_seconds: CastTvImageDuration;
  display_order: number;
  is_enabled: boolean;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type CastTvPlaylistItem = {
  id: string;
  displayName: string;
  mediaType: CastTvMediaType;
  src: string;
  imageDisplaySeconds: number;
  durationSeconds: number | null;
  updatedAt: string;
};

export type CastTvSettings = {
  id: string;
  default_image_seconds: CastTvImageDuration;
  transition_ms: number;
  transition_style: CastTvTransitionStyle;
  object_fit: CastTvObjectFit;
  show_standby_logo: boolean;
  is_paused: boolean;
  updated_at: string;
  updated_by: string | null;
};

export type CastTvHeartbeatStatus = {
  screen_id: string;
  last_seen_at: string;
  online: boolean;
};

export const CAST_TV_SETTINGS_ID = "00000000-0000-4000-8000-00000000c0a7";
export const CAST_TV_DEFAULT_SCREEN_ID = "default";
export const CAST_TV_HEARTBEAT_MS = 25_000;
export const CAST_TV_POLL_MS = 30_000;
export const CAST_TV_ONLINE_THRESHOLD_MS = 90_000;
export const CAST_TV_MEDIA_FAIL_TIMEOUT_MS = 12_000;
