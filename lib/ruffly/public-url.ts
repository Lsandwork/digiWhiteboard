export function rufflyPublicBaseUrl() {
  return (process.env.RUFFLY_PUBLIC_URL?.trim() || "https://ruffly.ruffops.com").replace(/\/$/, "");
}

export function rufflyApiBaseUrl() {
  return (
    process.env.RUFFLY_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://staff.ruffops.com"
  ).replace(/\/$/, "");
}

export function rufflyReviewPath(token: string) {
  return `${rufflyPublicBaseUrl()}/review/${encodeURIComponent(token)}`;
}

export function rufflyFeedbackPath(token: string) {
  return `${rufflyPublicBaseUrl()}/feedback/${encodeURIComponent(token)}`;
}
