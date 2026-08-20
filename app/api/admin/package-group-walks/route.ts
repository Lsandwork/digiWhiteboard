import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { blockDemoWrite } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { resolvePackageGroupWalkActor } from "@/lib/package-group-walks/actor";
import { logPackageGroupWalkEvent } from "@/lib/package-group-walks/observability";
import {
  findEligibleDogForCompletion,
  loadPackageGroupWalkState
} from "@/lib/package-group-walks/service";
import {
  completePackageGroupWalk,
  packageGroupWalkBusinessDate,
  PackageGroupWalksSchemaMissingError
} from "@/lib/package-group-walks/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Package Group Walks state for any authenticated RuffOps user.
 * Read-only; never mutates Gingr.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("force") === "1";

  try {
    const supabase = getServiceSupabase({ timeoutMs: 10_000 });
    const state = await loadPackageGroupWalkState(supabase, { forceRefresh });
    return NextResponse.json(state, {
      headers: { "cache-control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    if (error instanceof PackageGroupWalksSchemaMissingError) {
      return NextResponse.json({ error: error.message, schemaMissing: true }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unable to load Package Group Walks.";
    logPackageGroupWalkEvent("PACKAGE_GROUP_WALK_SYNC_FAILURE", { error: message, stage: "api_get" });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Mark today's complimentary Package Group Walk completed.
 *
 * Any authenticated RuffOps user may complete a walk. The employee identity comes
 * from the session, the dog must still be server-side eligible, and the write is
 * idempotent — replays and concurrent clicks return the single canonical record.
 */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const demoBlocked = blockDemoWrite(request);
  if (demoBlocked) return demoBlocked;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "complete").trim();
  if (action !== "complete") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const gingrAnimalId = String(body.gingrAnimalId ?? body.animalId ?? "").trim();
  if (!gingrAnimalId) {
    return NextResponse.json({ error: "Missing dog." }, { status: 400 });
  }

  const supabase = getServiceSupabase({ timeoutMs: 10_000 });

  try {
    const actor = await resolvePackageGroupWalkActor(supabase, session);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const businessDate = packageGroupWalkBusinessDate();
    // A client-supplied business date is never trusted; a stale tab must not
    // write yesterday's walk.
    const requestedDate = String(body.businessDate ?? "").trim();
    if (requestedDate && requestedDate !== businessDate) {
      return NextResponse.json(
        {
          error: "The business date changed. Refresh Package Group Walks and try again.",
          businessDate
        },
        { status: 409 }
      );
    }

    // Server-side eligibility check — the browser claiming a dog qualifies is not enough.
    const eligible = await findEligibleDogForCompletion(supabase, gingrAnimalId);
    if (!eligible) {
      const state = await loadPackageGroupWalkState(supabase);
      const already = state.completed.find((row) => row.gingrAnimalId === gingrAnimalId);
      if (already) {
        return NextResponse.json({ ok: true, completion: already, created: false });
      }
      logPackageGroupWalkEvent("PACKAGE_GROUP_WALK_ELIGIBILITY_MISMATCH", {
        gingrAnimalId,
        businessDate,
        actorEmail: actor.email,
        reason: "not_eligible_at_completion"
      });
      return NextResponse.json(
        {
          error:
            "That dog is not currently eligible for a Package Group Walk. They may have checked out in Gingr."
        },
        { status: 409 }
      );
    }

    const result = await completePackageGroupWalk(supabase, {
      businessDate,
      gingrAnimalId: eligible.gingrAnimalId,
      dogName: eligible.dogName,
      gingrOwnerId: eligible.gingrOwnerId,
      ownerName: eligible.ownerName,
      gingrReservationId: eligible.gingrReservationId,
      gingrCheckedInAt: eligible.checkedInAt,
      packageKey: eligible.packageKey,
      packageName: eligible.packageName,
      gingrPackageId: eligible.gingrPackageId,
      completedByUserId: actor.userId,
      completedByUserName: actor.displayName,
      completedByUserEmail: actor.email
    });

    if (result.created) {
      logPackageGroupWalkEvent("PACKAGE_GROUP_WALK_COMPLETED", {
        gingrAnimalId: eligible.gingrAnimalId,
        dogName: eligible.dogName,
        packageKey: eligible.packageKey,
        businessDate,
        completedBy: actor.displayName
      });

      void writeAdminAuditLog({
        actorAdminId: actor.userId,
        actorEmail: actor.email,
        action: "package_group_walk.completed",
        targetType: "package_group_walk",
        targetId: result.completion.id,
        details: {
          gingr_animal_id: eligible.gingrAnimalId,
          dog_name: eligible.dogName,
          package: eligible.packageName,
          package_key: eligible.packageKey,
          business_date: businessDate,
          completed_at: result.completion.completedAt,
          completed_by: actor.displayName
        }
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      completion: { ...result.completion, photoUrl: result.completion.photoUrl ?? eligible.photoUrl },
      created: result.created
    });
  } catch (error) {
    if (error instanceof PackageGroupWalksSchemaMissingError) {
      return NextResponse.json({ error: error.message, schemaMissing: true }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Unable to record the Package Group Walk completion.";
    logPackageGroupWalkEvent("PACKAGE_GROUP_WALK_COMPLETION_FAILURE", {
      gingrAnimalId,
      error: message,
      actorEmail: session.email
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
