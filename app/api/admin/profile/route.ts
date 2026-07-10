import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { isDemoSession, demoWriteBlockedMessage } from "@/lib/demo/session";
import { getAdminUserById, updateAdminUserAvatar } from "@/lib/admin/users";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_AVATAR_BYTES = 600_000;

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!session?.adminUserId) {
    return NextResponse.json({ error: "You must be signed in with a managed account." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const user = await getAdminUserById(supabase, session.adminUserId);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      avatarUrl: (user as { avatar_url?: string | null }).avatar_url ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  if (!session?.adminUserId) {
    return NextResponse.json({ error: "You must be signed in with a managed account." }, { status: 403 });
  }
  if (isDemoSession(session)) {
    return NextResponse.json({ ok: true, demo: true, message: demoWriteBlockedMessage() });
  }

  const body = (await request.json().catch(() => ({}))) as { avatarUrl?: string | null };
  const avatarUrl = body.avatarUrl;

  if (avatarUrl !== null && avatarUrl !== undefined) {
    if (typeof avatarUrl !== "string" || !avatarUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Upload a valid image file." }, { status: 400 });
    }
    if (avatarUrl.length > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: "Image is too large. Please choose a smaller photo." }, { status: 400 });
    }
  }

  try {
    const supabase = getServiceSupabase();
    const updated = await updateAdminUserAvatar(supabase, session.adminUserId, avatarUrl ?? null);
    await writeAdminAuditLog({
      actorAdminId: session.adminUserId,
      actorEmail: session.email,
      action: "admin.user.profile_photo_update",
      targetType: "admin_user",
      targetId: session.adminUserId,
      details: { cleared: !avatarUrl }
    });
    return NextResponse.json({ ok: true, avatarUrl: updated?.avatar_url ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update profile photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
