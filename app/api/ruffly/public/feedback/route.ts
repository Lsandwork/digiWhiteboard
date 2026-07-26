import { NextResponse } from "next/server";
import { enqueueRufflyJob } from "@/lib/ruffly/queue/jobs";
import { destinationsForFeedbackRating } from "@/lib/ruffly/reviews/no-gating";
import { verifyRufflyToken } from "@/lib/ruffly/tokens/signed-token";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const payload = verifyRufflyToken(token);
  if (!payload || (payload.typ !== "feedback" && payload.typ !== "review")) {
    return NextResponse.json({ error: "Invalid or expired feedback link." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    contactId: payload.sub,
    destinations: destinationsForFeedbackRating(null, {
      googleReviewUrl: process.env.RUFFLY_GOOGLE_REVIEW_URL || null,
      facebookReviewUrl: process.env.RUFFLY_FACEBOOK_REVIEW_URL || null
    }),
    gatingDisabled: true
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    rating?: number;
    feedback?: string;
    callbackRequested?: boolean;
    category?: string;
  };
  const payload = verifyRufflyToken(String(body.token || ""));
  if (!payload || (payload.typ !== "feedback" && payload.typ !== "review")) {
    return NextResponse.json({ error: "Invalid or expired feedback link." }, { status: 401 });
  }

  const rating = Number(body.rating || 0);
  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating 1-5 is required." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: feedback, error } = await supabase
    .from("ruffly_feedback")
    .insert({
      contact_id: payload.sub,
      category: String(body.category || "other"),
      rating,
      body: String(body.feedback || ""),
      callback_requested: Boolean(body.callbackRequested),
      status: "new",
      urgency: rating <= 2 ? "critical" : "normal"
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const destinations = destinationsForFeedbackRating(rating, {
    googleReviewUrl: process.env.RUFFLY_GOOGLE_REVIEW_URL || null,
    facebookReviewUrl: process.env.RUFFLY_FACEBOOK_REVIEW_URL || null
  });

  if (rating <= 2) {
    await enqueueRufflyJob({
      jobType: "low_feedback_alert",
      payload: { feedbackId: feedback.id, contactId: payload.sub, rating },
      idempotencyKey: `low_feedback:${feedback.id}`
    });
  }

  return NextResponse.json({ ok: true, feedbackId: feedback.id, destinations, gatingDisabled: true });
}
