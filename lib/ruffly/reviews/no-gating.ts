/**
 * Review invitation destinations must never be conditionally hidden by rating.
 * This helper is the single source of truth for public destinations shown after feedback.
 */
export type PublicReviewDestination = {
  id: string;
  label: string;
  url: string;
};

export function getPublicReviewDestinations(settings?: {
  googleReviewUrl?: string | null;
  facebookReviewUrl?: string | null;
}): PublicReviewDestination[] {
  const destinations: PublicReviewDestination[] = [];
  if (settings?.googleReviewUrl) {
    destinations.push({ id: "google", label: "Google", url: settings.googleReviewUrl });
  }
  if (settings?.facebookReviewUrl) {
    destinations.push({ id: "facebook", label: "Facebook", url: settings.facebookReviewUrl });
  }
  return destinations;
}

/** Always returns the same destinations regardless of rating — prevents review gating. */
export function destinationsForFeedbackRating(
  rating: number | null | undefined,
  settings?: { googleReviewUrl?: string | null; facebookReviewUrl?: string | null }
): PublicReviewDestination[] {
  void rating; // intentionally unused — rating must not filter destinations
  return getPublicReviewDestinations(settings);
}

export function isReviewGatingDisabled(): true {
  return true;
}
