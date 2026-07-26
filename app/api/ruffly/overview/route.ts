import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { loadRufflyOverviewMetrics, type OverviewRange } from "@/lib/ruffly/analytics/overview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.dashboard.view");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "last_7") as OverviewRange;
    const metrics = await loadRufflyOverviewMetrics(range);
    return NextResponse.json({ metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load overview.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({
        metrics: {
          newLeadsToday: 0,
          unansweredConversations: 0,
          averageFirstResponseMinutes: null,
          leadsAwaitingFollowUp: 0,
          assessmentsBooked: 0,
          leadsWon: 0,
          leadsLost: 0,
          reviewRequestsSent: 0,
          reviewRequestConversionRate: null,
          currentGoogleRating: null,
          newReviewsThisWeek: 0,
          reviewsAwaitingResponse: 0,
          privateFeedbackAlerts: 0,
          reactivatedCustomers: 0,
          estimatedRevenueInfluenced: 0,
          aiConversationsHandled: 0,
          aiToHumanHandoffs: 0,
          missedCallsRecovered: 0,
          upcomingAutomations: 0
        },
        warning: "Ruffly tables not migrated yet."
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
