import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { canAccessAdminTab } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { buildOverviewPayload, saveOverviewBoardNote } from "@/lib/admin/overview";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireOverviewAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  if (!canAccessAdminTab(access, "overview", session?.role, "staff")) {
    return {
      error: NextResponse.json({ error: "You do not have permission to view Overview." }, { status: 403 })
    };
  }
  return {
    session,
    supabase,
    actor: access?.displayLabel || session?.email?.split("@")[0] || "Admin"
  };
}

export async function GET(request: Request) {
  const auth = await requireOverviewAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const payload = await buildOverviewPayload(auth.supabase);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOverviewAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; text?: string };
    if (body.action === "add_board_note" || body.text) {
      const note = await saveOverviewBoardNote(auth.supabase, {
        text: String(body.text || ""),
        author: auth.actor
      });
      return NextResponse.json({ note });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save overview note.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
