import assert from "node:assert/strict";
import { isAllowedGingrPhotoUrl, isGingrHostedPhotoUrl, toDisplayPhotoUrl } from "../lib/gingr-photo-display";
import { createFreshLookupGate, fetchProxiedImage, sniffImageType } from "../lib/gingr-photo-proxy";

const GCS = "https://storage.googleapis.com/gingr-app-user-uploads/2024/01/abc.jpg";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HEIC = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);

// --- src allowlist: Gingr domain + Gingr's GCS bucket only.
assert.equal(isAllowedGingrPhotoUrl(GCS), true);
assert.equal(isAllowedGingrPhotoUrl("https://gingr-app-user-uploads.storage.googleapis.com/x.jpg"), true);
assert.equal(isAllowedGingrPhotoUrl("https://fitdog.gingrapp.com/uploads/x.jpg"), true);
for (const bad of [
  "https://storage.googleapis.com/attacker-bucket/x.svg",
  "https://attacker.s3.amazonaws.com/x.jpg",
  "https://d111.cloudfront.net/x.jpg",
  "https://lh3.googleusercontent.com/x",
  "https://gingrapp.com.evil.com/x.jpg",
  "https://evilgingrapp.com/x.jpg",
  "https://user:pass@fitdog.gingrapp.com/x.jpg",
  "https://fitdog.gingrapp.com:8443/x.jpg",
  "javascript:alert(1)",
  "file:///etc/passwd",
  "http://169.254.169.254/latest/meta-data/"
]) {
  assert.equal(isAllowedGingrPhotoUrl(bad), false, bad);
}

// Display routing: non-Gingr URLs are not sent through the proxy (they load directly as before).
assert.equal(isGingrHostedPhotoUrl("https://attacker.s3.amazonaws.com/x.jpg"), false);
assert.equal(toDisplayPhotoUrl("https://cdn.example.com/dog.jpg"), "https://cdn.example.com/dog.jpg");
assert.equal(toDisplayPhotoUrl(GCS), `/api/gingr/animal-photo/image?src=${encodeURIComponent(GCS)}`);
assert.ok(toDisplayPhotoUrl(GCS, "123")?.startsWith("/api/gingr/animal-photo/image?animalId=123&src="));

// --- Magic-byte sniffing.
assert.equal(sniffImageType(JPEG), "image/jpeg");
assert.equal(sniffImageType(PNG), "image/png");
assert.equal(sniffImageType(HEIC), "image/heic");
assert.equal(sniffImageType(SVG), null);

type Route = { status?: number; headers?: Record<string, string>; body?: Uint8Array };
function mockFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.redirect, "manual", "redirects are never followed automatically");
    const route = routes[url];
    if (!route) return new Response(null, { status: 404 });
    return new Response(route.body ? Buffer.from(route.body) : null, { status: route.status ?? 200, headers: route.headers });
  }) as typeof fetch;
  return { impl, calls };
}

async function main() {
  const opts = { maxBytes: 1024, timeoutMs: 2_000 };

  let mock = mockFetch({ [GCS]: { headers: { "content-type": "image/jpeg" }, body: JPEG } });
  assert.equal((await fetchProxiedImage(GCS, { ...opts, fetchImpl: mock.impl }))?.contentType, "image/jpeg");

  mock = mockFetch({ [GCS]: { body: PNG } });
  assert.equal((await fetchProxiedImage(GCS, { ...opts, fetchImpl: mock.impl }))?.contentType, "image/png", "missing type is sniffed");

  mock = mockFetch({ [GCS]: { headers: { "content-type": "image/svg+xml" }, body: SVG } });
  assert.equal(await fetchProxiedImage(GCS, { ...opts, fetchImpl: mock.impl }), null, "SVG rejected by type");

  mock = mockFetch({ [GCS]: { headers: { "content-type": "image/jpeg" }, body: SVG } });
  assert.equal(await fetchProxiedImage(GCS, { ...opts, fetchImpl: mock.impl }), null, "SVG disguised as JPEG rejected by bytes");

  mock = mockFetch({ [GCS]: { headers: { "content-type": "text/html" }, body: JPEG } });
  assert.equal(await fetchProxiedImage(GCS, { ...opts, fetchImpl: mock.impl }), null, "non-image type rejected");

  mock = mockFetch({ [GCS]: { headers: { "content-type": "image/jpeg" }, body: new Uint8Array(4096).fill(0xff) } });
  assert.equal(await fetchProxiedImage(GCS, { ...opts, fetchImpl: mock.impl }), null, "oversized body rejected");

  mock = mockFetch({ [GCS]: { headers: { "content-type": "image/jpeg", "content-length": "999999" }, body: JPEG } });
  assert.equal(await fetchProxiedImage(GCS, { ...opts, fetchImpl: mock.impl }), null, "oversized content-length rejected");

  const gingrUrl = "https://fitdog.gingrapp.com/photo/1";
  mock = mockFetch({
    [gingrUrl]: { status: 302, headers: { location: GCS } },
    [GCS]: { headers: { "content-type": "image/jpeg" }, body: JPEG }
  });
  assert.equal((await fetchProxiedImage(gingrUrl, { ...opts, fetchImpl: mock.impl }))?.contentType, "image/jpeg", "Gingr -> GCS redirect allowed");

  for (const target of [
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:3000/api/admin/users",
    "http://localhost/",
    "https://attacker.example.com/x.jpg",
    "https://storage.googleapis.com/attacker-bucket/x.jpg",
    "file:///etc/passwd"
  ]) {
    mock = mockFetch({ [gingrUrl]: { status: 302, headers: { location: target } } });
    assert.equal(await fetchProxiedImage(gingrUrl, { ...opts, fetchImpl: mock.impl }), null, `redirect to ${target} rejected`);
    assert.equal(mock.calls.length, 1, `redirect target ${target} never fetched`);
  }

  const loop = "https://fitdog.gingrapp.com/loop";
  mock = mockFetch({ [loop]: { status: 302, headers: { location: loop } } });
  assert.equal(await fetchProxiedImage(loop, { ...opts, fetchImpl: mock.impl }), null);
  assert.ok(mock.calls.length <= 4, "redirect chain bounded");

  mock = mockFetch({});
  assert.equal(await fetchProxiedImage("http://10.0.0.5/x.jpg", { ...opts, fetchImpl: mock.impl }), null);
  assert.equal(mock.calls.length, 0, "IP-literal start URLs are never fetched");

  // --- Fresh Gingr lookup gate (only ever reduces Gingr calls).
  const gate = createFreshLookupGate({ cooldownMs: 5 * 60_000, perMinute: 3 });
  const t0 = 1_000_000;
  assert.equal(gate("dog-1", t0), true);
  assert.equal(gate("dog-1", t0 + 1_000), false, "same dog within cooldown");
  assert.equal(gate("dog-1", t0 + 5 * 60_000 + 1), true, "cooldown expires");
  assert.equal(gate("dog-2", t0 + 5 * 60_000 + 2), true);
  assert.equal(gate("dog-3", t0 + 5 * 60_000 + 3), true);
  assert.equal(gate("dog-4", t0 + 5 * 60_000 + 4), false, "per-minute budget");
  assert.equal(gate("dog-4", t0 + 6 * 60_000 + 10), true, "budget refills");

  console.log("photo proxy security tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
