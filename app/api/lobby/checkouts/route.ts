import { NextResponse } from "next/server";
import { isLobbyAdmin, isLobbyDisplayAuthorized, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadLobbyCheckoutDogs } from "@/lib/lobby/checkout";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLobbyDisplayAuthorized(request) && !isLobbyAdmin(request)) {
    return unauthorizedLobbyResponse({
      featured: null,
      queue: [],
      counts: { active: 0, queue: 0 },
      last_updated: new Date().toISOString(),
      error: "Unauthorized."
    });
  }

  const now = new Date();

  try {
    const supabase = getServiceSupabase();
    const settings = await loadLobbySettings(supabase);
    const checkout = await loadLobbyCheckoutDogs(supabase, settings.max_queue_count, now);

    return NextResponse.json({
      featured: checkout.featured,
      queue: checkout.queue,
      counts: {
        active: checkout.activeCount,
        queue: checkout.queue.length
      },
      last_updated: now.toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby checkouts.";
    return NextResponse.json(
      {
        featured: null,
        queue: [],
        counts: { active: 0, queue: 0 },
        last_updated: now.toISOString(),
        error: message
      },
      { status: 500 }
    );
  }
}
