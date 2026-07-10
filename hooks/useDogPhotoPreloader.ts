"use client";

import { useEffect } from "react";
import { buildCastOptimizedDogPhotoUrl, markDogPhotoLoaded } from "@/lib/dog-photo-display-cache";

const preloadedPhotoUrls = new Set<string>();

export function useDogPhotoPreloader(
  photoUrls: Array<string | null | undefined>,
  options: { enabled?: boolean; debugBoard?: boolean; width?: number } = {}
) {
  const { enabled = true, debugBoard = false, width = 384 } = options;
  const cacheKey = photoUrls.filter(Boolean).join("|");

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const urls = photoUrls
      .map((url) => url?.trim())
      .filter((url): url is string => Boolean(url))
      .map((url) => buildCastOptimizedDogPhotoUrl(url, width))
      .filter((url) => !preloadedPhotoUrls.has(url));

    if (!urls.length) return;

    let cancelled = false;

    for (const url of urls) {
      preloadedPhotoUrls.add(url);
      const image = new window.Image();
      image.decoding = "async";
      image.onload = () => {
        markDogPhotoLoaded(url);
        if (debugBoard && !cancelled) {
          console.info("[fitdog-cast:dog-photo] preloaded", url);
        }
      };
      image.onerror = () => {
        if (debugBoard && !cancelled) {
          console.info("[fitdog-cast:dog-photo] preload failed", url);
        }
      };
      image.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [cacheKey, debugBoard, enabled, photoUrls, width]);
}
