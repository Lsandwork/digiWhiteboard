import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse, canAccessHrPanels } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { buildHrHubStats, isHrRecord, toHrRecord } from "@/lib/hr/records";
import { listAllManagementReports, getManagementReportById } from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to view HR records." }, { status: 403 });
}

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return { session };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session } = await actorAccess(request);
  if (!canAccessHrPanels(session?.role)) return forbiddenResponse();

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const supabase = getServiceSupabase();

    if (id) {
      const report = await getManagementReportById(supabase, id);
      if (!report || !isHrRecord(report)) {
        return NextResponse.json({ error: "HR record not found." }, { status: 404 });
      }
      return NextResponse.json({ record: toHrRecord(report), report });
    }

    const reports = (await listAllManagementReports(supabase)).filter(isHrRecord);
    const records = reports.map(toHrRecord).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      records,
      stats: buildHrHubStats(records),
      currentUser: {
        email: session?.email ?? null,
        role: session?.role ?? null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load HR records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
