import assert from "node:assert/strict";
import {
  BLOG_HELP_GUIDE_PATH,
  BLOG_HELP_LINKS,
  BLOG_HELP_STEPS,
  BLOG_HELP_SUPPORT_EMAIL,
  BLOG_HELP_SUPPORT_HREF,
  resolveBlogTutorialVideo,
  blogHelpSectionHref
} from "../lib/blog/help-guide";
import { BLOG_NAV_PAGES } from "../lib/blog/constants";
import { BLOG_DASHBOARD_NAV } from "../lib/blog/dashboard-nav";
import { FITDOG_BLOG_ORANGE } from "../lib/blog/brand";
import { HELP_ARTICLES } from "../lib/admin/help-content";

assert.equal(BLOG_HELP_GUIDE_PATH, "/admin/blog/help/how-to-use-blog-generator");
assert.equal(FITDOG_BLOG_ORANGE, "#ff6f26");
assert.equal(BLOG_HELP_SUPPORT_HREF, "/admin?board=staff&tab=help");
assert.equal(BLOG_HELP_SUPPORT_EMAIL, "Lonnie@fitdog.com");
assert.equal(BLOG_HELP_STEPS.length, 7);
assert.equal(BLOG_HELP_STEPS[0].id, "overview");
assert.equal(BLOG_HELP_STEPS[6].id, "best-practices");
assert.equal(blogHelpSectionHref("topics"), `${BLOG_HELP_GUIDE_PATH}#topics`);

assert.ok(BLOG_NAV_PAGES.some((p) => p.id === "help"));
assert.ok(BLOG_DASHBOARD_NAV.some((section) => section.items.some((item) => item.id === "help")));

for (const key of ["dashboard", "generator", "topics", "needsReview", "calendar", "analytics", "settings"] as const) {
  assert.ok(BLOG_HELP_LINKS[key].startsWith("/admin/automatic-blog"), `${key} must point at Blog Generator`);
}

assert.equal(resolveBlogTutorialVideo(null), null);
assert.equal(resolveBlogTutorialVideo({ help_tutorial_video_url: " https://cdn.example/video.mp4 " }), "https://cdn.example/video.mp4");

const guideArticle = HELP_ARTICLES.find((article) => article.id === "blog-generator-how-to");
assert.ok(guideArticle, "Help Center must list the Blog Generator guide");
assert.ok(guideArticle?.links?.some((link) => link.href === BLOG_HELP_GUIDE_PATH));

console.log("blog-help-guide tests passed");
