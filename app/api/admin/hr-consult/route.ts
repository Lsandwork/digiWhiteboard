import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canAccessHrPanelsForUser } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { loadAdminSettings } from "@/lib/admin/settings";
import { appendHrConsultMessages, clearHrConsultThread, loadHrConsultThread } from "@/lib/hr/consult-store";
import { consultGeminiHr } from "@/lib/hr/gemini-consult";
import { geminiUserFacingError, isGeminiConfigured, resolveGeminiModel } from "@/lib/hr/gemini-config";
import { hrRecordContextForConsult, isHrRecord } from "@/lib/hr/records";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to use HR Consult." }, { status: 403 });
}

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, supabase, access };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, supabase, access } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  const email = session?.email ?? "admin";
  const [thread, settings] = await Promise.all([loadHrConsultThread(supabase, email), loadAdminSettings(supabase)]);

  return NextResponse.json({
    thread,
    settings: {
      hr_consult_enabled: settings.hr_consult_enabled,
      hr_company_city: settings.hr_company_city,
      hr_company_region: settings.hr_company_region,
      hr_company_country: settings.hr_company_country,
      hr_company_situation: settings.hr_company_situation,
      hr_consult_model: resolveGeminiModel(settings.hr_consult_model),
      business_display_name: settings.business_display_name
    },
    gemini_configured: isGeminiConfigured()
  });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, supabase, access } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  const email = session?.email ?? "admin";
  const actor = session?.email ?? session?.adminUserId ?? "admin";

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "chat");

    if (action === "clear") {
      await clearHrConsultThread(supabase, email);
      return NextResponse.json({ ok: true, thread: { messages: [], updated_at: new Date().toISOString() } });
    }

    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
    }

    const settings = await loadAdminSettings(supabase);
    const thread = await loadHrConsultThread(supabase, email);

    let recordContext: string | null = null;
    const reportId = String(body.report_id ?? "").trim();
    if (reportId) {
      const report = await getManagementReportById(supabase, reportId);
      if (report && isHrRecord(report)) {
        recordContext = hrRecordContextForConsult(report);
      }
    }

    const reply = await consultGeminiHr({
      settings,
      history: thread.messages,
      userMessage: message,
      recordContext
    });

    const updated = await appendHrConsultMessages(supabase, email, [
      { role: "user", content: message, report_id: reportId || null },
      { role: "assistant", content: reply, report_id: reportId || null }
    ]);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "hr.gemini.consult",
      targetType: "hr_consult",
      targetId: reportId || undefined,
      details: { message_length: message.length, reply_length: reply.length }
    });

    return NextResponse.json({
      reply,
      thread: updated,
      gemini_configured: true
    });
  } catch (error) {
    console.error("[hr-consult] Request failed:", error);
    return NextResponse.json({ error: geminiUserFacingError(error) }, { status: 500 });
  }
}
