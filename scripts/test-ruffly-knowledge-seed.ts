import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FITDOG_BOOKING } from "../lib/ruffly/knowledge/booking-links";
import { RUFFLY_STARTER_KNOWLEDGE_ARTICLES } from "../lib/ruffly/knowledge/starter-articles";

assert.ok(RUFFLY_STARTER_KNOWLEDGE_ARTICLES.length >= 6);
for (const article of RUFFLY_STARTER_KNOWLEDGE_ARTICLES) {
  assert.ok(article.title.trim());
  assert.ok(article.category.trim());
  assert.ok(article.content.includes("\n") || article.content.length > 80);
  assert.match(article.source, /^https?:\/\//);
}

const joined = RUFFLY_STARTER_KNOWLEDGE_ARTICLES.map((article) => article.content).join("\n");
assert.match(joined, new RegExp(FITDOG_BOOKING.assessmentUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(joined, /\$20/);
assert.match(joined, new RegExp(FITDOG_BOOKING.trainingConsultUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(joined, /consults are free/i);
assert.match(joined, new RegExp(FITDOG_BOOKING.clubSignupUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(joined, new RegExp(FITDOG_BOOKING.sportsSignupUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const api = readFileSync(resolve(__dirname, "../app/api/ruffly/knowledge/route.ts"), "utf8");
const panel = readFileSync(resolve(__dirname, "../components/ruffly/knowledge/RufflyKnowledgePanel.tsx"), "utf8");
assert.match(api, /seed_starter/);
assert.match(api, /customer_visible: true/);
assert.match(api, /status: "published"/);
assert.match(panel, /Import starter Fitdog articles/);

console.log(`Ruffly knowledge seed ready (${RUFFLY_STARTER_KNOWLEDGE_ARTICLES.length} articles).`);
