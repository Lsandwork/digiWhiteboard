import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const url = new URL(request.url);
  const board = url.searchParams.get("board");
  const limit = Math.min(50, Math.max(5, Number(url.searchParams.get("limit") ?? 20)));

  const supabase = getServiceSupabase();
  let query = supabase.from("admin_publish_log").select("*").order("published_at", { ascending: false }).limit(limit);
  if (board === "lobby" || board === "staff") {
    query = query.eq("board_type", board);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ history: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ history: data ?? [] });
}
