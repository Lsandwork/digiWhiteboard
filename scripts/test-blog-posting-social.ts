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
  toCsv,
  toTxt
} from "../lib/blog/social/generate";
import { SOCIAL_BANNED_PHRASES, scrubSocialAiSlop } from "../lib/blog/social/voice";
import { funnyHooksForTopic, matchSocialTopic, SOCIAL_GENERATOR_TOPICS } from "../lib/blog/social/topics";
import { PLATFORM_FORMATS, SOCIAL_PLATFORMS } from "../lib/blog/social/types";
import { encryptBlogSecret, decryptBlogSecret, hasEncryptedSecret } from "../lib/blog/crypto";
import { BLOG_NAV_PAGES } from "../lib/blog/constants";
import { BLOG_DASHBOARD_NAV } from "../lib/blog/dashboard-nav";
import { readFileSync } from "node:fs";
import path from "node:path";

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
    blogUrl: "https://blog.fitdog.com/first-daycare",
    images: [
      {
        id: "bulk:test-1",
        sourceKind: "bulk_photo",
        url: "https://example.com/bulk-jasper.jpg",
        alt: "Jasper in the big yard",
        caption: "Real Fitdog facility photo",
        sceneDescription: "Real Fitdog facility photo · activity: play · area: big yard · dogs in frame: Jasper",
        dogNames: ["Jasper"],
        yard: "big",
        category: "play",
        license: "Fitdog-owned"
      },
      {
        id: "openverse:abc",
        sourceKind: "web_licensed",
        url: "https://example.com/licensed-dog.jpg",
        alt: "Dog at park",
        caption: "Licensed web photograph",
        sceneDescription: "Licensed web photograph (not AI-generated)",
        license: "cc0",
        photographer: "Jane Doe"
      }
    ]
  });
  assert.ok(pack.items.length >= 8);
  assert.ok(pack.voiceNotes.some((n) => /REAL PHOTOS ONLY/i.test(n)));
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
  assert.ok(igFeed[0]?.imageUrl?.includes("bulk-jasper"), "feed uses bulk photo URL");
  assert.ok(/jasper/i.test(`${igFeed[0]?.hook || ""}\n${igFeed[0]?.body || ""}`), "copy mentions pictured dog");
  assert.ok(/real/i.test(igFeed[0]?.visualDirection || ""), "visual direction marks real photo");

  const joined = pack.items.map((i) => `${i.hook}\n${i.body}`).join("\n");
  for (const phrase of ["furry friend", "paw-some", "In today's fast-paced world"]) {
    assert.equal(joined.toLowerCase().includes(phrase.toLowerCase()), false, `banned: ${phrase}`);
  }
  // Smart Fitdog recipe markers
  assert.ok(/after 16 years/i.test(joined), "years lesson present");
  assert.ok(/our (dogs|regulars|guests)|the (dogs|group chat|committee|new kid)/i.test(joined), "dog dialogue present");
  assert.ok(/\?/.test(joined), "engagement question present");
  assert.ok(igFeed[0]?.hashtags.includes("Fitdog"), "Fitdog hashtag");
  assert.ok(igFeed[0]?.hashtags.includes("DogsofLA"), "DogsofLA hashtag");
  assert.ok(/\n\n/.test(igFeed[0]?.body || ""), "feed body keeps paragraph breaks");

  const summer = generateSocialPackDeterministic({
    topic: "Daycare regulars living their life",
    angle: "Summer heat no problem we got ac"
  });
  const summerFeed = summer.items.find((i) => i.platform === "instagram" && i.format === "feed");
  assert.ok(/summer in santa monica/i.test(summerFeed?.hook || ""), "summer opener");
  assert.ok(/turn the ac up/i.test(summerFeed?.hook || ""), "dog dialogue from gold standard");
  assert.ok(/play hard\. cool off\. repeat/i.test(summerFeed?.body || ""), "three-beat line");
  assert.ok(/sunbather|ac addict/i.test(summerFeed?.body || ""), "binary question");

  const csv = toCsv(pack.items.map(packItemToDownloadRow));
  assert.ok(csv.includes("platform,format,hook"));
  assert.ok(csv.includes("imageUrl"));
  assert.ok(csv.includes("https://example.com/bulk-jasper.jpg"));
  assert.ok(csv.split("\n").length > 5);
  const txt = toTxt(pack.items.map(packItemToDownloadRow));
  assert.ok(txt.includes("IMAGE_URL:"));
  assert.ok(txt.includes("INSTAGRAM"));
  assert.ok(/#Fitdog/.test(txt), "download includes hashtag marks");
}

{
  assert.ok(SOCIAL_GENERATOR_TOPICS.length >= 12, "topic picker needs a real catalog");
  const picked = funnyHooksForTopic("First daycare drop-off");
  assert.ok(picked.length >= 4);
  assert.ok(picked.some((hook) => /snack review/i.test(hook)));
  assert.equal(matchSocialTopic("first day nerves at dropoff")?.id, "first-dropoff");
  const typedMatch = funnyHooksForTopic("summer heat in santa monica ac");
  assert.ok(typedMatch.some((hook) => /thermostat|ac up|climate control/i.test(hook)));
  const custom = funnyHooksForTopic("tuxedo dinner party for corgis");
  assert.ok(custom.length >= 3, "typed-in topics still get clickable hooks");
  assert.ok(custom.some((hook) => /tuxedo dinner party/i.test(hook)));
  assert.deepEqual(funnyHooksForTopic("   "), []);
  assert.equal(funnyHooksForTopic("").length, 0);
  assert.equal(funnyHooksForTopic(null).length, 0);

  const spin = "The new kid: “I’ll allow this… pending snack review.”";
  const packWithSpin = generateSocialPackDeterministic({
    topic: "First daycare drop-off",
    angle: spin
  });
  const feedWithSpin = packWithSpin.items.find((item) => item.platform === "instagram" && item.format === "feed");
  assert.ok(/pending snack review/i.test(feedWithSpin?.hook || ""), "clicked hook must land in generated copy");

  const panelSrc = readFileSync(
    path.join("components/blog/panels/BlogSocialGeneratorPanel.tsx"),
    "utf8"
  );
  assert.ok(panelSrc.includes("SOCIAL_GENERATOR_TOPICS"), "topic chips in the generator UI");
  assert.ok(panelSrc.includes("Super funny optional spin"), "spin field appears after a topic");
  assert.ok(panelSrc.includes("Optional hooks"), "clickable hooks in the generator UI");
  assert.ok(panelSrc.includes("blog-dash-callout"), "spin panel uses a light high-contrast callout");
  assert.equal(panelSrc.includes("bg-[var(--fitdog-surface"), false, "must not use dark admin surface token");
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
