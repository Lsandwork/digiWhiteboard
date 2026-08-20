/**
 * Package Group Walk actor resolution.
 *
 * The completing employee is always derived from the signed RuffOps session
 * cookie — never from the request body. A browser cannot impersonate a coworker.
 */
import type { AdminSession } from "@/lib/admin/session";
import { findAdminUserByEmail, normalizeAdminUserId } from "@/lib/admin/users";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type PackageGroupWalkActor = {
  userId: string | null;
  email: string;
  /** Employee name shown as "Completed by …". */
  displayName: string;
  role: string | null;
};

/** "julie.smith@fitdog.com" → "Julie Smith" when admin_users has no full name. */
export function nameFromEmail(email: string): string {
  const local = String(email || "").split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim();
  if (!cleaned) return "Staff";
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Resolve the authenticated staff member recorded on a completion. */
export async function resolvePackageGroupWalkActor(
  supabase: SupabaseClient,
  session: AdminSession | null | undefined
): Promise<PackageGroupWalkActor | null> {
  const email = session?.email?.trim();
  if (!session || !email) return null;

  let userId = normalizeAdminUserId(session.adminUserId);
  let fullName = "";

  try {
    const dbUser = await findAdminUserByEmail(supabase, email);
    if (dbUser) {
      userId = userId ?? normalizeAdminUserId(dbUser.id);
      fullName = String(dbUser.full_name ?? "").trim();
    }
  } catch {
    // Session-only actor is still valid; the email identifies the employee.
  }

  return {
    userId,
    email,
    displayName: fullName || nameFromEmail(email),
    role: session.role ?? null
  };
}
