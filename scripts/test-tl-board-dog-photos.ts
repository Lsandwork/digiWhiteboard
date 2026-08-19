/**
 * Dog photos must always resolve to a real picture.
 *
 * Production bug: Sadie (animal 371) carried a Gingr Rackspace CDN URL that now
 * returns 404, and the board's only fallback (the same-origin proxy) was never
 * reachable, so the TV rendered a "?" placeholder.
 */
import assert from "node:assert/strict";
import {
  tlBoardAnimalPhotoProxyUrl,
  tlDogPhotoCandidates,
  tlPhotoNeedsRefresh
} from "../lib/tl-digi-board/animal-photos";
import {
  isAllowedGingrPhotoHost,
  isLegacyGingrPhotoUrl,
  toDisplayPhotoUrl
} from "../lib/gingr-photo-display";
import { extractPhotoUrl, extractPhotoUrls } from "../lib/board-utils";

const SADIE_LEGACY_URL =
  "https://fb6d0a6d23a849d1c466-0438edc1f642564f2e91bb5ba16ae196.ssl.cf5.rackcdn.com/2018/01/06/a5a4f92e8783065d775ea79610cc8b03.12.18+sadie.jpeg";
const MINNIE_GCS_URL =
  "https://storage.googleapis.com/gingr-app-user-uploads//2023/12/20/2826dd15-cbb6-455a-a012-7c8d80612fcc-Minnie.jpeg";

// Gingr's current photo host must be proxyable — it was missing from the allowlist.
{
  assert.equal(isAllowedGingrPhotoHost("storage.googleapis.com"), true);
  assert.equal(isAllowedGingrPhotoHost("fitdog.gingrapp.com"), true);
  assert.equal(
    isAllowedGingrPhotoHost("fb6d0a6d23a849d1c466-0438edc1f642564f2e91bb5ba16ae196.ssl.cf5.rackcdn.com"),
    true
  );
  assert.equal(isAllowedGingrPhotoHost("evil.example.com"), false);
  assert.equal(isAllowedGingrPhotoHost(""), false);
}

// The retired Rackspace CDN is recognized as dead.
{
  assert.equal(isLegacyGingrPhotoUrl(SADIE_LEGACY_URL), true);
  assert.equal(isLegacyGingrPhotoUrl(MINNIE_GCS_URL), false);
  assert.equal(isLegacyGingrPhotoUrl(null), false);
}

// Sadie: skip the dead URL, go straight to the self-healing proxy.
{
  const candidates = tlDogPhotoCandidates("371", SADIE_LEGACY_URL);
  assert.deepEqual(candidates, [tlBoardAnimalPhotoProxyUrl("371")]);
  assert.equal(candidates.includes(SADIE_LEGACY_URL), false, "dead CDN URL must never be rendered");
}

// Healthy URL renders directly, with the proxy retained as a fallback.
{
  const candidates = tlDogPhotoCandidates("4176", MINNIE_GCS_URL);
  assert.deepEqual(candidates, [MINNIE_GCS_URL, tlBoardAnimalPhotoProxyUrl("4176")]);
}

// No stored URL at all still yields a photo source.
{
  assert.deepEqual(tlDogPhotoCandidates("6648", null), [tlBoardAnimalPhotoProxyUrl("6648")]);
  assert.deepEqual(tlDogPhotoCandidates("6648", "   "), [tlBoardAnimalPhotoProxyUrl("6648")]);
}

// Candidates are unique, so exhausting them terminates instead of flip-flopping
// between two dead URLs forever (the old single-`failedSrc` render loop).
{
  for (const [animalId, url] of [
    ["371", SADIE_LEGACY_URL],
    ["4176", MINNIE_GCS_URL],
    ["999", null]
  ] as const) {
    const candidates = tlDogPhotoCandidates(animalId, url);
    assert.equal(new Set(candidates).size, candidates.length, "candidates must be unique");
    assert.ok(candidates.length >= 1, "every dog must have at least one photo source");
  }
}

// Server-side sync refreshes both missing and dead photo URLs.
{
  assert.equal(tlPhotoNeedsRefresh(null), true);
  assert.equal(tlPhotoNeedsRefresh(""), true);
  assert.equal(tlPhotoNeedsRefresh(SADIE_LEGACY_URL), true);
  assert.equal(tlPhotoNeedsRefresh(MINNIE_GCS_URL), false);
}

// A dead Rackspace URL in `image` must not shadow a live URL in another field.
{
  const record = {
    id: "371",
    image: SADIE_LEGACY_URL,
    profile_photo: MINNIE_GCS_URL
  };
  assert.equal(extractPhotoUrl(record), MINNIE_GCS_URL, "live URL must win over the dead CDN");

  const all = extractPhotoUrls(record);
  assert.ok(all.includes(SADIE_LEGACY_URL) && all.includes(MINNIE_GCS_URL));

  // Legacy is still returned when it is the only thing Gingr has, so the proxy
  // can try it rather than giving up outright.
  assert.equal(extractPhotoUrl({ id: "371", image: SADIE_LEGACY_URL }), SADIE_LEGACY_URL);
  assert.equal(extractPhotoUrl({ id: "1" }), null);
}

// Shared display helper routes legacy URLs through the proxy without `src`.
{
  const display = toDisplayPhotoUrl(SADIE_LEGACY_URL, "371");
  assert.equal(display, "/api/gingr/animal-photo/image?animalId=371");
  assert.ok(!display?.includes("src="), "dead CDN URL must not be handed back to the proxy");

  const healthy = toDisplayPhotoUrl(MINNIE_GCS_URL, "4176");
  assert.ok(healthy?.includes("animalId=4176"));
  assert.ok(healthy?.includes("src="));
}

console.log("test-tl-board-dog-photos: ok");
