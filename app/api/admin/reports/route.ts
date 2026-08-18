import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { accessFromLegacyRole, canAccessAdminTab } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { loadReportsPayload } from "@/lib/admin-reports/queries";
import { parseReportKind } from "@/lib/admin-reports/parse";
import { resolveReportRange } from "@/lib/admin-reports/dates";
import { getRequestUserAccess } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireReportsAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  const access =
    (await getRequestUserAccess(request)) ??
    accessFromLegacyRole(session.adminUserId ?? null, session.email, session.role);
  if (!canAccessAdminTab(access, "reports", session.role, "staff")) {
    return { error: NextResponse.json({ error: "You do not have access to Reports." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const gate = await requireReportsAccess(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const kind = parseReportKind(url.searchParams.get("kind"));
  const range = resolveReportRange(url.searchParams.get("from"), url.searchParams.get("to"));

  try {
    const supabase = getServiceSupabase();
    const payload = await loadReportsPayload(supabase, { kind, from: range.from, to: range.to });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
