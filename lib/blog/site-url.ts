/** Public site origin for Fitdog blog SEO (canonical, Open Graph, JSON-LD). */
export function getPublicBlogSiteOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (configured) {
    const withProtocol = configured.startsWith("http") ? configured : `https://${configured}`;
    return withProtocol.replace(/\/$/, "");
  }
  return "https://fitdog.ruffops.com";
}

export function absoluteBlogUrl(path: string) {
  const origin = getPublicBlogSiteOrigin();
  if (!path) return origin;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
