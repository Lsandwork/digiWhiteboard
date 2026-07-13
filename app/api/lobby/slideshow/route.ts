import { NextResponse } from "next/server";
import { canReadLobbyBoard, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { buildLobbySlideshowSlides } from "@/lib/lobby/slideshow-uploads";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!canReadLobbyBoard(request)) return unauthorizedLobbyResponse();

  try {
    const slides = await buildLobbySlideshowSlides(getServiceSupabase());
    return NextResponse.json({ slides });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby slideshow.";
    return NextResponse.json({ slides: [], error: message }, { status: 500 });
  }
}
