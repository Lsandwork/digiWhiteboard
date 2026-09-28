import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { accessFromLegacyRole, canAccessRouteGenerator } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import { buildScheduleFromGingrUpload } from "@/lib/gingr-route-generator/import-file";
import { saveUploadedGingrRouteSchedule, todayPacificDateKey } from "@/lib/gingr-route-generator/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireGingrRouteAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: unauthorizedAdminResponse() };

  const supabase = getServiceSupabase();
  const access = session.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : accessFromLegacyRole(session.adminUserId ?? null, session.email ?? null, session.role);

  if (!canAccessRouteGenerator(access, session.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have access to Gingr Route Generator." },
        { status: 403 }
      )
    };
  }

  return { session, access };
}

/**
 * POST /api/admin/gingr-route-generator/upload
 * multipart/form-data: file (csv|pdf), date=YYYY-MM-DD
 */
export async function POST(request: Request) {
  const gate = await requireGingrRouteAccess(request);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const dateRaw = String(form.get("date") || "").trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayPacificDateKey();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a Gingr CSV or PDF to upload." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const payload = buildScheduleFromGingrUpload({
      buffer,
      fileName: file.name || "gingr-upload.csv",
      date
    });
    saveUploadedGingrRouteSchedule(payload);

    return NextResponse.json({
      ok: true,
      payload,
      message: `Imported ${payload.stats.dogsScheduled} dog(s) from ${file.name}. RuffOps will order home stops by shortest distance (no traffic) when you export to Samsara.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import that file.";
    console.error(
      JSON.stringify({
        scope: "gingr_route_generator",
        event: "upload_error",
        message: message.slice(0, 200)
      })
    );
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
