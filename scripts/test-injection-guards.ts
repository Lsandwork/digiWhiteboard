import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeSvgMarkup } from "../lib/card-studio/safe-markup";
import { serializeJsonLd } from "../lib/json-ld";
import { safeUrl } from "../lib/safe-url";

// --- JSON-LD cannot break out of its <script> tag.
const hostile = { headline: '</script><script>alert(document.cookie)</script>', note: "a & b \u2028 c" };
const serialized = serializeJsonLd(hostile);
assert.ok(!serialized.includes("</script"), "no closing script tag");
assert.ok(!serialized.includes("<"), "no raw <");
assert.deepEqual(JSON.parse(serialized), hostile, "still valid JSON with identical data");

for (const file of ["app/blog/[slug]/page.tsx", "app/blog/why-fitdog/page.tsx"]) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  assert.doesNotMatch(source, /__html:\s*JSON\.stringify/, `${file} uses serializeJsonLd`);
}

// --- Promotion CTA URLs: http(s)/relative only.
assert.equal(safeUrl("javascript:alert(1)", "/blog"), "/blog");
assert.equal(safeUrl("data:text/html,<script>alert(1)</script>", "/blog"), "/blog");
assert.equal(safeUrl("https://fitdog.com/offer", "/blog"), "https://fitdog.com/offer");
const blogPublic = readFileSync(join(process.cwd(), "lib/blog/content/public.ts"), "utf8");
assert.match(blogPublic, /ctaUrl: safeUrl\(data\.cta_url/);

// --- Card verify never interpolates the public token into a PostgREST .or() filter.
const cardStore = readFileSync(join(process.cwd(), "lib/card-studio/store.ts"), "utf8");
const verifyBody = cardStore
  .slice(cardStore.indexOf("export async function publicVerify"), cardStore.indexOf("export { signVerificationToken }"))
  .replace(/\/\/.*$/gm, "");
assert.doesNotMatch(verifyBody, /\.or\(/, "publicVerify uses .eq() only");
assert.match(verifyBody, /\.eq\(column, token\)/);

// --- Card Studio raw SVG markup.
assert.equal(safeSvgMarkup('<path d="M0 0L10 10Z" fill="#F37021"/>'), '<path d="M0 0L10 10Z" fill="#F37021"/>');
assert.equal(safeSvgMarkup('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'), '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>');
for (const bad of [
  "<script>alert(1)</script>",
  '<svg onload="alert(1)"></svg>',
  '<image href="x" onerror="alert(1)"/>',
  '<a href="javascript:alert(1)"><text>x</text></a>',
  '<a xlink:href="&#106;avascript:alert(1)">x</a>',
  "<foreignObject><iframe src=//evil></iframe></foreignObject>",
  '<set attributeName="onmouseover" to="alert(1)"/>',
  '<animate attributeName="href" values="javascript:alert(1)"/>',
  '<use href="data:image/svg+xml,..."/>',
  "<style>@import url(//evil)</style>",
  "<!DOCTYPE x>"
]) {
  assert.equal(safeSvgMarkup(bad), "", bad);
}
assert.equal(safeSvgMarkup(null), "");
assert.equal(safeSvgMarkup({ toString: () => "<script>" }), "");

console.log("injection guard tests passed");
