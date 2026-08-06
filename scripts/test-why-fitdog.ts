import assert from "node:assert/strict";
import {
  analyticsEventForAction,
  getFitdogBookingActions,
  getSportsEnrichmentConsultUrl,
  getTrainingConsultUrl,
  trainingAndOutingShareDestination
} from "../lib/blog/booking-config";
import {
  WHY_FITDOG_FAQS,
  WHY_FITDOG_SEO,
  WHY_FITDOG_SERVICES,
  WHY_FITDOG_TESTIMONIALS,
  WHY_FITDOG_TRUST_STRIP
} from "../lib/blog/why-fitdog/content";
import { rewriteBlogsPublicPath } from "../lib/blogs-domain";
import { FITDOG_BLOG_NAV } from "../lib/blog/brand";

assert.equal(WHY_FITDOG_SEO.h1, "Why Santa Monica Dog Parents Choose Fitdog");
assert.ok(WHY_FITDOG_SEO.title.includes("Santa Monica"));
assert.ok(WHY_FITDOG_SEO.description.includes("Santa Monica, CA"));
assert.equal(WHY_FITDOG_SEO.canonicalPath, "/why-fitdog");

assert.equal(rewriteBlogsPublicPath("blog.ruffops.com", "/why-fitdog"), "/blog/why-fitdog");

const trainingUrl = getTrainingConsultUrl();
const outingUrl = getSportsEnrichmentConsultUrl();
assert.equal(trainingUrl, outingUrl);
assert.ok(trainingAndOutingShareDestination());
assert.ok(trainingUrl.startsWith("http"));

const actions = getFitdogBookingActions();
assert.equal(actions.trainingConsult.url, actions.sportsEnrichmentConsult.url);
assert.equal(actions.trainingConsult.url, trainingUrl);

const trainingAnalytics = analyticsEventForAction("trainingConsult");
assert.equal(trainingAnalytics.event, "fitdog_training_consult_clicked");
assert.equal(trainingAnalytics.serviceInterest, "training");

const outingAnalytics = analyticsEventForAction("sportsEnrichmentConsult");
assert.equal(outingAnalytics.event, "fitdog_outing_consult_clicked");
assert.equal(outingAnalytics.serviceInterest, "sports_enrichment_outing");
assert.equal(outingAnalytics.destinationType, trainingAnalytics.destinationType);

const outingCard = WHY_FITDOG_SERVICES.find((s) => s.id === "outings");
assert.ok(outingCard);
assert.equal(outingCard!.primaryAction, "sportsEnrichmentConsult");
assert.equal(WHY_FITDOG_SERVICES.find((s) => s.id === "training")!.primaryAction, "trainingConsult");

assert.ok(WHY_FITDOG_FAQS.some((f) => f.question.includes("sports and enrichment outings")));
assert.ok(
  WHY_FITDOG_FAQS.find((f) => f.question.includes("sports and enrichment outings"))!.answer.includes(
    "same training-consultation"
  )
);

assert.ok(!WHY_FITDOG_TRUST_STRIP.some((item) => /LA's Most Trusted|Los Angeles' Best|1,000\+/i.test(item.label)));
assert.ok(WHY_FITDOG_TESTIMONIALS.every((t) => t.attribution && t.quote));
assert.ok(!WHY_FITDOG_TESTIMONIALS.some((t) => /Sarah M\.|Jason K\.|Emily R\.|Michelle T\./.test(t.attribution)));

assert.ok(FITDOG_BLOG_NAV.some((item) => item.label === "Why Fitdog" && item.href === "/why-fitdog" && !item.external));

console.log("test-why-fitdog passed");
