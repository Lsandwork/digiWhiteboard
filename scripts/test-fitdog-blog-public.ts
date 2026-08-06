import assert from "node:assert/strict";
import { FITDOG_BLOG_NAV, FITDOG_BLOG_ORANGE, FITDOG_FOOTER_SERVICES, FITDOG_PUBLIC_URLS } from "../lib/blog/brand";
import { INITIAL_BLOG_ARTICLES, INITIAL_BLOG_CATEGORIES } from "../lib/blog/content/initial-articles";
import { getSeedArticleBySlug, getSeedArticles, relatedArticles, neighboringArticles } from "../lib/blog/content/public";
import { findBannedPhrases, startsWithGenericQuestion } from "../lib/blog/editorial/banned-phrases";

assert.equal(FITDOG_BLOG_ORANGE, "#ff6f26");
assert.ok(FITDOG_BLOG_NAV.some((item) => item.label === "Blog" && item.href === "/blog"));
assert.ok(!FITDOG_BLOG_NAV.some((item) => item.href === "#"));
assert.ok(FITDOG_FOOTER_SERVICES.every((item) => item.href.startsWith("http")));
assert.ok(FITDOG_PUBLIC_URLS.instagram.includes("instagram.com"));

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

console.log("test-fitdog-blog-public passed");
