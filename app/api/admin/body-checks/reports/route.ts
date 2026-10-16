import { NextResponse } from "next/server";
import { requireBodyCheckAccess } from "@/lib/body-checks/access";
import { insertBodyCheckReport, listBodyCheckReports } from "@/lib/body-checks/store";
import { validateInspection } from "@/lib/body-checks/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const gate = await requireBodyCheckAccess(request);
  if (gate.error || !gate.supabase) return gate.error;
  const url = new URL(request.url);
  try {
    const result = await listBodyCheckReports(gate.supabase, {
      query: url.searchParams.get("q") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      severity: url.searchParams.get("severity") || undefined,
      followUp: url.searchParams.get("followUp") || undefined,
      finding: url.searchParams.get("finding") || undefined,
      staff: url.searchParams.get("staff") || undefined,
      limit: Number(url.searchParams.get("limit") || 25),
      offset: Number(url.searchParams.get("offset") || 0),
      sort: url.searchParams.get("sort") === "oldest" ? "oldest" : "newest"
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load saved reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireBodyCheckAccess(request);
  if (gate.error || !gate.supabase || !gate.actor) return gate.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid report payload." }, { status: 400 });
  const validated = validateInspection({
    gingrAnimalId: String(body.gingrAnimalId ?? ""),
    dogName: String(body.dogName ?? ""),
    photoUrl: (body.photoUrl as string | null) ?? null,
    ownerId: (body.ownerId as string | null) ?? null,
    ownerName: (body.ownerName as string | null) ?? null,
    reservationId: (body.reservationId as string | null) ?? null,
    serviceType: (body.serviceType as string | null) ?? null,
    serviceCategory: (body.serviceCategory as string | null) ?? null,
    locationId: (body.locationId as string | null) || process.env.GINGR_LOCATION_ID?.trim() || null,
    ears: Array.isArray(body.ears) ? body.ears.map(String) : [],
    nails: Array.isArray(body.nails) ? body.nails.map(String) : [],
    bodyGrooming: Array.isArray(body.bodyGrooming) ? body.bodyGrooming.map(String) : [],
    bodyPhysical: Array.isArray(body.bodyPhysical) ? body.bodyPhysical.map(String) : [],
    earOther: (body.earOther as string | null) ?? null,
    nailOther: (body.nailOther as string | null) ?? null,
    bodyOther: (body.bodyOther as string | null) ?? null,
    notes: (body.notes as string | null) ?? null,
    severity: (body.severity as string | null) ?? null,
    followUpKinds: Array.isArray(body.followUpKinds) ? body.followUpKinds.map(String) : [],
    idempotencyKey: String(body.idempotencyKey ?? "")
  });
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  try {
    const result = await insertBodyCheckReport(gate.supabase, validated.value, gate.actor);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save the body check.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
