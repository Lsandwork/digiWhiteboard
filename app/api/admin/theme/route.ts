import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { isThemeMode } from "@/lib/theme/constants";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ theme: null, authenticated: false });
  }

  const session = getAdminSessionFromRequest(request);
  if (!session?.adminUserId) {
    return NextResponse.json({ theme: null, authenticated: false });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("admin_users")
    .select("theme_preference")
    .eq("id", session.adminUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const theme = isThemeMode(data?.theme_preference) ? data.theme_preference : "dark";
  return NextResponse.json({ theme, authenticated: true });
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.adminUserId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json()) as { theme?: unknown };
  if (!isThemeMode(body.theme)) {
    return NextResponse.json({ error: "theme must be light or dark." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("admin_users")
    .update({ theme_preference: body.theme, updated_at: new Date().toISOString() })
    .eq("id", session.adminUserId);

  if (error) {
    if (error.code === "42703" || /theme_preference/i.test(error.message)) {
      return NextResponse.json(
        { error: "Theme preference column missing. Apply migration 035_admin_user_theme_preference.sql." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, theme: body.theme });
}
