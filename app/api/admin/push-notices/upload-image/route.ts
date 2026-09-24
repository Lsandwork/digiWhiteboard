import { NextResponse } from "next/server";
import {
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { accessFromLegacyRole, canUseStandardOrEmergencyPush } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getEffectiveDemoRole, isDemoSession } from "@/lib/demo/session";
import {
  assertPushNoticeImageUpload,
  uploadPushNoticeImage
} from "@/lib/staff/push-notice-image-upload";
import { humanizeUnknownError } from "@/lib/safe-url";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to upload Push Notice images." }, { status: 403 });
}

async function actorContext(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const effectiveRole = isDemoSession(session) ? getEffectiveDemoRole(session) : getEffectiveAdminRole(request);
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, effectiveRole, session.email)
    : effectiveRole
      ? accessFromLegacyRole(null, null, effectiveRole)
      : null;
  return { session, access, role: effectiveRole, supabase };
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access, role, supabase } = await actorContext(request);
  if (!canUseStandardOrEmergencyPush(access, role)) return forbiddenResponse();

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    }

    const meta = assertPushNoticeImageUpload({ name: file.name, type: file.type, size: file.size });
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (isDemoSession(session)) {
      // Demo mode: keep a short data URL so sandbox boards can preview without storage.
      const base64 = Buffer.from(bytes).toString("base64");
      const imageUrl = `data:${meta.contentType};base64,${base64}`.slice(0, 400_000);
      return NextResponse.json({
        ok: true,
        image_url: imageUrl,
        demo: true
      });
    }

    const uploaded = await uploadPushNoticeImage(supabase, {
      bytes,
      filename: meta.filename,
      contentType: meta.contentType
    });

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId ?? null,
      actorEmail: session?.email ?? null,
      action: "staff.push_notice.image_upload",
      targetType: "staff_push_notice_image",
      targetId: uploaded.storage_path,
      details: {
        filename: meta.filename,
        content_type: meta.contentType,
        bytes: bytes.byteLength
      }
    });

    return NextResponse.json({
      ok: true,
      image_url: uploaded.image_url,
      storage_path: uploaded.storage_path
    });
  } catch (error) {
    return NextResponse.json(
      { error: humanizeUnknownError(error, "Unable to upload notice image.") },
      { status: 400 }
    );
  }
}
