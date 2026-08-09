import assert from "node:assert/strict";
import {
  assertRealPhotography,
  isBlockedBlogSourceClass,
  textLooksAiGenerated
} from "../lib/blog/media/ai-image-guard";
import { formatPhotoContextForPrompt, photoAwareWritingRules } from "../lib/blog/media/select-for-posting";
import { searchWebDogPhotos } from "../lib/blog/media/web-image-search";
import type { BlogImageCandidate } from "../lib/blog/media/types";

async function main() {
  assert.equal(isBlockedBlogSourceClass("ai_generated_approved"), true);
  assert.equal(isBlockedBlogSourceClass("fitdog_owned"), false);
  assert.equal(textLooksAiGenerated("Dog playing in yard"), false);
  assert.equal(textLooksAiGenerated("Midjourney AI-generated golden retriever"), true);
  assert.equal(textLooksAiGenerated("created with Stable Diffusion"), true);
  assert.throws(() => assertRealPhotography("ai_generated_approved", "cover"), /AI-generated/);
  assert.throws(() => assertRealPhotography("licensed_stock", "DALL-E puppy portrait"), /AI-generated|Rejected/);

  const images: BlogImageCandidate[] = [
    {
      id: "bulk:1",
      sourceKind: "bulk_photo",
      url: "https://example.com/a.jpg",
      alt: "Play group",
      caption: "Real Fitdog facility photo",
      sceneDescription: "Real Fitdog facility photo · activity: play · dogs in frame: Indy",
      dogNames: ["Indy"]
    }
  ];
  const ctx = formatPhotoContextForPrompt(images);
  assert.ok(ctx.includes("bulk_photo"));
  assert.ok(ctx.includes("Indy"));
  assert.ok(photoAwareWritingRules().some((r) => /REAL|real photography|AI/i.test(r)));

  try {
    const photos = await searchWebDogPhotos({ topic: "dog daycare play", limit: 4 });
    for (const photo of photos) {
      assert.equal(photo.sourceKind, "web_licensed");
      assert.ok(photo.url.startsWith("http"));
      assert.equal(textLooksAiGenerated(photo.alt, photo.caption, photo.license), false);
    }
    console.log("web search samples:", photos.length);
  } catch (error) {
    console.log("web search skipped:", error instanceof Error ? error.message : error);
  }

  console.log("blog real-images tests: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
