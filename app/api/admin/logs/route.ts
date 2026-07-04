import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const board = url.searchParams.get("board");
  const actor = url.searchParams.get("actor");
  const search = url.searchParams.get("search")?.trim().toLowerCase();
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 50)));

  const supabase = getServiceSupabase();

  let auditQuery = supabase
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) auditQuery = auditQuery.eq("action", action);
  if (actor) auditQuery = auditQuery.ilike("actor_email", `%${actor}%`);

  const [auditResult, publishResult] = await Promise.all([
    auditQuery,
    supabase
      .from("admin_publish_log")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit)
  ]);

  let auditLogs = auditResult.data ?? [];
  if (search) {
    auditLogs = auditLogs.filter((log) =>
      [log.action, log.actor_email, log.target_type, log.target_id, JSON.stringify(log.details ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }

  let publishLogs = publishResult.data ?? [];
  if (board === "lobby" || board === "staff") {
    publishLogs = publishLogs.filter((log) => log.board_type === board);
  }

  return NextResponse.json({
    audit_logs: auditLogs,
    publish_logs: publishLogs
  });
}
