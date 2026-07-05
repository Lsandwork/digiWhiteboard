import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  ROLE_PERMISSIONS,
  type RoleKey
} from "../lib/admin/permissions";
import { YARD_LINK_FEEDS } from "../lib/yard-links/config";
import { buildYouTubeEmbedUrl, isValidYouTubeVideoId } from "../lib/yard-links/youtube";

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as RoleKey[];

for (const role of ALL_ROLES) {
  const access = accessFromLegacyRole(`user-${role}`, `${role}@fitdog.test`, role);
  assert.equal(
    canAccessAdminTab(access, "yard_links", role, "staff"),
    true,
    `${role} should access Yard Links on staff board`
  );
  assert.equal(
    canAccessAdminTab(access, "yard_links", role, "lobby"),
    role !== "groomer" && role !== "team_leader",
    `${role} lobby yard_links access`
  );
}

assert.equal(isValidYouTubeVideoId("wK0m06yoW4Q"), true);
assert.equal(isValidYouTubeVideoId("o5rwgL1BKeQ"), true);
assert.equal(isValidYouTubeVideoId("bad id"), false);

const bigSideEmbed = buildYouTubeEmbedUrl("wK0m06yoW4Q");
assert.match(bigSideEmbed, /^https:\/\/www\.youtube\.com\/embed\/wK0m06yoW4Q\?/);
assert.match(bigSideEmbed, /autoplay=0/);
assert.match(bigSideEmbed, /mute=1/);
assert.match(bigSideEmbed, /playsinline=1/);
assert.match(bigSideEmbed, /rel=0/);

const smallSideEmbed = buildYouTubeEmbedUrl("o5rwgL1BKeQ");
assert.match(smallSideEmbed, /^https:\/\/www\.youtube\.com\/embed\/o5rwgL1BKeQ\?/);

assert.equal(YARD_LINK_FEEDS.length, 2);
assert.equal(YARD_LINK_FEEDS[0]?.title, "Big Side");
assert.equal(YARD_LINK_FEEDS[0]?.videoId, "wK0m06yoW4Q");
assert.equal(YARD_LINK_FEEDS[1]?.title, "Small Side");
assert.equal(YARD_LINK_FEEDS[1]?.videoId, "o5rwgL1BKeQ");
assert.match(YARD_LINK_FEEDS[0]?.fallbackUrl ?? "", /^https:\/\/www\.youtube\.com\//);
assert.match(YARD_LINK_FEEDS[1]?.fallbackUrl ?? "", /^https:\/\/www\.youtube\.com\//);

console.log("yard links tests passed");
