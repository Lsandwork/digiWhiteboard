"use client";

import { useEffect, useState } from "react";
import { getRememberedDogPhoto, rememberStableDogPhoto } from "@/lib/dog-photo-display-cache";

const resolvedAnimalIds = new Set<string>();
const pendingFetches = new Map<string, Promise<string | null>>();
const PHOTO_RETRY_DELAYS_MS = [0, 2500, 5000] as const;

function photoCacheKey(animalId: string) {
  return `animal:${animalId.trim()}`;
}

async function fetchAnimalPhotoOnce(animalId: string) {
  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return null;

  const cacheKey = photoCacheKey(trimmedAnimalId);
  const remembered = getRememberedDogPhoto(cacheKey);
  if (remembered) return remembered;

  if (resolvedAnimalIds.has(trimmedAnimalId)) {
    return getRememberedDogPhoto(cacheKey);
  }

  const pending = pendingFetches.get(trimmedAnimalId);
  if (pending) return pending;

  const request = fetch(`/api/gingr/animal-photo?animalId=${encodeURIComponent(trimmedAnimalId)}`, {
    cache: "no-store"
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as { photo_url?: string | null };
      const photoUrl = body.photo_url?.trim() || null;
      if (photoUrl) {
        rememberStableDogPhoto(cacheKey, photoUrl);
        resolvedAnimalIds.add(trimmedAnimalId);
      }
      return photoUrl;
    })
    .catch(() => null)
    .finally(() => {
      pendingFetches.delete(trimmedAnimalId);
    });

  pendingFetches.set(trimmedAnimalId, request);
  return request;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function fetchAnimalPhotoWithRetry(animalId: string, isCancelled: () => boolean) {
  for (const delayMs of PHOTO_RETRY_DELAYS_MS) {
    if (isCancelled()) return null;
    if (delayMs) await wait(delayMs);
    if (isCancelled()) return null;

    const photoUrl = await fetchAnimalPhotoOnce(animalId);
    if (photoUrl) return photoUrl;
  }
  return null;
}

/** One safe client fetch per animal per page load when the server did not supply a photo. */
export function useDogPhotoFallback(animalId: string | null | undefined, initialUrl: string | null | undefined) {
  const cacheKey = animalId?.trim() ? photoCacheKey(animalId) : null;
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => {
    const incoming = initialUrl?.trim() || null;
    if (incoming && cacheKey) rememberStableDogPhoto(cacheKey, incoming);
    return incoming || (cacheKey ? getRememberedDogPhoto(cacheKey) : null);
  });

  useEffect(() => {
    let cancelled = false;
    const applyPhotoUrl = (nextUrl: string) => {
      if (!cancelled) setPhotoUrl(nextUrl);
    };
    const applyOnNextTask = (nextUrl: string) => {
      const timer = window.setTimeout(() => applyPhotoUrl(nextUrl), 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    };

    const incoming = initialUrl?.trim() || null;
    if (incoming) {
      if (cacheKey) rememberStableDogPhoto(cacheKey, incoming);
      return applyOnNextTask(incoming);
    }

    if (cacheKey) {
      const remembered = getRememberedDogPhoto(cacheKey);
      if (remembered) {
        return applyOnNextTask(remembered);
      }
    }

    const trimmedAnimalId = animalId?.trim();
    if (!trimmedAnimalId) return;

    void fetchAnimalPhotoWithRetry(trimmedAnimalId, () => cancelled).then((nextUrl) => {
      if (nextUrl) applyPhotoUrl(nextUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [animalId, cacheKey, initialUrl]);

  return photoUrl;
}
