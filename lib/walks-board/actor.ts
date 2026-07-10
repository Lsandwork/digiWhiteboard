import type { AdminSession } from "@/lib/admin/session";
import { findAdminUserByEmail, normalizeAdminUserId } from "@/lib/admin/users";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type WalkBoardActor = {
  session: AdminSession;
  actorUserId: string | null;
  actorEmail: string;
};

/** Resolve the signed-in staff actor for Walks Board actions. */
export async function resolveWalkBoardActor(
  supabase: SupabaseClient,
  session: AdminSession | null | undefined
): Promise<WalkBoardActor | null> {
  const actorEmail = session?.email?.trim();
  if (!session || !actorEmail) return null;

  const directId = normalizeAdminUserId(session.adminUserId);
  if (directId) {
    return { session, actorUserId: directId, actorEmail };
  }

  try {
    const dbUser = await findAdminUserByEmail(supabase, actorEmail);
    const resolvedId = normalizeAdminUserId(dbUser?.id);
    if (resolvedId) {
      return { session, actorUserId: resolvedId, actorEmail };
    }
  } catch {
    // Fall back to session-only actor when admin_users lookup is unavailable.
  }

  return { session, actorUserId: null, actorEmail };
}
