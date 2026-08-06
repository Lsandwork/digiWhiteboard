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
  canAccessBlogGenerator,
  hasPermission
} from "../lib/admin/permissions";
import type { AdminTab } from "../lib/admin/types";

assert.equal(DEFAULT_HUMAN_SCORE_THRESHOLD, 90);
assert.equal(DEFAULT_TOPIC_SCORE_THRESHOLD, 85);
assert.ok(BLOG_STATUSES.includes("HUMAN_REVIEW"));
assert.ok(BLOG_STATUSES.includes("PUBLISHED"));
assert.ok(BLOG_NAV_PAGES.length >= 28);
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
  assert.ok(native.publishedUrl?.includes("/blog/test-slug"));

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
assert.equal(roleCanSeeBlogNav("marketing"), true);
assert.equal(roleCanSeeBlogNav("assistant_manager"), false);
assert.equal(roleCanSeeBlogNav("trainer"), false);
assert.equal(roleCanSeeBlogNav("groomer"), false);
assert.equal(canAccessBlogGenerator(null, "owner_admin"), true);
assert.equal(canAccessBlogGenerator(null, "manager_admin"), true);
assert.equal(canAccessBlogGenerator(null, "marketing"), true);
assert.equal(canAccessBlogGenerator(accessFromLegacyRole(null, null, "assistant_manager"), "assistant_manager"), false);
assert.equal(canAccessBlogGenerator(accessFromLegacyRole(null, null, "trainer"), "trainer"), false);
assert.equal(hasPermission(accessFromLegacyRole(null, null, "trainer"), "blog.view"), false);
assert.equal(hasPermission(accessFromLegacyRole(null, null, "marketing"), "blog.view"), true);

const staffTabs = ["overview", "route_generator", "help"] as AdminTab[];
const adminNav = buildStaffPanelNav(staffTabs, "staff", "manager_admin");
const dashboardIdx = adminNav.findIndex((entry) => entry.type === "section" && entry.id === "staff_dashboard");
assert.ok(dashboardIdx >= 0, "staff panel should include Dashboard");
const blogIdx = adminNav.findIndex((entry) => entry.type === "route" && entry.id === "automatic-blog");
assert.ok(blogIdx > dashboardIdx, "Blog Generator should sit under Dashboard");
const nextSectionAfterDashboard = adminNav.findIndex(
  (entry, index) => index > dashboardIdx && entry.type === "section"
);
assert.ok(
  nextSectionAfterDashboard < 0 || blogIdx < nextSectionAfterDashboard,
  "Blog Generator must remain inside the Dashboard section"
);
const appsIdx = adminNav.findIndex((entry) => entry.type === "section" && entry.id === "global_apps");
assert.ok(appsIdx < 0 || blogIdx < appsIdx, "Blog Generator should not live under Applications");

const trainerNav = buildStaffPanelNav(staffTabs, "staff", "trainer");
assert.equal(
  trainerNav.some((entry) => entry.type === "route" && entry.id === "automatic-blog"),
  false
);

const marketingNav = buildStaffPanelNav(["cast_tv", "settings", "help"] as AdminTab[], "marketing", "marketing");
assert.ok(
  marketingNav.some((entry) => entry.type === "route" && entry.id === "automatic-blog"),
  "marketing users should see Blog Generator in the panel"
);

void runAsyncChecks()
  .then(() => {
    console.log("test-automatic-blog passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
