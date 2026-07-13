import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import {
  createMarketingCalendarEvent,
  deleteMarketingCalendarEvent,
  listMarketingCalendarEvents,
  updateMarketingCalendarEvent
} from "@/lib/marketing/calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString();
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const events = await listMarketingCalendarEvents(gate.actor!.supabase, { from, to });
    return marketingJson({ events });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to load calendar." }, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const actor = { id: gate.actor!.session.adminUserId ?? null, email: gate.actor!.session.email };
  try {
    const event = await createMarketingCalendarEvent(gate.actor!.supabase, {
      title: String(body.title ?? ""),
      eventType: String(body.eventType ?? "photo_session"),
      startsAt: String(body.startsAt ?? ""),
      endsAt: String(body.endsAt ?? "") || null,
      campaignId: String(body.campaignId ?? "") || null,
      assignedUserId: String(body.assignedUserId ?? "") || null,
      location: String(body.location ?? "") || null,
      notes: String(body.notes ?? "") || null,
      status: String(body.status ?? "planned"),
      dogsRequested: Array.isArray(body.dogsRequested) ? body.dogsRequested : [],
      actor
    });
    return marketingJson({ event });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to create event." }, 500);
  }
}

export async function PATCH(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const id = String(body.id ?? "");
  if (!id) return marketingJson({ error: "id is required." }, 400);
  const actor = { id: gate.actor!.session.adminUserId ?? null, email: gate.actor!.session.email };
  try {
    const patch: Record<string, unknown> = {};
    for (const key of ["title", "event_type", "starts_at", "ends_at", "campaign_id", "assigned_user_id", "location", "notes", "status", "dogs_requested"]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const event = await updateMarketingCalendarEvent(gate.actor!.supabase, id, patch, actor);
    return marketingJson({ event });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to update event." }, 500);
  }
}

export async function DELETE(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return marketingJson({ error: "id is required." }, 400);
  try {
    await deleteMarketingCalendarEvent(gate.actor!.supabase, id, {
      id: gate.actor!.session.adminUserId ?? null,
      email: gate.actor!.session.email
    });
    return marketingJson({ ok: true });
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Unable to delete event." }, 500);
  }
}
