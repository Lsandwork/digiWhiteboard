import { NextResponse } from "next/server";
import { loadDisplaySyncState } from "@/lib/display-sync-server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sync = await loadDisplaySyncState(getServiceSupabase());
    return NextResponse.json(sync, {
      headers: {
        "cache-control": "no-store, max-age=0"
      }
    });
  } catch {
    return NextResponse.json(
      {
        display_content_revision: 0,
        cast_hard_reload_nonce: 0,
        build_id: "unknown",
        lobby_published_version: "v1.0.0",
        staff_published_version: "v1.0.0"
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0"
        }
      }
    );
  }
}
