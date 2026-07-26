function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function isLiveTrackingEnabled() {
  return envFlag("FITDOG_LIVE_TRACKING_ENABLED", false);
}

export function isLiveTrackingShadowMode() {
  return envFlag("FITDOG_LIVE_TRACKING_SHADOW_MODE", true);
}

export function isSamsaraTrackingSyncEnabled() {
  return envFlag("SAMSARA_TRACKING_SYNC_ENABLED", false);
}

export function isSamsaraTrackingWebhooksEnabled() {
  return envFlag("SAMSARA_TRACKING_WEBHOOKS_ENABLED", false);
}

export function isTrackingSmsEnabled() {
  return envFlag("FITDOG_TRACKING_SMS_ENABLED", false);
}

export function isTrackingEmailEnabled() {
  return envFlag("FITDOG_TRACKING_EMAIL_ENABLED", false);
}

export function isTrackingPushEnabled() {
  return envFlag("FITDOG_TRACKING_PUSH_ENABLED", false);
}

export function isTrackingWhatsappEnabled() {
  return envFlag("FITDOG_TRACKING_WHATSAPP_ENABLED", false);
}

export function isTracking5MinuteAlertEnabled() {
  return envFlag("FITDOG_TRACKING_5_MINUTE_ALERT_ENABLED", true);
}

export function isTrackingDriverNameEnabled() {
  return envFlag("FITDOG_TRACKING_DRIVER_NAME_ENABLED", false);
}

export function getTrackingPublicDomain() {
  return (
    process.env.FITDOG_TRACKING_PUBLIC_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://staff.ruffops.com"
  );
}

export function getNoticeThresholdMinutes() {
  return envNumber("TRACKING_DEFAULT_NOTICE_THRESHOLD_MINUTES", 30);
}

export function getLiveThresholdMinutes() {
  return envNumber("TRACKING_DEFAULT_LIVE_THRESHOLD_MINUTES", 15);
}

export function getFinalNoticeMinutes() {
  return envNumber("TRACKING_DEFAULT_FINAL_NOTICE_MINUTES", 5);
}

export function getExpirationGraceMinutes() {
  return envNumber("TRACKING_DEFAULT_EXPIRATION_GRACE_MINUTES", 15);
}

export function getGpsStaleSeconds() {
  return envNumber("TRACKING_GPS_STALE_SECONDS", 120);
}

export function getEtaStaleSeconds() {
  return envNumber("TRACKING_ETA_STALE_SECONDS", 180);
}

export const LIVE_TRACKING_PERMISSIONS = [
  "live_tracking.view",
  "live_tracking.manage",
  "live_tracking.send_test",
  "live_tracking.resend_notification",
  "live_tracking.disable_session",
  "live_tracking.override_eta",
  "live_tracking.view_audit",
  "live_tracking.manage_settings"
] as const;

export type LiveTrackingPermission = (typeof LIVE_TRACKING_PERMISSIONS)[number];

export const TRACKING_VANS = ["van_1", "van_2", "van_3", "van_5", "van_6"] as const;
export type TrackingVanKey = (typeof TRACKING_VANS)[number];

export function assertNeverVan4(value: string) {
  if (value === "van_4" || /van\s*4/i.test(value)) {
    throw new Error("Van 4 is not a Fitdog vehicle and must never be used.");
  }
}
