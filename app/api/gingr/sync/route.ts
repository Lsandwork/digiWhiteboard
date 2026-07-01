import { NextResponse } from "next/server";
import { syncGingrBoardState } from "@/lib/gingr-board-sync";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.GINGR_SYNC_SECRET || request.headers.get("x-sync-secret") !== process.env.GINGR_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const summary = await syncGingrBoardState(supabase);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed.", synced: false },
      { status: 500 }
    );
  }
}
