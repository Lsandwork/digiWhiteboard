import {
  BLOG_PRIMARY_PUBLIC_ORIGIN,
  getBlogPrimaryPublicOrigin,
  isBlogPublicHostname
} from "@/lib/blogs-domain";
import { publicBlogHref, usesBlogsPublicDomain } from "@/lib/blog/public-path";

/** Public site origin for Fitdog blog SEO (canonical, Open Graph, JSON-LD). */
export function getPublicBlogSiteOrigin() {
  // Prefer an explicitly configured public blog host. Never fall back to Digi-Board
  // NEXT_PUBLIC_SITE_URL (staff.ruffops.com) — that pollutes canonicals/sitemaps.
  const configured = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.trim();
  if (configured) {
    const withProtocol = configured.startsWith("http") ? configured : `https://${configured}`;
    try {
      const hostname = new URL(withProtocol).hostname;
      if (isBlogPublicHostname(hostname)) {
        return new URL(withProtocol).origin.replace(/\/$/, "");
      }
    } catch {
      // ignore invalid configured values
    }
  }
  return getBlogPrimaryPublicOrigin() || BLOG_PRIMARY_PUBLIC_ORIGIN;
}

export function absoluteBlogUrl(path: string) {
  const origin = getPublicBlogSiteOrigin();
  if (!path) return origin;

  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  let normalized = path.startsWith("/") ? path : `/${path}`;

  // Public blog hosts serve clean URLs; strip the internal /blog prefix.
  try {
    if (isBlogPublicHostname(new URL(origin).hostname)) {
      if (normalized === "/blog") normalized = "/";
      else if (normalized.startsWith("/blog/")) normalized = normalized.slice("/blog".length) || "/";
    }
  } catch {
    // keep normalized path
  }

  return `${origin}${normalized}`;
}

export { publicBlogHref, usesBlogsPublicDomain };
