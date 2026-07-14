import { NextResponse } from "next/server";
import { buildCastTvPlaylist, loadCastTvMedia } from "@/lib/cast-tv/media";
import { canManageCastTv } from "@/lib/cast-tv/permissions";
import { castTvActorAccess } from "@/lib/cast-tv/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { session, access } = await castTvActorAccess(request);
    if (session?.adminUserId && canManageCastTv(access, session.role)) {
      const media = await loadCastTvMedia(getServiceSupabase());
      return NextResponse.json({ media });
    }

    const playlist = await buildCastTvPlaylist(getServiceSupabase());
    return NextResponse.json({ playlist });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load CAST-TV media.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
