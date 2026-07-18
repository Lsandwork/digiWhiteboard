import { NextResponse } from "next/server";
import { blockDemoWrite, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { accessFromLegacyRole, type UserAccess } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest, type AdminSession } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { normalizeAdminUserId } from "@/lib/admin/users";
import {
  canAccessPhotoUploadQueue,
  canReopenPhotoUploadBatch
} from "@/lib/photo-upload-queue/access";
import type { PhotoQueueActor } from "@/lib/photo-upload-queue/service";
import { getServiceSupabase } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof getServiceSupabase>;

export type PhotoUploadAuthOk = {
  session: AdminSession | null;
  access: UserAccess;
  actor: PhotoQueueActor;
  supabase: SupabaseClient;
};

export type PhotoUploadAuthResult = PhotoUploadAuthOk | { error: Response };

export async function requirePhotoUploadAccess(request: Request): Promise<PhotoUploadAuthResult> {
  if (!isAdminRequest(request)) {
    return { error: unauthorizedAdminResponse() };
  }

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, session?.role);

  if (!canAccessPhotoUploadQueue(access, session?.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to manage the Gingr Photo Upload Queue." },
        { status: 403 }
      )
    };
  }

  const actor: PhotoQueueActor = {
    id: normalizeAdminUserId(session?.adminUserId),
    name: access.displayLabel || session?.email?.split("@")[0] || "Staff",
    email: session?.email ?? null
  };

  return { session, access, actor, supabase };
}

export function requireReopenAccess(access: UserAccess | null | undefined, role?: string | null) {
  if (!canReopenPhotoUploadBatch(access, role)) {
    return NextResponse.json(
      { error: "Only a Super Admin can reopen a completed photo upload batch." },
      { status: 403 }
    );
  }
  return null;
}

export function demoWriteGuard(request: Request) {
  return blockDemoWrite(request);
}

export function isPhotoUploadAuthOk(auth: PhotoUploadAuthResult): auth is PhotoUploadAuthOk {
  return !("error" in auth);
}
