import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isAdmin(request: Request) {
  return Boolean(process.env.ADMIN_PASSWORD) && request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing dog id." }, { status: 400 });

  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { data: dog, error: loadError } = await supabase.from("live_transition_dogs").select("*").eq("id", id).single();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

  const { error } = await supabase
    .from("live_transition_dogs")
    .update({
      hidden: true,
      display_status: "removed",
      current_status: "manually_hidden",
      completed_at: now,
      updated_at: now
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("board_activity_log").insert({
    gingr_reservation_id: dog.gingr_reservation_id,
    animal_name: dog.animal_name,
    action: "manual_hide",
    previous_status: dog.current_status,
    new_status: "manually_hidden",
    source: "admin"
  });

  return NextResponse.json({ ok: true });
}
