import { writeMarketingActivity } from "@/lib/marketing/audit";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function listMarketingCalendarEvents(
  supabase: SupabaseClient,
  range: { from: string; to: string }
) {
  const { data, error } = await supabase
    .from("marketing_calendar_events")
    .select("*")
    .gte("starts_at", range.from)
    .lte("starts_at", range.to)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createMarketingCalendarEvent(
  supabase: SupabaseClient,
  input: {
    title: string;
    eventType: string;
    startsAt: string;
    endsAt?: string | null;
    campaignId?: string | null;
    assignedUserId?: string | null;
    location?: string | null;
    notes?: string | null;
    status?: string;
    dogsRequested?: unknown[];
    actor: { id?: string | null; email?: string | null };
  }
) {
  const { data, error } = await supabase
    .from("marketing_calendar_events")
    .insert({
      title: input.title.trim(),
      event_type: input.eventType,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      campaign_id: input.campaignId ?? null,
      assigned_user_id: input.assignedUserId ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "planned",
      dogs_requested: input.dogsRequested ?? [],
      created_by_id: input.actor.id ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingActivity(supabase, {
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: "marketing.calendar.created",
    entityType: "marketing_calendar_event",
    entityId: data.id
  });

  return data;
}

export async function updateMarketingCalendarEvent(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  actor: { id?: string | null; email?: string | null }
) {
  const { data, error } = await supabase
    .from("marketing_calendar_events")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingActivity(supabase, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "marketing.calendar.updated",
    entityType: "marketing_calendar_event",
    entityId: id,
    metadata: patch
  });

  return data;
}

export async function deleteMarketingCalendarEvent(
  supabase: SupabaseClient,
  id: string,
  actor: { id?: string | null; email?: string | null }
) {
  const { error } = await supabase.from("marketing_calendar_events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await writeMarketingActivity(supabase, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "marketing.calendar.deleted",
    entityType: "marketing_calendar_event",
    entityId: id
  });
}
