import { getServiceSupabase } from "@/lib/supabase/server";

export type OverviewRange =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "custom";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function rangeToDates(range: OverviewRange, customFrom?: string, customTo?: string) {
  const now = new Date();
  const today = startOfDay(now);
  if (range === "today") return { from: today, to: now };
  if (range === "yesterday") {
    const from = new Date(today);
    from.setDate(from.getDate() - 1);
    return { from, to: today };
  }
  if (range === "last_7") {
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    return { from, to: now };
  }
  if (range === "last_30") {
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return { from, to: now };
  }
  if (range === "this_month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from, to: now };
  }
  if (range === "last_month") {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const to = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from, to };
  }
  return {
    from: customFrom ? new Date(customFrom) : new Date(today.getTime() - 7 * 86400000),
    to: customTo ? new Date(customTo) : now
  };
}

export async function loadRufflyOverviewMetrics(range: OverviewRange = "last_7") {
  const supabase = getServiceSupabase();
  const { from, to } = rangeToDates(range);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [
    leadsToday,
    unanswered,
    awaitingFollowUp,
    won,
    lost,
    reviewRequests,
    reviewsWeek,
    reviewsAwaiting,
    feedbackAlerts,
    aiSessions,
    handoffs,
    missedCalls
  ] = await Promise.all([
    supabase
      .from("ruffly_leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfDay(new Date()).toISOString()),
    supabase
      .from("ruffly_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_staff"),
    supabase
      .from("ruffly_leads")
      .select("id", { count: "exact", head: true })
      .eq("stage", "needs_follow_up"),
    supabase.from("ruffly_leads").select("id", { count: "exact", head: true }).eq("stage", "won").gte("updated_at", fromIso).lte("updated_at", toIso),
    supabase.from("ruffly_leads").select("id", { count: "exact", head: true }).eq("stage", "lost").gte("updated_at", fromIso).lte("updated_at", toIso),
    supabase.from("ruffly_review_requests").select("id", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso),
    supabase.from("ruffly_reviews").select("id", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso),
    supabase.from("ruffly_reviews").select("id", { count: "exact", head: true }).eq("response_status", "pending_approval"),
    supabase.from("ruffly_feedback").select("id", { count: "exact", head: true }).in("urgency", ["high", "critical"]).neq("status", "closed"),
    supabase.from("ruffly_ai_sessions").select("id", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso),
    supabase.from("ruffly_ai_sessions").select("id", { count: "exact", head: true }).eq("status", "handed_off").gte("updated_at", fromIso).lte("updated_at", toIso),
    supabase.from("ruffly_call_records").select("id", { count: "exact", head: true }).eq("direction", "missed").gte("created_at", fromIso).lte("created_at", toIso)
  ]);

  return {
    range: { from: fromIso, to: toIso },
    newLeadsToday: leadsToday.count ?? 0,
    unansweredConversations: unanswered.count ?? 0,
    averageFirstResponseMinutes: null as number | null,
    leadsAwaitingFollowUp: awaitingFollowUp.count ?? 0,
    assessmentsBooked: 0,
    leadsWon: won.count ?? 0,
    leadsLost: lost.count ?? 0,
    reviewRequestsSent: reviewRequests.count ?? 0,
    reviewRequestConversionRate: null as number | null,
    currentGoogleRating: null as number | null,
    newReviewsThisWeek: reviewsWeek.count ?? 0,
    reviewsAwaitingResponse: reviewsAwaiting.count ?? 0,
    privateFeedbackAlerts: feedbackAlerts.count ?? 0,
    campaignDeliveryPerformance: null,
    reactivatedCustomers: 0,
    estimatedRevenueInfluenced: 0,
    aiConversationsHandled: aiSessions.count ?? 0,
    aiToHumanHandoffs: handoffs.count ?? 0,
    missedCallsRecovered: missedCalls.count ?? 0,
    upcomingAutomations: 0
  };
}
