import { canAccessRouteGenerator, type UserAccess } from "@/lib/admin/permissions";

/** Live Fleet uses the same transportation access model as Route Generator. */
export function canAccessLiveFleet(
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): boolean {
  return canAccessRouteGenerator(access, legacyRole);
}
