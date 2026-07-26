import type { UserAccess } from "@/lib/admin/permissions";
import { hasPermission } from "@/lib/admin/permissions";
import type { LiveTrackingPermission } from "@/lib/live-tracking/flags";

const MANAGEMENT_DEFAULT: LiveTrackingPermission[] = [
  "live_tracking.view",
  "live_tracking.manage",
  "live_tracking.send_test",
  "live_tracking.resend_notification",
  "live_tracking.disable_session",
  "live_tracking.override_eta",
  "live_tracking.view_audit"
];

const COORDINATOR_DEFAULT: LiveTrackingPermission[] = [
  "live_tracking.view",
  "live_tracking.resend_notification",
  "live_tracking.send_test"
];

export function canUseLiveTracking(access: UserAccess | null | undefined): boolean {
  if (!access) return false;
  if (access.roles.includes("super_admin") || access.roles.includes("admin") || access.roles.includes("management")) {
    return true;
  }
  if (access.roles.includes("front_desk_coordinator")) return true;
  return hasPermission(access, "live_tracking.view");
}

export function hasLiveTrackingPermission(
  access: UserAccess | null | undefined,
  permission: LiveTrackingPermission
): boolean {
  if (!access) return false;
  if (access.roles.includes("super_admin")) return true;
  if (hasPermission(access, permission)) return true;

  if (access.roles.includes("admin")) {
    if (permission === "live_tracking.manage_settings") {
      return hasPermission(access, "live_tracking.manage_settings");
    }
    return true;
  }

  if (access.roles.includes("management")) {
    return MANAGEMENT_DEFAULT.includes(permission);
  }

  if (access.roles.includes("front_desk_coordinator")) {
    return COORDINATOR_DEFAULT.includes(permission);
  }

  return false;
}
