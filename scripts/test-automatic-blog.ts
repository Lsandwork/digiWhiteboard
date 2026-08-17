import assert from "node:assert/strict";
import {
  BANNED_FILLER_PHRASES,
  BLOG_NAV_PAGES,
  BLOG_STATUSES,
  DEFAULT_HUMAN_SCORE_THRESHOLD,
  DEFAULT_TOPIC_SCORE_THRESHOLD
} from "../lib/blog/constants";
import {
  findBannedPhrases,
  startsWithGenericQuestion,
  containsFakeStoryPattern
} from "../lib/blog/editorial/banned-phrases";
import { scoreHumanEditorialQuality } from "../lib/blog/editorial/human-score";
import { scoreTopicQuality } from "../lib/blog/editorial/topic-score";
import {
  runEmpathyAgent,
  runFactCheckAgent,
  runFinalHumanQualityAgent,
  runNaturalVoiceAgent,
  runPracticalAdviceAgent,
  buildSocialPackage
} from "../lib/blog/agents/reviews";
import { publishNative, publishWebhook } from "../lib/blog/publishing/adapters";
import { BLOG_SEED_TOPICS } from "../lib/blog/topics/seed-topics";
import { slugifyBlogTitle } from "../lib/blog/utils/slug";
import { BLOG_PERMISSIONS } from "../lib/blog/permissions";
import {
  AUTOMATIC_BLOG_NAV_ROUTE,
  buildStaffPanelNav,
  roleCanSeeBlogNav
} from "../lib/admin/nav-groups";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  canAccessBlogGenerator,
  hasPermission
} from "../lib/admin/permissions";
import type { AdminTab } from "../lib/admin/types";
import { SUPER_ADMIN_HUBS, hubLinkHref, hubLinkLabel } from "../lib/admin/super-admin-nav";
import { filterHubDefinition } from "../lib/admin/role-hub-nav";

assert.equal(DEFAULT_HUMAN_SCORE_THRESHOLD, 90);
assert.equal(DEFAULT_TOPIC_SCORE_THRESHOLD, 85);
assert.ok(BLOG_STATUSES.includes("HUMAN_REVIEW"));
assert.ok(BLOG_STATUSES.includes("PUBLISHED"));
assert.ok(BLOG_NAV_PAGES.length >= 35);
assert.ok(BLOG_PERMISSIONS.includes("blog.view"));
assert.ok(BLOG_PERMISSIONS.includes("blog.publish"));
assert.ok(BANNED_FILLER_PHRASES.some((p) => /fast-paced world/i.test(p)));

assert.ok(BLOG_SEED_TOPICS.length >= 75, `expected >=75 seed topics, got ${BLOG_SEED_TOPICS.length}`);

const weak = scoreTopicQuality({
  title: "Why Dogs Are Great",
  readerConcern: "",
  primaryTakeaway: "",
  angle: ""
});
assert.ok(weak.rejected || weak.score < 85, "weak topics must fail quality gate");

const strong = scoreTopicQuality({
  title: "How to tell when your dog needs a break from group play",
  readerConcern: "Owners worry their dog is overstimulated in daycare playgroups.",
  primaryTakeaway: "Watch for stress signals and support rest before exhaustion sets in.",
  angle: "Practical observation guide for daycare-style social play.",
  pillar: "daycare-education"
});
assert.ok(strong.score >= 85, `strong topic should score high, got ${strong.score}`);

const fillerBody = "In today's fast-paced world, your furry companion needs the ultimate guide. Have you ever wondered?";
assert.ok(findBannedPhrases(fillerBody).length >= 2);
assert.ok(startsWithGenericQuestion("Have you ever wondered about daycare?"));
assert.ok(containsFakeStoryPattern("Imagine this: Meet Max, who recently discovered daycare."));

const goodBody = [
  "Many dogs need breaks during busy social play, and owners often notice this only after the dog looks fried at pickup.",
  "",
  "Start with what you can observe. For example, watch for mounting tension, hard stares, or a dog who stops recovering between interactions.",
  "Not every dog wants the same amount of play. Some dogs thrive in shorter sessions with more rest.",
  "Try giving your dog a quiet reset after a stimulating day before stacking more activity.",
  "If you see sudden behavior changes that look like pain, talk with a veterinarian."
].join("\n");

const human = scoreHumanEditorialQuality({
  title: "How to tell when your dog needs a break from group play",
  body: goodBody,
  excerpt: "Watch for stress signals and support rest."
});
assert.ok(human.score >= 80, `expected decent human score, got ${human.score}`);
assert.ok(Array.isArray(human.deductions));

const empathy = runEmpathyAgent(goodBody, "Owners worry their dog is overstimulated");
assert.ok(empathy.ok);
const practical = runPracticalAdviceAgent(goodBody);
assert.ok(practical.score >= 70);
const natural = runNaturalVoiceAgent(goodBody, "How to tell when your dog needs a break from group play");
assert.ok(natural.score >= 70);
const fact = runFactCheckAgent(goodBody);
assert.ok(fact.ok);
const badFact = runFactCheckAgent("A study shows 97% of dogs need daycare and veterinarians say it cures anxiety.");
assert.equal(badFact.ok, false);

const finalGate = runFinalHumanQualityAgent({
  title: "How to tell when your dog needs a break from group play",
  body: goodBody,
  excerpt: "Watch for stress signals.",
  threshold: 90
});
assert.ok(finalGate.humanScore.score >= 0);

const social = buildSocialPackage("Title", "Excerpt", "Takeaway");
assert.ok(social.instagram.includes("Takeaway"));
assert.ok(!/you won’t believe|stop scrolling/i.test(JSON.stringify(social)));

assert.equal(slugifyBlogTitle("Hello World!"), "hello-world");
assert.equal(slugifyBlogTitle("  How dogs communicate  "), "how-dogs-communicate");

async function runAsyncChecks() {
  const native = await publishNative({
    title: "Test",
    slug: "test-slug",
    excerpt: "e",
    html: "<p>hi</p>"
  });
  assert.equal(native.ok, true);
  assert.ok(native.publishedUrl?.includes("blog.ruffops.com/test-slug"));

  const oldWebhook = process.env.BLOG_PUBLISH_WEBHOOK_URL;
  process.env.BLOG_PUBLISH_WEBHOOK_URL = "http://localhost/hook";
  const webhook = await publishWebhook(
    { title: "t", slug: "s", excerpt: "e", html: "<p>x</p>" },
    "idem-1"
  );
  assert.equal(webhook.ok, false);
  if (oldWebhook === undefined) delete process.env.BLOG_PUBLISH_WEBHOOK_URL;
  else process.env.BLOG_PUBLISH_WEBHOOK_URL = oldWebhook;

  assert.ok(["gemini", "openai", "anthropic", "perplexity", "cursor"].length === 5);
}

assert.equal(AUTOMATIC_BLOG_NAV_ROUTE.label, "Blog Generator");
assert.equal(roleCanSeeBlogNav("owner_admin"), true);
assert.equal(roleCanSeeBlogNav("manager_admin"), true);
assert.equal(roleCanSeeBlogNav("super_admin"), true);
assert.equal(roleCanSeeBlogNav("admin"), true);
assert.equal(roleCanSeeBlogNav("marketing"), true);
assert.equal(roleCanSeeBlogNav("assistant_manager"), false);
assert.equal(roleCanSeeBlogNav("trainer"), false);
assert.equal(roleCanSeeBlogNav("groomer"), false);
assert.equal(roleCanSeeBlogNav("trainer", "rebeca@fitdog.com"), true);
assert.equal(roleCanSeeBlogNav("groomer", "rebecca@fitdog.com"), true);
assert.equal(roleCanSeeBlogNav("front_desk_coordinator", null, "Rebeca"), true);
assert.equal(canAccessBlogGenerator(null, "owner_admin"), true);
assert.equal(canAccessBlogGenerator(null, "manager_admin"), true);
assert.equal(canAccessBlogGenerator(null, "marketing"), true);
assert.equal(canAccessBlogGenerator(accessFromLegacyRole(null, null, "assistant_manager"), "assistant_manager"), false);
assert.equal(canAccessBlogGenerator(accessFromLegacyRole(null, null, "trainer"), "trainer"), false);
assert.equal(
  canAccessBlogGenerator(accessFromLegacyRole("u-rebeca", "rebeca@fitdog.com", "trainer"), "trainer", "rebeca@fitdog.com"),
  true
);
assert.equal(
  canAccessBlogGenerator(accessFromLegacyRole(null, null, "groomer"), "groomer", null, "Rebecca Lopez"),
  true
);
assert.equal(hasPermission(accessFromLegacyRole(null, null, "trainer"), "blog.view"), false);
assert.equal(hasPermission(accessFromLegacyRole(null, null, "marketing"), "blog.view"), true);
assert.equal(hasPermission(accessFromLegacyRole("u-rebeca", "rebeca@fitdog.com", "trainer"), "blog.create"), true);

{
  const apps = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["live_fleet", "route_generator", "ops_system_health"], {
    includeBlog: true,
    includeRuffly: true
  });
  const labels = apps.sections.flatMap((section) => section.links.map((link) => link.label));
  assert.ok(labels.includes("Blog Generator"), "Apps hub includes Blog Generator");
  assert.ok(labels.includes("Social Media Generator"), "Apps hub includes Social Media Generator");
  const hrefs = Object.fromEntries(
    apps.sections.flatMap((section) => section.links.map((link) => [hubLinkHref(link), hubLinkLabel(link)]))
  );
  assert.equal(hrefs["/admin/automatic-blog"], "Blog Generator");
  assert.equal(hrefs["/admin/automatic-blog?page=social-generator"], "Social Media Generator");
  assert.equal(hrefs["/admin?board=staff&tab=live_fleet"], "Live Fleet");
  assert.equal(hrefs["/admin?board=staff&tab=route_generator"], "Route Generator");
  assert.equal(hrefs["/admin?board=staff&tab=ops_system_health"], "System Health & Debugging");
  assert.equal(hrefs["/gingr"], "Gingr");
  assert.equal(hrefs["/ruffly"], "Ruffly");
  assert.equal(
    Object.keys(hrefs).some((href) => href.includes("tab=my_shift")),
    false,
    "Apps tiles must not point at My Shift"
  );

  const hidden = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["live_fleet"], { includeBlog: false });
  const hiddenLabels = hidden.sections.flatMap((section) => section.links.map((link) => link.label));
  assert.equal(hiddenLabels.includes("Blog Generator"), false);
  assert.equal(hiddenLabels.includes("Social Media Generator"), false);

  const marketingApps = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, [], {
    includeBlog: true,
    includeRuffly: true,
    marketingAppsOnly: true
  });
  const marketingLabels = marketingApps.sections.flatMap((section) => section.links.map((link) => link.label));
  assert.ok(marketingLabels.includes("Blog Generator"));
  assert.ok(marketingLabels.includes("Social Media Generator"));
  assert.equal(marketingLabels.includes("Live Fleet"), false);
  assert.equal(marketingLabels.includes("Route Generator"), false);

  const rebecaApps = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["sa_apps_hub"], {
    includeBlog: roleCanSeeBlogNav("trainer", "rebeca@fitdog.com"),
    includeRuffly: true
  });
  const rebecaLabels = rebecaApps.sections.flatMap((section) => section.links.map((link) => link.label));
  assert.ok(rebecaLabels.includes("Blog Generator"), "Rebeca sees Blog Generator in Apps");
  assert.ok(rebecaLabels.includes("Social Media Generator"), "Rebeca sees Social Media Generator in Apps");
}

const staffTabs = ["overview", "route_generator", "sa_apps_hub", "help"] as AdminTab[];
const adminNav = buildStaffPanelNav(staffTabs, "staff", "manager_admin");
assert.ok(
  adminNav.some((entry) => entry.type === "item" && entry.tab === "sa_apps_hub"),
  "Admin hub sidebar includes Apps"
);
assert.equal(
  adminNav.some((entry) => entry.type === "route" && entry.id === "automatic-blog"),
  false,
  "Hub sidebar keeps Blog Generator inside Apps, not as a primary tab"
);

const teamLeadNav = buildStaffPanelNav(staffTabs, "staff", "team_leader");
assert.equal(
  teamLeadNav.some((entry) => entry.type === "item" && entry.tab === "route_generator"),
  false,
  "Team Lead hub sidebar does not list Route Generator"
);

const trainerNav = buildStaffPanelNav(staffTabs, "staff", "trainer");
assert.equal(
  trainerNav.some((entry) => entry.type === "route" && entry.id === "automatic-blog"),
  false
);

const marketingNav = buildStaffPanelNav(
  ["cast_tv", "sa_apps_hub", "bulk_photo_upload", "settings", "help"] as AdminTab[],
  "marketing",
  "marketing"
);
assert.ok(
  marketingNav.some((entry) => entry.type === "item" && entry.tab === "sa_apps_hub"),
  "marketing users should see Apps on the CAST-TV board"
);
assert.ok(
  marketingNav.some((entry) => entry.type === "item" && entry.tab === "bulk_photo_upload"),
  "marketing CAST-TV panel includes Bulk Photo Upload"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "marketing"), "sa_apps_hub", "marketing", "marketing"),
  true,
  "marketing can open Apps"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "manager_admin"), "sa_apps_hub", "manager_admin", "staff"),
  true,
  "admins can open Apps"
);

void runAsyncChecks()
  .then(() => {
    console.log("test-automatic-blog passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
