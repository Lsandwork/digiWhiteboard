import assert from "node:assert/strict";
import { BLOG_DASHBOARD_NAV } from "../lib/blog/dashboard-nav";
import { BLOG_APP_PATH, BLOG_NAV_PAGES } from "../lib/blog/constants";
import { FITDOG_BLOG_ORANGE, FITDOG_BLOG_LOGO } from "../lib/blog/brand";
import { comparePeriodLabel, planPipelineTransition } from "../lib/blog/workflow";
import { buildArticlePreviewHtml, estimateReadingMinutes } from "../lib/blog/utils/article-preview-html";
import { chunkSpeechText, pickBestSpeechVoice } from "../lib/blog/utils/natural-speech-voice";

assert.equal(BLOG_APP_PATH, "/admin/automatic-blog");
assert.equal(FITDOG_BLOG_ORANGE, "#ff6f26");
assert.ok(FITDOG_BLOG_LOGO.markCircle.includes("fitdog-logo-circle-badge"));

const navIds = BLOG_DASHBOARD_NAV.flatMap((section) => section.items.map((item) => item.id));
assert.ok(navIds.includes("overview"));
assert.ok(navIds.includes("calendar"));
assert.ok(navIds.includes("articles"));
assert.ok(navIds.includes("newsletter"));
assert.ok(navIds.includes("generate"));
assert.ok(navIds.includes("search-console"));
assert.ok(!(navIds as string[]).includes("comments"), "Comments must stay hidden until a real comments system exists");

for (const id of navIds) {
  assert.ok(
    BLOG_NAV_PAGES.some((page) => page.id === id),
    `dashboard nav id ${id} must exist in BLOG_NAV_PAGES`
  );
}

assert.equal(comparePeriodLabel("7d"), "vs previous 7 days");
assert.equal(comparePeriodLabel("30d"), "vs last 30 days");

const topicMove = planPipelineTransition({
  kind: "topic",
  id: "t1",
  fromColumn: "topicIdeas",
  toColumn: "drafts"
});
assert.equal(topicMove.ok, true);
if (topicMove.ok) assert.equal(topicMove.action, "generate_from_topic");

const invalidTopic = planPipelineTransition({
  kind: "topic",
  id: "t1",
  fromColumn: "topicIdeas",
  toColumn: "approved"
});
assert.equal(invalidTopic.ok, false);

const draftToReview = planPipelineTransition({
  kind: "article",
  id: "a1",
  fromColumn: "drafts",
  toColumn: "needsReview"
});
assert.equal(draftToReview.ok, true);
if (draftToReview.ok) {
  assert.equal(draftToReview.action, "submit_for_review");
  assert.equal(draftToReview.permission, "blog.edit");
}

const failedFactCheck = planPipelineTransition({
  kind: "article",
  id: "a1",
  fromColumn: "needsReview",
  toColumn: "approved",
  factCheckStatus: "failed",
  humanEditorialScore: 95,
  humanScoreThreshold: 90
});
assert.equal(failedFactCheck.ok, false);

const lowScore = planPipelineTransition({
  kind: "article",
  id: "a1",
  fromColumn: "needsReview",
  toColumn: "approved",
  factCheckStatus: "passed",
  humanEditorialScore: 70,
  humanScoreThreshold: 90
});
assert.equal(lowScore.ok, false);

const approve = planPipelineTransition({
  kind: "article",
  id: "a1",
  fromColumn: "needsReview",
  toColumn: "approved",
  factCheckStatus: "passed",
  humanEditorialScore: 94,
  humanScoreThreshold: 90
});
assert.equal(approve.ok, true);
if (approve.ok) assert.equal(approve.permission, "blog.approve");

const scheduleMissingDate = planPipelineTransition({
  kind: "article",
  id: "a1",
  fromColumn: "approved",
  toColumn: "scheduled"
});
assert.equal(scheduleMissingDate.ok, false);

const scheduleOk = planPipelineTransition({
  kind: "article",
  id: "a1",
  fromColumn: "approved",
  toColumn: "scheduled",
  scheduledFor: new Date(Date.now() + 86400000).toISOString()
});
assert.equal(scheduleOk.ok, true);
if (scheduleOk.ok) assert.equal(scheduleOk.action, "schedule");

const previewHtml = buildArticlePreviewHtml("## Summer safety\n\nKeep dogs hydrated.");
assert.match(previewHtml, /<h2 id="summer-safety">/);
assert.match(previewHtml, /<p>Keep dogs hydrated\./);
assert.equal(estimateReadingMinutes("one two three four"), 1);

const chunks = chunkSpeechText("First sentence. Second sentence. Third sentence.", 20);
assert.ok(chunks.length >= 2);

const fakeVoices = [
  { name: "Bad News", lang: "en-US", localService: true },
  { name: "Samantha", lang: "en-US", localService: true }
] as Array<{ name: string; lang: string; localService: boolean }>;
assert.equal(pickBestSpeechVoice(fakeVoices as never)?.name, "Samantha");

console.log("blog-dashboard tests passed");
