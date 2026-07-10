import type { SocialMoment } from "@/lib/lobby/social-moments";

export const SOCIAL_MOMENTS_PREFETCH_AHEAD = 3;

const blobUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function clipKey(clip: SocialMoment) {
  return clip.id;
}

export function getPrefetchedClipSrc(clip: SocialMoment) {
  return blobUrlCache.get(clipKey(clip)) ?? clip.src;
}

export function prefetchSocialMomentClip(clip: SocialMoment) {
  const key = clipKey(clip);
  if (blobUrlCache.has(key)) {
    return Promise.resolve(blobUrlCache.get(key) ?? null);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const response = await fetch(clip.src, { cache: "force-cache" });
      if (!response.ok) return null;
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(key, blobUrl);
      return blobUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export async function prefetchSocialMomentWindow(clips: readonly SocialMoment[], startIndex: number) {
  if (!clips.length) return;

  const tasks: Promise<string | null>[] = [];
  for (let offset = 0; offset <= SOCIAL_MOMENTS_PREFETCH_AHEAD; offset += 1) {
    const clip = clips[(startIndex + offset) % clips.length];
    if (clip) tasks.push(prefetchSocialMomentClip(clip));
  }

  await Promise.all(tasks);
}

export function releaseSocialMomentPrefetchCache() {
  for (const blobUrl of blobUrlCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  blobUrlCache.clear();
  inflight.clear();
}
