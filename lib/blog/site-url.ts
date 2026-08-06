import { BLOGS_PUBLIC_ORIGIN } from "@/lib/blogs-domain";
import { publicBlogHref, usesBlogsPublicDomain } from "@/lib/blog/public-path";

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
  return BLOGS_PUBLIC_ORIGIN;
}

export function absoluteBlogUrl(path: string) {
  const origin = getPublicBlogSiteOrigin();
  if (!path) return origin;

  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  if (usesBlogsPublicDomain() && (path === "/blog" || path.startsWith("/blog/"))) {
    const clean = path === "/blog" ? "/" : path.slice("/blog".length) || "/";
    return `${origin}${clean.startsWith("/") ? clean : `/${clean}`}`;
  }

  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export { publicBlogHref, usesBlogsPublicDomain };
