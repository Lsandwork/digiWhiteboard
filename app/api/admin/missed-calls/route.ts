import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { canAccessAdminTab } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  countNewMissedCalls,
  getMissedCall,
  getMissedCallSummary,
  listMissedCalls,
  listSyncRuns,
  markMissedCallStatus
} from "@/lib/missed-calls/store";
import { syncMissedCallsFromGmail, testGmailConnection } from "@/lib/missed-calls/sync";
import { isGmailConfigured } from "@/lib/missed-calls/gmail-imap";
import type { MissedCallStatus } from "@/lib/missed-calls/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

async function requireAccess(request: Request) {
  if (!isAdminRequest(request)) return { error: unauthorizedAdminResponse() };
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  const allowed = canAccessAdminTab(access, "missed_calls", session?.role, "staff");
  if (!allowed) {
    return { error: NextResponse.json({ error: "Missed Calls access required." }, { status: 403 }) };
  }
  return { session, access, supabase };
}

export async function GET(request: Request) {
  const gate = await requireAccess(request);
  if ("error" in gate && gate.error) return gate.error;
  const supabase = gate.supabase!;
  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "list";

  try {
    if (view === "badge") {
      const count = await countNewMissedCalls(supabase);
      return NextResponse.json({ count });
    }

    if (view === "summary") {
      const summary = await getMissedCallSummary(supabase);
      return NextResponse.json({
        summary,
        gmailConfigured: isGmailConfigured(),
        gmailUser: process.env.GMAIL_IMAP_USER?.trim() || "lonnie@fitdog.com"
      });
    }

    if (view === "sync") {
      const history = await listSyncRuns(supabase, 30);
      return NextResponse.json({
        history,
        gmailConfigured: isGmailConfigured(),
        gmailUser: process.env.GMAIL_IMAP_USER?.trim() || "lonnie@fitdog.com"
      });
    }

    if (view === "detail") {
      const id = url.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const row = await getMissedCall(supabase, id);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ row });
    }

    if (view === "audio") {
      const id = url.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const row = await getMissedCall(supabase, id);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!row.voicemail_storage_path) {
        return NextResponse.json({ error: "No voicemail audio on this call." }, { status: 404 });
      }
      const { data, error } = await supabase.storage
        .from("missed-call-voicemails")
        .download(row.voicemail_storage_path);
      if (error || !data) {
        return NextResponse.json({ error: error?.message || "Audio missing" }, { status: 404 });
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": row.voicemail_content_type || "audio/mpeg",
          "Content-Length": String(buffer.length),
          "Cache-Control": "private, max-age=120",
          "Content-Disposition": `inline; filename="${row.voicemail_filename || "voicemail.mp3"}"`
        }
      });
    }

    const status = (url.searchParams.get("status") || "all") as MissedCallStatus | "all";
    const [list, summary] = await Promise.all([
      listMissedCalls(supabase, { status, limit: 150 }),
      getMissedCallSummary(supabase)
    ]);
    return NextResponse.json({
      ...list,
      summary,
      gmailConfigured: isGmailConfigured(),
      gmailUser: process.env.GMAIL_IMAP_USER?.trim() || "lonnie@fitdog.com"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load missed calls." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireAccess(request);
  if ("error" in gate && gate.error) return gate.error;
  const supabase = gate.supabase!;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    status?: MissedCallStatus;
  };

  try {
    if (body.action === "sync") {
      const result = await syncMissedCallsFromGmail({
        supabase,
        trigger: "manual",
        actorUserId: gate.session?.adminUserId ?? null
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    if (body.action === "test_gmail") {
      const result = await testGmailConnection();
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    if (body.action === "set_status") {
      if (!body.id || !body.status) {
        return NextResponse.json({ error: "id and status required" }, { status: 400 });
      }
      const row = await markMissedCallStatus(supabase, {
        id: body.id,
        status: body.status,
        actorUserId: gate.session?.adminUserId ?? null
      });
      return NextResponse.json({ row });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Missed calls action failed." },
      { status: 500 }
    );
  }
}
