import { BLOGS_HOSTNAME, BLOGS_PUBLIC_ORIGIN } from "@/lib/blogs-domain";

/** Whether public blog URLs should omit the /blog prefix (blogs.ruffops.com). */
export function usesBlogsPublicDomain() {
  const configured =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    BLOGS_PUBLIC_ORIGIN;
  const normalized = configured.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  return normalized === BLOGS_HOSTNAME || normalized.endsWith(`.${BLOGS_HOSTNAME}`);
}

/**
 * Public blog path for in-app links.
 * blogs.ruffops.com → /articles, /{slug}
 * other hosts → /blog/articles, /blog/{slug}
 */
export function publicBlogHref(subpath = "") {
  const suffix = subpath.startsWith("/") ? subpath : subpath ? `/${subpath}` : "";
  if (usesBlogsPublicDomain()) {
    if (!suffix) return "/";
    return suffix;
  }
  return `/blog${suffix}`;
}

export const BLOG_PUBLIC_HOME_HREF = publicBlogHref();
