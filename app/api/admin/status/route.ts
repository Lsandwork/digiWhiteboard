import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/api-auth";
import { getBoardEnvCheck, getGingrWebhookSignatureKey } from "@/lib/env";
import { publicOrigin } from "@/lib/gingr";
import { VISIBLE_TRANSITION_SELECT } from "@/lib/board-fast-checkout";
import {
  getHungTableSupabase,
  HUNG_TABLES,
  isHungQueryError,
  isHungTableInCooldown,
  markHungTableTimeout
} from "@/lib/hung-table-guard";

export const dynamic = "force-dynamic";

function emptyStatus(request: Request) {
  return {
    dogs: [] as unknown[],
    events: [] as unknown[],
    failed_events: [] as unknown[],
    webhook_url: `${publicOrigin(request)}/api/gingr/webhook`,
    degraded: true,
    env: {
      ...getBoardEnvCheck(),
      GINGR_SUBDOMAIN: Boolean(process.env.GINGR_SUBDOMAIN),
      GINGR_LOCATION_ID: Boolean(process.env.GINGR_LOCATION_ID),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
      GINGR_WEBHOOK_SIGNATURE_KEY: Boolean(getGingrWebhookSignatureKey())
    }
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (
    isHungTableInCooldown(HUNG_TABLES.liveTransitionDogs) ||
    isHungTableInCooldown(HUNG_TABLES.gingrWebhookEvents)
  ) {
    return NextResponse.json(emptyStatus(request));
  }

  const supabase = getHungTableSupabase();
  try {
    const [dogs, events, failedEvents] = await Promise.all([
      supabase
        .from("live_transition_dogs")
        .select(VISIBLE_TRANSITION_SELECT)
        .eq("hidden", false)
        .in("display_status", ["checking_in", "checking_out"])
        .order("status_started_at", { ascending: true })
        .limit(120),
      supabase
        .from("gingr_webhook_events")
        .select("id,webhook_type,entity_id,entity_type,verified,processed,processing_error,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("gingr_webhook_events")
        .select("id,webhook_type,entity_id,entity_type,verified,processed,processing_error,created_at")
        .or("verified.eq.false,processing_error.not.is.null")
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

    if (dogs.error && isHungQueryError(dogs.error)) {
      markHungTableTimeout(HUNG_TABLES.liveTransitionDogs);
      return NextResponse.json(emptyStatus(request));
    }
    if (
      (events.error && isHungQueryError(events.error)) ||
      (failedEvents.error && isHungQueryError(failedEvents.error))
    ) {
      markHungTableTimeout(HUNG_TABLES.gingrWebhookEvents);
      return NextResponse.json(emptyStatus(request));
    }

    if (dogs.error || events.error || failedEvents.error) {
      return NextResponse.json(emptyStatus(request));
    }

    return NextResponse.json({
      dogs: dogs.data ?? [],
      events: events.data ?? [],
      failed_events: failedEvents.data ?? [],
      webhook_url: `${publicOrigin(request)}/api/gingr/webhook`,
      env: {
        ...getBoardEnvCheck(),
        GINGR_SUBDOMAIN: Boolean(process.env.GINGR_SUBDOMAIN),
        GINGR_LOCATION_ID: Boolean(process.env.GINGR_LOCATION_ID),
        ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
        CRON_SECRET: Boolean(process.env.CRON_SECRET),
        GINGR_WEBHOOK_SIGNATURE_KEY: Boolean(getGingrWebhookSignatureKey())
      }
    });
  } catch (error) {
    if (isHungQueryError(error)) {
      markHungTableTimeout(HUNG_TABLES.liveTransitionDogs);
      markHungTableTimeout(HUNG_TABLES.gingrWebhookEvents);
    }
    return NextResponse.json(emptyStatus(request));
  }
}
