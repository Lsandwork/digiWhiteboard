import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/gingr";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isAdmin(request: Request) {
  return Boolean(process.env.ADMIN_PASSWORD) && request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const [dogs, events, failedEvents] = await Promise.all([
    supabase
      .from("live_transition_dogs")
      .select("*")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"])
      .order("status_started_at", { ascending: true }),
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

  if (dogs.error || events.error || failedEvents.error) {
    return NextResponse.json({ error: dogs.error?.message ?? events.error?.message ?? failedEvents.error?.message }, { status: 500 });
  }

  return NextResponse.json({
    dogs: dogs.data ?? [],
    events: events.data ?? [],
    failed_events: failedEvents.data ?? [],
    webhook_url: `${publicOrigin(request)}/api/gingr/webhook`,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      GINGR_SUBDOMAIN: Boolean(process.env.GINGR_SUBDOMAIN),
      GINGR_API_KEY: Boolean(process.env.GINGR_API_KEY),
      GINGR_WEBHOOK_SIGNATURE_KEY: Boolean(process.env.GINGR_WEBHOOK_SIGNATURE_KEY),
      GINGR_LOCATION_ID: Boolean(process.env.GINGR_LOCATION_ID),
      GINGR_SYNC_SECRET: Boolean(process.env.GINGR_SYNC_SECRET),
      ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD)
    }
  });
}
