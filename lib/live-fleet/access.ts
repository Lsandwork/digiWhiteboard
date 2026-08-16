import { canAccessLiveFleet as canAccessLiveFleetPermission, type UserAccess } from "@/lib/admin/permissions";

/** Live Fleet API gate — Admin, Management, Front Desk Coordinators, Transportation. */
export function canAccessLiveFleet(
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): boolean {
  return canAccessLiveFleetPermission(access, legacyRole);
}
