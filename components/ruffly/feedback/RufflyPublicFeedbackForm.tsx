"use client";

import { RufflyPublicReviewForm } from "@/components/ruffly/reviews/RufflyPublicReviewForm";

/** Private feedback landing reuses the same no-gating submission flow. */
export function RufflyPublicFeedbackForm({ token }: { token: string }) {
  return <RufflyPublicReviewForm token={token} />;
}
