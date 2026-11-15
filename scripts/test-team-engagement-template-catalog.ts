/**
 * Team Engagement Template Library catalog integrity.
 * Run: npx tsx scripts/test-team-engagement-template-catalog.ts
 */
import assert from "node:assert/strict";
import { ENGAGEMENT_TEMPLATE_CATALOG } from "@/lib/team-engagement/template-catalog.generated";
import { ENGAGEMENT_TEMPLATE_KINDS, ENGAGEMENT_TEMPLATE_TABS } from "@/lib/team-engagement/template-types";
import { listUnresolvedPlaceholders } from "@/lib/team-engagement/template-personalization";

const slugs = new Set<string>();
for (const item of ENGAGEMENT_TEMPLATE_CATALOG) {
  assert.ok(item.slug.length > 2);
  assert.ok(item.titleTemplate.length > 0);
  assert.ok(item.messageTemplate.length > 0);
  assert.ok((ENGAGEMENT_TEMPLATE_TABS as readonly string[]).includes(item.tab));
  assert.ok((ENGAGEMENT_TEMPLATE_KINDS as readonly string[]).includes(item.kind));
  assert.equal(slugs.has(item.slug), false, `duplicate slug ${item.slug}`);
  slugs.add(item.slug);
}
assert.ok(ENGAGEMENT_TEMPLATE_CATALOG.length >= 120, "expected full library seed");

const bark = ENGAGEMENT_TEMPLATE_CATALOG.filter((item) => item.kind === "bark_out");
assert.ok(bark.length >= 15);
for (const item of bark) {
  assert.match(item.messageTemplate, /\[Employee Name\]/);
}

const unresolved = listUnresolvedPlaceholders("Hello [Employee Name]", "Thanks [Department]");
assert.deepEqual(unresolved, ["[Employee Name]", "[Department]"]);

console.log(`team-engagement-template-catalog: ok (${ENGAGEMENT_TEMPLATE_CATALOG.length} templates)`);