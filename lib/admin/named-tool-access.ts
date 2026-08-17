/**
 * Named-person tool grants that sit on top of role matrices.
 * Rebeca (also spelled Rebecca) always gets Blog Generator + Social Media Generator.
 */

const BLOG_SUITE_LOGIN_EMAILS = new Set(["rebeca@fitdog.com", "rebecca@fitdog.com"]);
const BLOG_SUITE_FIRST_NAMES = new Set(["rebeca", "rebecca"]);

function normalizePersonToken(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ");
}

function emailLocalPart(email?: string | null) {
  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!normalized.includes("@")) return normalized;
  return normalized.split("@")[0] ?? "";
}

export function isBlogSuiteNamedUser(input?: { email?: string | null; name?: string | null }) {
  const email = String(input?.email ?? "")
    .trim()
    .toLowerCase();
  if (email && BLOG_SUITE_LOGIN_EMAILS.has(email)) return true;

  const local = normalizePersonToken(emailLocalPart(email)).replace(/\s+/g, "");
  if (BLOG_SUITE_FIRST_NAMES.has(local)) return true;

  const firstName = normalizePersonToken(input?.name).split(/\s+/)[0] ?? "";
  return BLOG_SUITE_FIRST_NAMES.has(firstName);
}

/** Marketing-level blog/social permissions granted to named Blog Suite users. */
export const BLOG_SUITE_NAMED_PERMISSIONS = [
  "blog.view",
  "blog.submit_idea",
  "blog.create",
  "blog.edit",
  "blog.review",
  "blog.approve",
  "blog.schedule",
  "blog.publish",
  "blog.archive",
  "blog.manage_sources",
  "blog.manage_media",
  "blog.approve_images",
  "blog.manage_brand",
  "blog.view_analytics"
] as const;
