import { NextResponse } from "next/server";
import { requireBodyCheckAccess } from "@/lib/body-checks/access";
import { loadBodyCheckRoster } from "@/lib/body-checks/gingr";
import { countRoster, filterRoster } from "@/lib/body-checks/roster";
import { reportStats } from "@/lib/body-checks/store";
import { ROSTER_FILTERS, type RosterFilter } from "@/lib/body-checks/types";
import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireBodyCheckAccess(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const requested = url.searchParams.get("date") || "";
  const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayInLosAngeles();
  const query = url.searchParams.get("q") || "";
  const filterParam = url.searchParams.get("filter") || "all";
  const filter = (ROSTER_FILTERS as readonly string[]).includes(filterParam) ? (filterParam as RosterFilter) : "all";
  const force = url.searchParams.get("refresh") === "1";

  const roster = await loadBodyCheckRoster({ businessDate, force });
  if (roster.error && !roster.syncedAt) {
    return NextResponse.json(
      {
        error: roster.error,
        stale: true,
        rows: [],
        counts: null,
        coverageNote: roster.coverageNote,
        businessDate
      },
      { status: 503 }
    );
  }

  let stats = { submittedToday: 0, submittedAnimalIds: [] as string[], unresolvedFollowUps: 0, followUpAnimalIds: [] as string[] };
  let statsError: string | null = null;
  try {
    stats = await reportStats(gate.supabase, businessDate);
  } catch (error) {
    statsError = error instanceof Error ? error.message : "Saved report counts are unavailable.";
  }

  const followUpAnimalIds = new Set(stats.followUpAnimalIds);
  const submittedAnimalIds = new Set(stats.submittedAnimalIds);
  const rows = filterRoster(roster.rows, { query, filter, followUpAnimalIds }).map((row) => ({
    ...row,
    checkedToday: submittedAnimalIds.has(row.gingrAnimalId),
    hasFollowUp: followUpAnimalIds.has(row.gingrAnimalId)
  }));

  return NextResponse.json({
    businessDate,
    rows,
    counts: countRoster(roster.rows, {
      submittedToday: stats.submittedToday,
      unresolvedFollowUps: stats.unresolvedFollowUps
    }),
    syncedAt: roster.syncedAt,
    stale: roster.stale,
    incomplete: roster.incomplete,
    warning: roster.error,
    statsError,
    droppedMissingIdentity: roster.droppedMissingIdentity,
    coverageNote: roster.coverageNote,
    filter,
    query
  });
}
