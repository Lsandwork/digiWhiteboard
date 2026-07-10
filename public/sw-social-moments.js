const CACHE_VERSION = "fitdog-social-moments-v2";
const ASSET_PREFIX = "/assets/fitdog/social-moments/";
const MANIFEST_URL = "/assets/fitdog/social-moments/social-moments.manifest.json";

function isSocialMomentAsset(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.startsWith(ASSET_PREFIX);
  } catch {
    return false;
  }
}

async function cacheUrls(cache, urls) {
  await Promise.all(
    urls.map(async (assetUrl) => {
      try {
        const cached = await cache.match(assetUrl);
        if (cached) return;
        const response = await fetch(assetUrl, { cache: "reload" });
        if (response.ok) {
          await cache.put(assetUrl, response);
        }
      } catch {
        // Skip individual asset failures; playback falls back to network.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const manifestResponse = await fetch(MANIFEST_URL, { cache: "reload" });
        if (manifestResponse.ok) {
          await cache.put(MANIFEST_URL, manifestResponse.clone());
          const manifest = await manifestResponse.json();
          const posterUrls = (manifest.clips ?? []).map((clip) => clip.poster).filter(Boolean);
          await cacheUrls(cache, posterUrls);
        }
      } catch {
        // Posters and clips will populate on demand.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("fitdog-social-moments-") && key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "PRECACHE_SOCIAL_MOMENTS") return;

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const urls = Array.isArray(data.urls) ? data.urls.filter((url) => typeof url === "string") : [];
      await cacheUrls(cache, urls);
      const client = event.source;
      if (client && "postMessage" in client) {
        client.postMessage({ type: "SOCIAL_MOMENTS_PRECACHED", count: urls.length });
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isSocialMomentAsset(request.url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })()
  );
});
