import { NextResponse } from "next/server";
import {
  canAccessManagementReports,
  canViewOwnWriteUps,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { getWriteUpPdfBytes } from "@/lib/staff/write-up-pdf-store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { id } = await context.params;
  const session = getAdminSessionFromRequest(request);
  const role = session?.role;
  const actor = session?.email ?? session?.adminUserId ?? "admin";

  try {
    const supabase = getServiceSupabase();
    const report = await getManagementReportById(supabase, id);
    if (!report || report.report_type !== "employee_write_up") {
      return NextResponse.json({ error: "Write-up not found." }, { status: 404 });
    }

    const canDownload =
      canAccessManagementReports(role) ||
      (canViewOwnWriteUps(role) && (report.created_by ?? "").trim().toLowerCase() === actor.trim().toLowerCase());

    if (!canDownload) {
      return NextResponse.json({ error: "You do not have permission to download this write-up." }, { status: 403 });
    }

    const pdf = await getWriteUpPdfBytes(supabase, id);
    if (!pdf) {
      return NextResponse.json({ error: "PDF has not been generated for this write-up." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${pdf.filename}"`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download write-up PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
