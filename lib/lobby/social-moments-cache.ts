import { SOCIAL_MOMENTS } from "@/lib/lobby/social-moments";

const SW_URL = "/sw-social-moments.js";
const SW_SCOPE = "/";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function getSocialMomentAssetUrls() {
  const urls = new Set<string>();
  for (const clip of SOCIAL_MOMENTS) {
    urls.add(clip.src);
    urls.add(clip.poster);
  }
  urls.add("/assets/fitdog/social-moments/social-moments.manifest.json");
  return [...urls];
}

export function registerSocialMomentsCacheServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { scope: SW_SCOPE })
      .catch(() => null);
  }

  return registrationPromise;
}

export async function precacheSocialMomentsPlaylist() {
  const registration = await registerSocialMomentsCacheServiceWorker();
  if (!registration) return false;

  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;

  const urls = getSocialMomentAssetUrls();
  worker.postMessage({ type: "PRECACHE_SOCIAL_MOMENTS", urls });
  return true;
}

export function warmSocialMomentsNetworkCache() {
  if (typeof window === "undefined") return;

  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;

  void precacheSocialMomentsPlaylist();

  window.setTimeout(() => {
    for (const clip of SOCIAL_MOMENTS) {
      void fetch(clip.src, { cache: "force-cache" }).catch(() => {});
    }
  }, 1500);
}
