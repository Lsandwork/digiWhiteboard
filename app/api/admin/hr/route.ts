import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessHrPanelsForUser } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { buildHrHubStats, isHrRecord, toHrRecord } from "@/lib/hr/records";
import {
  getManagementReportById,
  listAllManagementReports,
  updateManagementReport,
  type SupportAdminStatus,
  type SupportPriority
} from "@/lib/staff/management-reports";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to view HR records." }, { status: 403 });
}

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access, supabase };
}

function isVisibleInHrHub(report: Awaited<ReturnType<typeof getManagementReportById>>) {
  return Boolean(report && isHrRecord(report) && !report.hr_hub_hidden);
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access, supabase } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const report = await getManagementReportById(supabase, id);
      if (!report || !isHrRecord(report)) {
        return NextResponse.json({ error: "HR record not found." }, { status: 404 });
      }
      return NextResponse.json({ record: toHrRecord(report), report });
    }

    const reports = (await listAllManagementReports(supabase)).filter(
      (report) => isHrRecord(report) && !report.hr_hub_hidden
    );
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

const ADMIN_STATUSES = new Set<SupportAdminStatus>([
  "Submitted",
  "In Review",
  "Needs More Info",
  "Resolved",
  "Closed"
]);

const PRIORITIES = new Set<SupportPriority>(["Normal", "High", "Urgent"]);

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, access, supabase } = await actorAccess(request);
  if (!canAccessHrPanelsForUser(access, session?.role)) return forbiddenResponse();

  try {
    const body = (await request.json()) as {
      ids?: unknown;
      action?: string;
      admin_status?: string;
      priority?: string;
    };
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)).filter(Boolean) : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Select at least one HR record." }, { status: 400 });
    }

    const action = String(body.action || "").trim();
    const actor = access?.displayLabel || session?.email || "Admin";
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const id of ids) {
      const report = await getManagementReportById(supabase, id);
      if (!isVisibleInHrHub(report) && !(report && isHrRecord(report) && action === "restore")) {
        continue;
      }
      if (!report || !isHrRecord(report)) continue;

      if (action === "remove") {
        await updateManagementReport(supabase, id, {
          hr_hub_hidden: true,
          hr_hub_hidden_at: now,
          hr_hub_hidden_by: actor
        });
        updatedCount += 1;
        continue;
      }

      if (action === "set_status") {
        const status = body.admin_status as SupportAdminStatus;
        if (!ADMIN_STATUSES.has(status)) {
          return NextResponse.json({ error: "Invalid status." }, { status: 400 });
        }
        await updateManagementReport(supabase, id, {
          admin_status: status,
          status: status === "Closed" || status === "Resolved" ? "Closed" : status === "In Review" ? "Open" : "Needs Review",
          reviewed_by: status === "Resolved" || status === "Closed" ? actor : report.reviewed_by,
          reviewed_at: status === "Resolved" || status === "Closed" ? now : report.reviewed_at,
          closed_at: status === "Closed" ? now : report.closed_at
        });
        updatedCount += 1;
        continue;
      }

      if (action === "set_priority") {
        const priority = body.priority as SupportPriority;
        if (!PRIORITIES.has(priority)) {
          return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
        }
        await updateManagementReport(supabase, id, { priority });
        updatedCount += 1;
        continue;
      }

      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, updated: updatedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update HR records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
