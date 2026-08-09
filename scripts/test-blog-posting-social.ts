import assert from "node:assert/strict";
import {
  nextHumanLikeSlot,
  recommendNextSlots,
  remainingPostsThisWeek,
  schedulerSettingsFromRow
} from "../lib/blog/scheduler/human-like-seo";
import {
  generateSocialPackDeterministic,
  itemsByPlatform,
  packItemToDownloadRow,
  toCsv
} from "../lib/blog/social/generate";
import { SOCIAL_BANNED_PHRASES, scrubSocialAiSlop } from "../lib/blog/social/voice";
import { PLATFORM_FORMATS, SOCIAL_PLATFORMS } from "../lib/blog/social/types";
import { encryptBlogSecret, decryptBlogSecret, hasEncryptedSecret } from "../lib/blog/crypto";
import { BLOG_NAV_PAGES } from "../lib/blog/constants";
import { BLOG_DASHBOARD_NAV } from "../lib/blog/dashboard-nav";

{
  const settings = schedulerSettingsFromRow({
    posts_per_week: 3,
    min_hours_between_posts: 20,
    schedule_jitter_min_minutes: 18,
    schedule_jitter_max_minutes: 45,
    quiet_hours_start: 20,
    quiet_hours_end: 7
  });
  assert.equal(settings.postsPerWeek, 3);
  assert.equal(remainingPostsThisWeek(1, 3), 2);

  const after = new Date("2026-08-10T15:00:00.000Z"); // Monday-ish
  const slot = nextHumanLikeSlot(after, settings, [], "test-seed-1");
  assert.ok(slot.at instanceof Date);
  assert.ok(slot.at.getTime() > after.getTime(), "slot must be in the future");
  assert.ok(slot.label.length > 5);

  const slots = recommendNextSlots(3, settings, after, []);
  assert.equal(slots.length, 3);
  assert.ok(slots[1]!.at.getTime() > slots[0]!.at.getTime());
}

{
  const pack = generateSocialPackDeterministic({
    topic: "first daycare drop-off",
    blogUrl: "https://blog.fitdog.com/first-daycare"
  });
  assert.ok(pack.items.length >= 8);
  const byPlatform = itemsByPlatform(pack.items);
  for (const platform of SOCIAL_PLATFORMS) {
    assert.ok(byPlatform[platform].length > 0, `${platform} must have content`);
    for (const fmt of PLATFORM_FORMATS[platform]) {
      assert.ok(
        byPlatform[platform].some((item) => item.format === fmt.format),
        `${platform} missing format ${fmt.format}`
      );
    }
  }
  const igStory = byPlatform.instagram.filter((i) => i.format === "story");
  const igFeed = byPlatform.instagram.filter((i) => i.format === "feed");
  assert.ok(igStory.length >= 1, "Instagram stories table");
  assert.ok(igFeed.length >= 1, "Instagram feed table");

  const joined = pack.items.map((i) => `${i.hook} ${i.body}`).join(" ");
  for (const phrase of ["furry friend", "paw-some", "In today's fast-paced world"]) {
    assert.equal(joined.toLowerCase().includes(phrase.toLowerCase()), false, `banned: ${phrase}`);
  }
  assert.ok(/tell your dog we said hi/i.test(joined), "signature line present");

  const csv = toCsv(pack.items.map(packItemToDownloadRow));
  assert.ok(csv.includes("platform,format,hook"));
  assert.ok(csv.split("\n").length > 5);
}

{
  assert.ok(SOCIAL_BANNED_PHRASES.length > 5);
  assert.equal(scrubSocialAiSlop("Hello furry friend today"), "Hello today");
}

{
  const enc = encryptBlogSecret("super-secret-token");
  assert.ok(hasEncryptedSecret(enc));
  assert.equal(decryptBlogSecret(enc), "super-secret-token");
  assert.equal(decryptBlogSecret({}), null);
}

{
  const ids = BLOG_NAV_PAGES.map((p) => p.id);
  assert.ok(ids.includes("social-generator"));
  assert.ok(ids.includes("posting-analytics"));
  const navIds = BLOG_DASHBOARD_NAV.flatMap((s) => s.items.map((i) => i.id));
  assert.ok(navIds.includes("social-generator"));
  assert.ok(navIds.includes("posting-analytics"));
}

console.log("blog posting + social tests: ok");
