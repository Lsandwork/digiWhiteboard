import {
  BLOG_FITDOG_HOSTNAME,
  BLOG_PRIMARY_PUBLIC_ORIGIN,
  BLOG_PUBLIC_HOSTNAMES,
  BLOGS_HOSTNAME
} from "@/lib/blogs-domain";

function normalizeConfiguredHost(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
}

/** Whether public blog URLs should omit the /blog prefix (blog.fitdog.com, blogs.ruffops.com). */
export function usesBlogsPublicDomain() {
  const configured =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    BLOG_PRIMARY_PUBLIC_ORIGIN;
  const normalized = normalizeConfiguredHost(configured);
  if (BLOG_PUBLIC_HOSTNAMES.includes(normalized as (typeof BLOG_PUBLIC_HOSTNAMES)[number])) return true;
  return BLOG_PUBLIC_HOSTNAMES.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

/**
 * Public blog path for in-app links.
 * blog.fitdog.com / blogs.ruffops.com → /articles, /{slug}
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

export { BLOG_FITDOG_HOSTNAME, BLOGS_HOSTNAME };
