import assert from "node:assert/strict";
import { FITDOG_BLOG_NAV, FITDOG_BLOG_ORANGE, FITDOG_FOOTER_SERVICES, FITDOG_PUBLIC_URLS } from "../lib/blog/brand";
import { INITIAL_BLOG_ARTICLES, INITIAL_BLOG_CATEGORIES } from "../lib/blog/content/initial-articles";
import { getSeedArticleBySlug, getSeedArticles, relatedArticles, neighboringArticles } from "../lib/blog/content/public";
import { findBannedPhrases, startsWithGenericQuestion } from "../lib/blog/editorial/banned-phrases";
import { markdownToSimpleHtml } from "../lib/blog/utils/markdown";
import { absoluteBlogUrl } from "../lib/blog/site-url";
import { BLOG_PRIMARY_PUBLIC_ORIGIN } from "../lib/blogs-domain";

assert.equal(FITDOG_BLOG_ORANGE, "#ff6f26");
assert.ok(FITDOG_BLOG_NAV.some((item) => item.label === "Blog" && item.href === "/"));
assert.ok(!FITDOG_BLOG_NAV.some((item) => item.href === "#"));
assert.ok(FITDOG_FOOTER_SERVICES.every((item) => item.href.startsWith("http")));
assert.ok(FITDOG_PUBLIC_URLS.instagram.includes("instagram.com"));
assert.equal(FITDOG_PUBLIC_URLS.about, "https://www.fitdog.com/about/");
assert.equal(FITDOG_PUBLIC_URLS.whyFitdog, FITDOG_PUBLIC_URLS.about);
assert.equal(FITDOG_PUBLIC_URLS.boarding, "https://www.fitdog.com/club-home/boarding/");
assert.equal(FITDOG_PUBLIC_URLS.daycare, "https://www.fitdog.com/club-home/");
assert.equal(FITDOG_PUBLIC_URLS.training, "https://www.fitdog.com/dog-training/");
assert.equal(FITDOG_PUBLIC_URLS.hikes, "https://www.fitdog.com/los-angeles-outings/");
assert.equal(FITDOG_PUBLIC_URLS.grooming, "https://www.fitdog.com/club-home/grooming/");
assert.equal(FITDOG_PUBLIC_URLS.transportation, "https://www.fitdog.com/club-home/");
assert.equal(FITDOG_PUBLIC_URLS.services, "https://www.fitdog.com/club-home/");
assert.equal(FITDOG_PUBLIC_URLS.members, "https://fitdog.portal.gingrapp.com/public/login");
assert.equal(FITDOG_PUBLIC_URLS.book, "https://www.fitdog.com/daycare-assessment/");
assert.equal(FITDOG_PUBLIC_URLS.contact, "https://www.fitdog.com/contact/");
assert.ok(!(FITDOG_BLOG_NAV as ReadonlyArray<{ label: string }>).some((item) => item.label === "Locations"));
assert.ok(FITDOG_BLOG_NAV.some((item) => item.label === "Services" && item.href === FITDOG_PUBLIC_URLS.services));
assert.ok(FITDOG_BLOG_NAV.some((item) => item.label === "Why Fitdog" && item.href === "/why-fitdog"));
assert.ok(FITDOG_BLOG_NAV.some((item) => item.label === "Members" && item.href === FITDOG_PUBLIC_URLS.members));
assert.ok(FITDOG_BLOG_NAV.some((item) => item.label === "Contact" && item.href === FITDOG_PUBLIC_URLS.contact));
assert.ok(!(FITDOG_BLOG_NAV as ReadonlyArray<{ label: string }>).some((item) => item.label === "About Us"));
assert.ok(!(FITDOG_BLOG_NAV as ReadonlyArray<{ label: string }>).some((item) => item.label === "Why Us"));
assert.equal(FITDOG_PUBLIC_URLS.socialHandle, "@fitdogsports");
assert.equal(
  FITDOG_FOOTER_SERVICES.find((item) => item.label === "Boarding")?.href,
  FITDOG_PUBLIC_URLS.boarding
);
assert.equal(
  FITDOG_FOOTER_SERVICES.find((item) => item.label === "Daycare")?.href,
  FITDOG_PUBLIC_URLS.daycare
);
assert.equal(
  FITDOG_FOOTER_SERVICES.find((item) => item.label === "Training")?.href,
  FITDOG_PUBLIC_URLS.training
);
assert.equal(
  FITDOG_FOOTER_SERVICES.find((item) => item.label === "Hikes & Adventures")?.href,
  FITDOG_PUBLIC_URLS.hikes
);
assert.equal(
  FITDOG_FOOTER_SERVICES.find((item) => item.label === "Grooming")?.href,
  FITDOG_PUBLIC_URLS.grooming
);
assert.equal(
  FITDOG_FOOTER_SERVICES.find((item) => item.label === "Transportation")?.href,
  FITDOG_PUBLIC_URLS.transportation
);

const expectedCovers: Record<string, string> = {
  "how-to-keep-your-dog-safe-happy-summer-la": "/assets/fitdog/social-moments/posters/social-moment-06.jpg",
  "introducing-your-puppy-to-a-new-routine": "/assets/fitdog/social-moments/posters/social-moment-05.jpg",
  "5-indoor-enrichment-ideas-for-rainy-days": "/assets/fitdog/social-moments/posters/social-moment-01.jpg",
  "why-beach-days-are-great-for-dogs": "/assets/fitdog/social-moments/posters/social-moment-02.jpg",
  "what-to-pack-for-your-dogs-boarding-stay": "/assets/fitdog/social-moments/posters/social-moment-08.jpg"
};

assert.equal(INITIAL_BLOG_ARTICLES.length, 5);
assert.ok(INITIAL_BLOG_CATEGORIES.length >= 11);

const requiredSlugs = [
  "how-to-keep-your-dog-safe-happy-summer-la",
  "introducing-your-puppy-to-a-new-routine",
  "5-indoor-enrichment-ideas-for-rainy-days",
  "why-beach-days-are-great-for-dogs",
  "what-to-pack-for-your-dogs-boarding-stay"
];
for (const slug of requiredSlugs) {
  const article = getSeedArticleBySlug(slug);
  assert.ok(article, `missing ${slug}`);
  assert.equal(article!.coverImage, expectedCovers[slug], `${slug} cover mismatch`);
  assert.ok(article!.coverImage.includes("/social-moments/posters/"), `${slug} should use real Fitdog photo`);
  const words = article!.bodyMarkdown.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 1100, `${slug} too short: ${words}`);
  assert.ok(article!.bodyHtml.includes("<p>"));
  assert.ok(!startsWithGenericQuestion(article!.bodyMarkdown));
  const banned = findBannedPhrases(article!.bodyMarkdown);
  assert.equal(banned.length, 0, `${slug} contains banned phrases: ${banned.join(", ")}`);
  assert.ok(article!.coverImage.startsWith("/assets/"));
  assert.ok(article!.metaDescription.length <= 160);
}

const featured = INITIAL_BLOG_ARTICLES.filter((a) => a.featured);
assert.equal(featured.length, 1);
assert.equal(featured[0].slug, "how-to-keep-your-dog-safe-happy-summer-la");

const all = getSeedArticles();
assert.equal(all.length, 5);
const current = all[0];
const related = relatedArticles(current, all, 3);
assert.ok(related.every((item) => item.slug !== current.slug));
const neighbors = neighboringArticles(current, all);
assert.ok(neighbors.next || neighbors.previous);

assert.ok(all.every((article) => article.bodyHtml.includes("<p>") || article.bodyHtml.includes("<h2>")));
assert.ok(all.every((article) => (article.bodyHtml.match(/<h2/g) || []).length >= 3));
assert.ok(all.every((article) => (article.bodyHtml.match(/<p>/g) || []).length >= 8));

const sampleHtml = markdownToSimpleHtml(
  "## Heading one\n\nFirst paragraph.\n\nSecond paragraph.\n\n- Item one\n- Item two\n\n1. Step one\n2. Step two"
);
assert.ok(sampleHtml.includes("<h2>Heading one</h2>"));
assert.ok(sampleHtml.includes("<p>First paragraph.</p>"));
assert.ok(sampleHtml.includes("<p>Second paragraph.</p>"));
assert.ok(sampleHtml.includes("<ul><li>Item one</li><li>Item two</li></ul>"));
assert.ok(sampleHtml.includes("<ol><li>Step one</li><li>Step two</li></ol>"));
assert.equal(absoluteBlogUrl("/blog"), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/`);

console.log("test-fitdog-blog-public passed");
